/**
 * Reports → Insights (ReportsInsights): the week's insights across the
 * workspace's modules. Each is a finding, the figures behind it, the
 * question it ran (which opens the report), and Pin to the board.
 *
 * Insights store nothing of their own. Where Vane has written the week's
 * insights they are its INSIGHT items (headline, body, what it read). Where
 * it has not, they are worked out here from the rows of the reports the
 * person can open, each time the page is read. Either way they are views
 * over report rows, and nothing here writes.
 *
 * Pure: the server loads the rows and the items, this words and ranks.
 */
import type { LibraryInsights } from "@/lib/library/insights";
import type { ReportRow, ReportValue } from "@/lib/reports/types";

export type InsightBar = { label: string; share: number; text: string; key: boolean };

export type WeekInsight = {
  id: string;
  /** The Vane item it is, so Not useful can mute it; null for one worked out from the rows. */
  vaneItemId: string | null;
  headline: string;
  body: string;
  bars: InsightBar[];
  /** The question it ran: "decided leads by source, 9 rows", opening the report as it read it. */
  question: { words: string; href: string } | null;
  /** The act it proposes, when there is one: "Break it down". */
  action: { label: string; href: string } | null;
  /** What Pin to the board adds: the report's rows, broken down by `by`. */
  pin: { reportKey: string; title: string; by: string | null } | null;
};

export type WeekInsights = {
  source: "vane" | "rows";
  finding: { fact: string; rest: string };
  /** "Every Monday, 06:00": when Vane writes the week's insights (Management → Vane). */
  schedule: string;
  /** The board Pin adds to, when the workspace chose one and this person can change it. */
  board: { id: string; title: string } | null;
  insights: WeekInsight[];
  /** Corelith's insights from the library this person may run; the page runs them in their tab (`lib/library/insights.ts`). */
  library: LibraryInsights;
};

export type RecipeInput = {
  key: string;
  rows: ReportRow[];
  /** The report's address with its rows grouped by a column, as the question opens it. */
  hrefGroupedBy: (column: string | null) => string;
};

type Money = (value: number) => string;

const dollars = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Money as the insights write it: "$1,180.00", "−$12.00". */
export function insightMoney(value: number): string {
  return `${value < 0 ? "−" : ""}$${dollars.format(Math.abs(value))}`;
}

const text = (value: ReportValue | undefined): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const number = (value: ReportValue | undefined): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const pct = (share: number) => `${Math.round(share * 100)}%`;
const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
const rowsWords = (count: number) => plural(count, "row");

/** A list said the way a sentence says it: "a, b and c". */
export function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Fewer decided than this in a group and its rate says more about chance than the group. */
const ENOUGH = 3;

/**
 * Won most often, by a column (leads or deals by source): of the decided
 * records in each group, the share won. Needs two groups with enough decided.
 */
export function wonMostOftenBy(
  input: RecipeInput,
  { column, noun, nouns, outcome, columnWords }: { column: string; noun: string; nouns: string; outcome: string; columnWords: string },
): WeekInsight | null {
  const groups = new Map<string, { won: number; decided: number; all: number }>();
  let all = 0;
  for (const row of input.rows) {
    const group = text(row[column]);
    if (!group) continue;
    all += 1;
    const entry = groups.get(group) ?? { won: 0, decided: 0, all: 0 };
    entry.all += 1;
    const state = text(row[outcome])?.toLowerCase();
    if (state === "won") {
      entry.won += 1;
      entry.decided += 1;
    } else if (state === "lost") entry.decided += 1;
    groups.set(group, entry);
  }
  const rated = [...groups]
    .filter(([, entry]) => entry.decided >= ENOUGH)
    .map(([label, entry]) => ({ label, rate: entry.won / entry.decided, ...entry }))
    .sort((a, b) => b.rate - a.rate || b.decided - a.decided || a.label.localeCompare(b.label));
  if (rated.length < 2) return null;
  const best = rated[0]!;
  const worst = rated[rated.length - 1]!;
  if (best.rate === worst.rate) return null;
  const largest = [...groups].sort((a, b) => b[1].all - a[1].all || a[0].localeCompare(b[0]))[0]!;
  const decided = rated.reduce((sum, entry) => sum + entry.decided, 0);
  const shown = rated.slice(0, 5);
  return {
    id: `won-by-${column}:${input.key}`,
    vaneItemId: null,
    headline: `${nouns[0]!.toUpperCase()}${nouns.slice(1)} from ${best.label} are won most often.`,
    body:
      // Against the next best, so no group sits unspoken between the two; the least too when it is another.
      `${pct(best.rate)} of decided ${nouns} from ${best.label} were won, against ${pct(rated[1]!.rate)} from ${rated[1]!.label}` +
      (rated.length > 2 ? ` and ${pct(worst.rate)} from ${worst.label}.` : ".") +
      (largest[0] !== best.label ? ` ${largest[0]} brings in the most: ${largest[1].all} of ${plural(all, noun)}.` : ""),
    bars: shown.map((entry) => ({ label: entry.label, share: entry.rate, text: pct(entry.rate), key: entry === best })),
    question: { words: `decided ${nouns} by ${columnWords}, ${rowsWords(decided)}`, href: input.hrefGroupedBy(null) },
    action: { label: "Break it down", href: input.hrefGroupedBy(column) },
    pin: { reportKey: input.key, title: `${nouns[0]!.toUpperCase()}${nouns.slice(1)} won, by ${columnWords}`, by: column },
  };
}

/** The largest wins, by who won them (deals by owner): the average value of each owner's won deals. */
export function largestWinsBy(input: RecipeInput, money: Money, { column, columnWords }: { column: string; columnWords: string }): WeekInsight | null {
  const groups = new Map<string, { won: number; value: number }>();
  for (const row of input.rows) {
    if (text(row.status)?.toLowerCase() !== "won") continue;
    const who = text(row[column]);
    if (!who) continue;
    const entry = groups.get(who) ?? { won: 0, value: 0 };
    entry.won += 1;
    entry.value += number(row.value);
    groups.set(who, entry);
  }
  const ranked = [...groups]
    .map(([label, entry]) => ({ label, average: entry.value / entry.won, won: entry.won }))
    .sort((a, b) => b.average - a.average || a.label.localeCompare(b.label));
  if (ranked.length < 2 || ranked[0]!.average <= 0) return null;
  const [top, ...rest] = ranked;
  const most = [...ranked].sort((a, b) => b.won - a.won || a.label.localeCompare(b.label))[0]!;
  const shown = ranked.slice(0, 5);
  const others = rest.slice(0, 3).map((entry) => `${money(entry.average)} for ${entry.label}`);
  return {
    id: `largest-by-${column}:${input.key}`,
    vaneItemId: null,
    headline: `${top!.label}’s won deals are the largest.`,
    body:
      `${money(top!.average)} on average, against ${listWords(others)}.` +
      (most.label !== top!.label ? ` ${most.label} wins the most deals.` : ""),
    bars: shown.map((entry) => ({ label: entry.label, share: entry.average / top!.average, text: money(entry.average), key: entry === top })),
    question: { words: `won deals by ${columnWords}, ${rowsWords(ranked.reduce((sum, entry) => sum + entry.won, 0))}`, href: input.hrefGroupedBy(column) },
    action: null,
    pin: { reportKey: input.key, title: `Won deals, by ${columnWords}`, by: column },
  };
}

/** Why deals are lost, when one reason stands out: the share of lost deals that give it. */
export function lostBecause(input: RecipeInput): WeekInsight | null {
  const reasons = new Map<string, number>();
  let lost = 0;
  for (const row of input.rows) {
    if (text(row.status)?.toLowerCase() !== "lost") continue;
    lost += 1;
    const reason = text(row.lostReason);
    if (reason) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  const ranked = [...reasons].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = ranked[0];
  if (!top || lost < ENOUGH || top[1] / lost < 0.4) return null;
  const given = ranked.reduce((sum, [, count]) => sum + count, 0);
  return {
    id: `lost-because:${input.key}`,
    vaneItemId: null,
    headline: top[1] === lost ? "Every lost deal gives the same reason." : `${pct(top[1] / lost)} of lost deals give the same reason.`,
    body:
      top[1] === lost
        ? `“${top[0]}”, on all ${plural(lost, "lost deal")}.`
        : `“${top[0]}”, on ${top[1]} of ${plural(lost, "lost deal")}${given < lost ? `; ${lost - given} ${lost - given === 1 ? "gives" : "give"} none` : ""}.`,
    bars: ranked.slice(0, 4).map(([label, count], index) => ({ label, share: count / lost, text: String(count), key: index === 0 })),
    question: { words: `lost deals by reason, ${rowsWords(lost)}`, href: input.hrefGroupedBy("lostReason") },
    action: null,
    pin: { reportKey: input.key, title: "Lost deals, by reason", by: "lostReason" },
  };
}

/** Site visits that drafted no quote, by rep, when there are any. */
export function visitsWithoutQuote(input: RecipeInput): WeekInsight | null {
  const reps = new Map<string, number>();
  let none = 0;
  for (const row of input.rows) {
    if (number(row.drafted) > 0) continue;
    none += 1;
    const rep = text(row.rep) ?? "No rep";
    reps.set(rep, (reps.get(rep) ?? 0) + 1);
  }
  if (none < ENOUGH) return null;
  const ranked = [...reps].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [top] = ranked;
  return {
    id: `visits-without-quote:${input.key}`,
    vaneItemId: null,
    headline: `${plural(none, "site visit")} drafted no quote.`,
    body:
      ranked.length === 1
        ? `All of them are ${top![0]}’s, out of ${plural(input.rows.length, "visit")}.`
        : `${top![0]} has ${top![1]} of them, out of ${plural(input.rows.length, "visit")}.`,
    bars: ranked.slice(0, 4).map(([label, count], index) => ({ label, share: count / top![1], text: String(count), key: index === 0 })),
    question: { words: `visits with no quote, ${rowsWords(none)}`, href: input.hrefGroupedBy("rep") },
    action: { label: "Open the visits", href: input.hrefGroupedBy("rep") },
    pin: { reportKey: input.key, title: "Visits, by rep", by: "rep" },
  };
}

/**
 * The recipes each report feeds, in the order the page lists what they find.
 * Only the reports the person can open are read.
 */
export const RECIPE_REPORTS = ["crm-leads", "crm-deals", "crm-visit-forms"] as const;

export function workedOutInsights(inputs: RecipeInput[], money: Money): WeekInsight[] {
  const found: Array<WeekInsight | null> = [];
  for (const input of inputs) {
    if (input.key === "crm-leads") {
      found.push(wonMostOftenBy(input, { column: "source", noun: "lead", nouns: "leads", outcome: "stage", columnWords: "source" }));
    }
    if (input.key === "crm-deals") {
      found.push(wonMostOftenBy(input, { column: "source", noun: "deal", nouns: "deals", outcome: "status", columnWords: "source" }));
      found.push(largestWinsBy(input, money, { column: "owner", columnWords: "owner" }));
      found.push(lostBecause(input));
    }
    if (input.key === "crm-visit-forms") found.push(visitsWithoutQuote(input));
  }
  return found.filter((insight): insight is WeekInsight => insight !== null);
}

/* ── Vane's own ──────────────────────────────────────────────────────────── */

export type VaneInsightItem = {
  id: string;
  headline: string;
  body: string;
  action: unknown;
  readFrom: unknown;
};

/**
 * An insight Vane wrote: its headline and body, what it read (the report and
 * its rows, which open it), and its proposal when it names a page.
 */
export function insightFromVaneItem(item: VaneInsightItem, reportTitle: (key: string) => string | null): WeekInsight {
  const read = Array.isArray(item.readFrom) ? (item.readFrom[0] as Record<string, unknown> | undefined) : undefined;
  const template = typeof read?.template === "string" ? read.template : null;
  const rows = typeof read?.rows === "number" ? read.rows : null;
  const title = template ? reportTitle(template) : null;
  const action = (item.action ?? {}) as Record<string, unknown>;
  const target = typeof action.target === "string" && action.target.startsWith("/") ? action.target : null;
  const label = typeof action.label === "string" ? action.label : null;
  return {
    id: `vane:${item.id}`,
    vaneItemId: item.id,
    headline: item.headline,
    body: item.body,
    bars: [],
    question:
      template && title
        ? { words: `${title.toLowerCase()}${rows !== null ? `, ${rowsWords(rows)}` : ""}`, href: `/reports/${encodeURIComponent(template)}` }
        : null,
    action: target && label ? { label, href: target } : null,
    pin: template && title ? { reportKey: template, title: item.headline.replace(/\.$/, ""), by: null } : null,
  };
}

/* ── The page's words ────────────────────────────────────────────────────── */

const DAYS: Record<string, string> = { MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday", SAT: "Saturday", SUN: "Sunday" };

/** "MON 06:00" → "Every Monday, 06:00"; "DAY 06:00" → "Every day, 06:00". */
export function scheduleWords(schedule: string | null | undefined): string {
  const [day, time] = (schedule ?? "MON 06:00").trim().split(/\s+/);
  const when = day === "DAY" ? "day" : (DAYS[day ?? ""] ?? "Monday");
  return `Every ${when}, ${time && /^\d{2}:\d{2}$/.test(time) ? time : "06:00"}`;
}

/** The sentence the page opens with: what was read, and how many things stand out. */
export function weekFinding(source: "vane" | "rows", read: string[], count: number): { fact: string; rest: string } {
  const what = listWords(read.map((title) => title.toLowerCase()));
  if (source === "vane") {
    return { fact: `Vane read last week’s ${what || "reports"}.`, rest: count === 1 ? "1 thing stood out." : `${count} things stood out.` };
  }
  return {
    fact: `From the reports on ${what || "this workspace"}.`,
    rest: count === 0 ? "Nothing stands out yet." : count === 1 ? "1 thing stands out." : `${count} things stand out.`,
  };
}
