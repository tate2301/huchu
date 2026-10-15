/**
 * Reports → Insights → Site visits (PageInsightVisits), and a form's own
 * insights in Build: one site-visit form's visits (`formInsights`) shaped
 * into the insight page. Pure: the page fetches, this words and arranges.
 */
import type { FormInsights } from "@/lib/crm/site-visits/insights";

type Money = (value: number) => string;

const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
const pct = (part: number, whole: number) => (whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`);
const figure = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 1 });
const monthOf = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

type Question = FormInsights["questions"][number];

/** Answered (or marked not applicable), of the visits it was asked on. A question never asked counts as answered. */
export function answeredShare(question: Question): number {
  return question.asked ? (question.answered + question.notApplicable) / question.asked : 1;
}

/** The question left blank most often, of those answered on fewer than every visit. */
export function weakestQuestion(insights: FormInsights): Question | null {
  return [...insights.questions].sort((a, b) => answeredShare(a) - answeredShare(b)).find((question) => question.asked > 0 && answeredShare(question) < 1) ?? null;
}

/** The finding: what the visits came to, then the question most left blank. */
export function visitsFinding(insights: FormInsights): { fact: string; rest: string } {
  const fact = `${plural(insights.visits, "visit")} drafted ${plural(insights.drafted, "quote")} and ${plural(insights.won, "win")}${
    insights.since ? ` since ${monthOf(insights.since)}` : ""
  }.`;
  const weakest = weakestQuestion(insights);
  const missing = weakest ? weakest.asked - weakest.answered - weakest.notApplicable : 0;
  const rest = weakest
    ? `Reps skip ${weakest.label} on ${missing} of ${plural(weakest.asked, "visit")}${weakest.feedsQuote ? ", and the quote counts on it" : ""}.`
    : "Every question is answered on every visit.";
  return { fact, rest };
}

/** The four figures: measured a visit, quote drafted, visits that drafted one, won. */
export function visitsFigures(insights: FormInsights, money: Money) {
  const { figures } = insights;
  return [
    {
      label: "Measured a visit",
      value: figures.measuredPerVisit === null ? "—" : `${figure(figures.measuredPerVisit)} ${figures.measureUnit}`.trim(),
      note: "typical",
    },
    { label: "Quote drafted", value: figures.draftedPerVisit === null ? "—" : money(figures.draftedPerVisit), note: "typical" },
    { label: "Visits that drafted a quote", value: pct(insights.drafted, insights.visits), note: `${insights.drafted} of ${insights.visits}` },
    {
      label: "Won",
      value: pct(insights.won, insights.visits),
      note: `${insights.won} of ${insights.visits}`,
      tone: insights.won > 0 ? ("success" as const) : undefined,
    },
  ];
}

/** Where reps stop answering: each question, answered of the visits it was asked on; under 75% is marked. */
export function answerBars(insights: FormInsights) {
  return insights.questions.map((question) => {
    const share = answeredShare(question);
    return {
      id: question.key,
      label: question.label,
      share,
      text: question.asked ? `${Math.round(share * 100)}%` : "—",
      tone: question.asked && share < 0.75 ? ("warning" as const) : null,
    };
  });
}

type Cell = { text: string; tone?: "success" | "danger" | "warning" | "muted" | null };

/** "What is won, by Subfloor"; a question asked as a question is quoted: "…, by the answer to “What is it used for?”". */
export function breakdownTitle(question: string): string {
  return question.trim().endsWith("?") ? `What is won, by the answer to “${question.trim()}”` : `What is won, by ${question.trim()}`;
}

/** What is won, by the form's first pick-one: visits, won, win rate and what each measured. The best and worst rates are marked. */
export function breakdownTable(insights: FormInsights) {
  const breakdown = insights.breakdown;
  const unit = breakdown?.unit ?? "";
  const rows = breakdown?.rows ?? [];
  const rated = rows.filter((row) => row.visits > 0).map((row) => row.won / row.visits);
  const best = rated.length > 1 ? Math.max(...rated) : null;
  const worst = rated.length > 1 ? Math.min(...rated) : null;
  // Every row and the total to one place, so 104.0 sits over 82.2.
  const measured = (value: number | null) => (value === null ? "—" : value.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  return {
    title: breakdown ? breakdownTitle(breakdown.question) : null,
    table: {
      id: "answer",
      label: "By answer",
      columns: [
        { id: "answer", label: "Answer" },
        { id: "visits", label: "Visits", num: true },
        { id: "won", label: "Won", num: true },
        { id: "rate", label: "Win rate", num: true },
        { id: "measured", label: unit ? `${unit} a visit` : "Measured a visit", num: true },
      ],
      rows: rows.map((row) => {
        const rate = row.visits ? row.won / row.visits : null;
        return {
          id: row.answer,
          muted: row.blank === true,
          cells: {
            answer: { text: row.answer },
            visits: { text: String(row.visits) },
            won: { text: String(row.won) },
            rate: {
              text: pct(row.won, row.visits),
              tone: rate !== null && best !== null && best !== worst ? (rate === best ? "success" : rate === worst ? "danger" : null) : null,
            },
            measured: { text: measured(row.measuredPerVisit) },
          } satisfies Record<string, Cell>,
        };
      }),
      total: rows.length
        ? {
            label: "Total",
            cells: {
              visits: { text: String(insights.visits) },
              won: { text: String(insights.won) },
              rate: { text: pct(insights.won, insights.visits) },
              measured: { text: measured(insights.figures.measuredPerVisit) },
            } satisfies Record<string, Cell>,
          }
        : null,
      empty: "This form has no pick-one question to break the visits down by.",
    },
  };
}

export type VisitCard = {
  key: string;
  title: string;
  body: string;
  action: "form" | "answers" | "visits";
};

/**
 * Do something about it: the question worth requiring, the question answered
 * least (and how often the visits that answered it were won), and the visits
 * that never drafted a quote.
 */
export function visitsCards(insights: FormInsights): VisitCard[] {
  const cards: VisitCard[] = [];
  const suggestion = insights.suggestion;
  if (suggestion) {
    cards.push({
      key: "require",
      title: `Make ${suggestion.label} required`,
      body: `${plural(suggestion.missing, "visit")} went without it, and it decides what is quoted. Requiring it holds the visit until it is answered.`,
      action: "form",
    });
  }
  const weakest = [...insights.questions]
    .filter((question) => question.key !== suggestion?.key && question.asked > 0 && answeredShare(question) < 1)
    .sort((a, b) => answeredShare(a) - answeredShare(b))[0];
  if (weakest) {
    const share = Math.round(answeredShare(weakest) * 100);
    cards.push({
      key: "weakest",
      title: `${weakest.label} is answered on ${share}%`,
      body:
        weakest.answered > 0
          ? `Visits that answered it were won ${pct(weakest.wonWhenAnswered, weakest.answered)} of the time, against ${pct(insights.won, insights.visits)} overall.`
          : "No visit has answered it yet.",
      action: "answers",
    });
  }
  if (insights.undrafted.count > 0) {
    const top = insights.undrafted.byRep[0];
    cards.push({
      key: "undrafted",
      title: `${plural(insights.undrafted.count, "visit")} never drafted a quote`,
      body: top
        ? insights.undrafted.byRep.length === 1
          ? `All of them are ${top.rep}’s.`
          : `${top.rep} has ${top.count} of them.`
        : "",
      action: "visits",
    });
  }
  return cards;
}
