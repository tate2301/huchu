/**
 * Site visits as the insight page words them: the finding, the figures, the
 * bars, the breakdown and what to do about it.
 */
import { describe, expect, it } from "vitest";

import type { FormInsights } from "@/lib/crm/site-visits/insights";
import { answerBars, breakdownTable, breakdownTitle, visitsCards, visitsFigures, visitsFinding } from "@/lib/reports/insight-visits";
import { insightMoney } from "@/lib/reports/week-insights";

const insights: FormInsights = {
  visits: 86,
  since: "2026-07-02",
  drafted: 71,
  won: 42,
  questions: [
    { key: "areas", label: "Room areas", asked: 86, answered: 86, notApplicable: 0, feedsQuote: true, wonWhenAnswered: 42 },
    { key: "subfloor", label: "Subfloor", asked: 86, answered: 68, notApplicable: 0, feedsQuote: true, wonWhenAnswered: 36 },
    { key: "budget", label: "Customer’s budget", asked: 86, answered: 50, notApplicable: 0, feedsQuote: false, wonWhenAnswered: 31 },
  ],
  breakdown: {
    question: "Subfloor",
    unit: "m²",
    rows: [
      { answer: "Concrete", visits: 46, won: 24, measuredPerVisit: 31.2 },
      { answer: "Timber boards", visits: 18, won: 10, measuredPerVisit: 35.8 },
      { answer: "Not answered", visits: 22, won: 8, measuredPerVisit: 33.1, blank: true },
    ],
  },
  figures: { measuredPerVisit: 32.5, measureUnit: "m²", draftedPerVisit: 1180 },
  suggestion: { key: "subfloor", label: "Subfloor", missing: 18 },
  undrafted: { count: 9, byRep: [{ rep: "Kuda", count: 5 }, { rep: "Tinashe", count: 4 }] },
};

describe("the site visits insight", () => {
  it("opens with what the visits came to, then the question reps skip most", () => {
    expect(visitsFinding(insights)).toEqual({
      fact: "86 visits drafted 71 quotes and 42 wins since July 2026.",
      rest: "Reps skip Customer’s budget on 36 of 86 visits.",
    });
  });

  it("draws the four figures the board does", () => {
    expect(visitsFigures(insights, insightMoney).map((figure) => [figure.label, figure.value, figure.note])).toEqual([
      ["Measured a visit", "32.5 m²", "typical"],
      ["Quote drafted", "$1,180.00", "typical"],
      ["Visits that drafted a quote", "83%", "71 of 86"],
      ["Won", "49%", "42 of 86"],
    ]);
  });

  it("marks a question answered on fewer than three visits in four", () => {
    expect(answerBars(insights).map((bar) => [bar.label, bar.text, bar.tone])).toEqual([
      ["Room areas", "100%", null],
      ["Subfloor", "79%", null],
      ["Customer’s budget", "58%", "warning"],
    ]);
  });

  it("breaks the visits down by the answer, best and worst rates marked, totalled over every visit", () => {
    const { title, table } = breakdownTable(insights);
    expect(title).toBe("What is won, by Subfloor");
    expect(table.rows.map((row) => [row.cells.answer.text, row.cells.rate.text, row.cells.rate.tone, row.muted])).toEqual([
      ["Concrete", "52%", null, false],
      ["Timber boards", "56%", "success", false],
      ["Not answered", "36%", "danger", true],
    ]);
    expect(table.total?.cells).toMatchObject({ visits: { text: "86" }, won: { text: "42" }, rate: { text: "49%" }, measured: { text: "32.5" } });
    expect(breakdownTitle("What is the area used for?")).toBe("What is won, by the answer to “What is the area used for?”");
  });

  it("asks for the question worth requiring, the one answered least, and the visits with no quote", () => {
    expect(visitsCards(insights)).toEqual([
      expect.objectContaining({ key: "require", title: "Make Subfloor required", action: "form" }),
      expect.objectContaining({
        key: "weakest",
        title: "Customer’s budget is answered on 58%",
        body: "Visits that answered it were won 62% of the time, against 49% overall.",
        action: "answers",
      }),
      expect.objectContaining({ key: "undrafted", title: "9 visits never drafted a quote", body: "Kuda has 5 of them.", action: "visits" }),
    ]);
  });
});
