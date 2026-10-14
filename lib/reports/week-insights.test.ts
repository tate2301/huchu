/**
 * Reports → Insights: what the rows of the reports say when Vane has written
 * nothing, Vane's own insights as the page shows them, and the page's words.
 */
import { describe, expect, it } from "vitest";

import {
  insightFromVaneItem,
  insightMoney,
  largestWinsBy,
  listWords,
  lostBecause,
  scheduleWords,
  visitsWithoutQuote,
  weekFinding,
  wonMostOftenBy,
  workedOutInsights,
  type RecipeInput,
} from "@/lib/reports/week-insights";
import type { ReportRow } from "@/lib/reports/types";

const input = (key: string, rows: Array<Record<string, string | number | null>>): RecipeInput => ({
  key,
  rows: rows.map((row, index) => ({ id: String(index), ...row }) as ReportRow),
  hrefGroupedBy: (column) => (column ? `/reports/${key}?by=${column}` : `/reports/${key}`),
});

const leads = (source: string, won: number, lost: number, open = 0) => [
  ...Array.from({ length: won }, () => ({ source, stage: "Won" })),
  ...Array.from({ length: lost }, () => ({ source, stage: "Lost" })),
  ...Array.from({ length: open }, () => ({ source, stage: "Qualified" })),
];

describe("won most often, by source", () => {
  const rows = input("crm-leads", [...leads("Referral", 6, 2), ...leads("Website", 3, 6, 8), ...leads("Walk-in", 1, 1)]);
  const insight = wonMostOftenBy(rows, { column: "source", noun: "lead", nouns: "leads", outcome: "stage", columnWords: "source" })!;

  it("names the group won most often against the one won least, among those with enough decided", () => {
    expect(insight.headline).toBe("Leads from Referral are won most often.");
    // Walk-in has only two decided, too few to rate.
    expect(insight.body).toBe("75% of decided leads from Referral were won, against 33% from Website. Website brings in the most: 17 of 27 leads.");
    expect(insight.bars.map((bar) => [bar.label, bar.text, bar.key])).toEqual([
      ["Referral", "75%", true],
      ["Website", "33%", false],
    ]);
  });

  it("opens the report as it read it, breaks it down by the column, and pins that breakdown", () => {
    expect(insight.question).toEqual({ words: "decided leads by source, 17 rows", href: "/reports/crm-leads" });
    expect(insight.action).toEqual({ label: "Break it down", href: "/reports/crm-leads?by=source" });
    expect(insight.pin).toEqual({ reportKey: "crm-leads", title: "Leads won, by source", by: "source" });
  });

  it("says nothing with one group, or when every group is won alike", () => {
    expect(wonMostOftenBy(input("crm-leads", leads("Referral", 4, 4)), { column: "source", noun: "lead", nouns: "leads", outcome: "stage", columnWords: "source" })).toBeNull();
    expect(
      wonMostOftenBy(input("crm-leads", [...leads("A", 2, 2), ...leads("B", 3, 3)]), { column: "source", noun: "lead", nouns: "leads", outcome: "stage", columnWords: "source" }),
    ).toBeNull();
  });
});

describe("the largest wins, by owner", () => {
  const deal = (owner: string, status: string, value: number) => ({ owner, status, value });
  const rows = input("crm-deals", [
    deal("Farai", "Won", 1000),
    deal("Farai", "Won", 979.94),
    deal("Kuda", "Won", 943.24),
    deal("Tinashe", "Won", 800),
    deal("Tinashe", "Won", 912),
    deal("Tinashe", "Won", 856),
    deal("Tinashe", "Lost", 5000),
  ]);

  it("compares the average won value, and names who wins the most when that is someone else", () => {
    const insight = largestWinsBy(rows, insightMoney, { column: "owner", columnWords: "owner" })!;
    expect(insight.headline).toBe("Farai’s won deals are the largest.");
    expect(insight.body).toBe("$989.97 on average, against $943.24 for Kuda and $856.00 for Tinashe. Tinashe wins the most deals.");
    expect(insight.question?.words).toBe("won deals by owner, 6 rows");
  });
});

describe("why deals are lost", () => {
  it("speaks when one reason accounts for most lost deals", () => {
    const rows = input("crm-deals", [
      ...Array.from({ length: 4 }, () => ({ status: "Lost", lostReason: "Went with an incumbent supplier" })),
      { status: "Lost", lostReason: "Price" },
      { status: "Lost", lostReason: null },
      { status: "Won", lostReason: null },
    ]);
    const insight = lostBecause(rows)!;
    expect(insight.headline).toBe("67% of lost deals give the same reason.");
    expect(insight.body).toBe("“Went with an incumbent supplier”, on 4 of 6 lost deals; 1 gives none.");
  });

  it("is quiet when the reasons are spread", () => {
    const rows = input("crm-deals", ["A", "B", "C", "D"].map((reason) => ({ status: "Lost", lostReason: reason })));
    expect(lostBecause(rows)).toBeNull();
  });
});

describe("site visits that drafted no quote", () => {
  it("counts them and names the rep with the most", () => {
    const rows = input("crm-visit-forms", [
      { rep: "Kuda", drafted: 0 },
      { rep: "Kuda", drafted: 0 },
      { rep: "Tinashe", drafted: 0 },
      { rep: "Tinashe", drafted: 1200 },
    ]);
    const insight = visitsWithoutQuote(rows)!;
    expect(insight.headline).toBe("3 site visits drafted no quote.");
    expect(insight.body).toBe("Kuda has 2 of them, out of 4 visits.");
  });
});

describe("the week's insights from the rows", () => {
  it("reads each report for its own recipes and keeps only what stands out", () => {
    const found = workedOutInsights(
      [input("crm-leads", [...leads("Referral", 6, 2), ...leads("Website", 3, 6)]), input("crm-deals", [{ status: "Won", owner: "Farai", value: 10 }])],
      insightMoney,
    );
    expect(found.map((insight) => insight.id)).toEqual(["won-by-source:crm-leads"]);
  });
});

describe("Vane's own insight", () => {
  it("keeps its words and opens the report it read", () => {
    const insight = insightFromVaneItem(
      {
        id: "v1",
        headline: "Monday's cash-up was short for the third time since August.",
        body: "Each time on Till 1, in the morning shift.",
        action: { type: "open", label: "Show the sales", target: "/retail/sales" },
        readFrom: [{ template: "crm-deals", filters: {}, rows: 3 }],
      },
      (key) => (key === "crm-deals" ? "Deals" : null),
    );
    expect(insight).toMatchObject({
      vaneItemId: "v1",
      question: { words: "deals, 3 rows", href: "/reports/crm-deals" },
      action: { label: "Show the sales", href: "/retail/sales" },
      pin: { reportKey: "crm-deals", by: null },
    });
  });

  it("offers no question or pin when what it read is not a report", () => {
    const insight = insightFromVaneItem({ id: "v2", headline: "H", body: "B", action: {}, readFrom: [] }, () => null);
    expect(insight).toMatchObject({ question: null, action: null, pin: null });
  });
});

describe("the page's words", () => {
  it("writes the schedule as the top bar does", () => {
    expect(scheduleWords("MON 06:00")).toBe("Every Monday, 06:00");
    expect(scheduleWords("FRI 17:30")).toBe("Every Friday, 17:30");
    expect(scheduleWords(null)).toBe("Every Monday, 06:00");
  });

  it("says what was read and how much stood out", () => {
    expect(weekFinding("vane", ["Site visit forms", "Deals"], 3)).toEqual({ fact: "Vane read last week’s site visit forms and deals.", rest: "3 things stood out." });
    expect(weekFinding("rows", ["Leads", "Deals"], 1)).toEqual({ fact: "From the reports on leads and deals.", rest: "1 thing stands out." });
    expect(listWords(["a", "b", "c"])).toBe("a, b and c");
  });

  it("writes money with the dollar sign and a true minus", () => {
    expect(insightMoney(1180)).toBe("$1,180.00");
    expect(insightMoney(-12)).toBe("−$12.00");
  });
});
