/** Sales as the insight page words it, from the sales report. */
import { describe, expect, it } from "vitest";

import { funnelBars, groupTable, salesCards, salesFigures, salesFinding, salesIsEmpty, type SalesReport } from "@/lib/reports/insight-sales";
import { insightMoney } from "@/lib/reports/week-insights";

const stage = (key: string, reached: number, previous: number, total: number) => ({
  key,
  label: key,
  reached,
  value: reached * 1000,
  shareOfTotal: reached / total,
  conversionFromPrevious: previous ? reached / previous : 1,
  droppedFromPrevious: previous ? previous - reached : 0,
});

const report: SalesReport = {
  scope: "TEAM",
  funnel: [stage("Discovery", 20, 0, 20), stage("Quoted", 18, 20, 20), stage("Won", 6, 18, 20)],
  counts: { won: 6, lost: 6, open: 8 },
  winRate: 0.5,
  medianCycleDays: 46.5,
  forecast: { weighted: 294038, unweighted: 781500, count: 8, estimated: 5 },
  byOwner: [
    { key: "a", label: "Farai", won: 4, lost: 2, open: 3, wonValue: 4000, openValue: 3000, total: 9, winRate: 4 / 6, averageWonValue: 1000 },
    { key: "b", label: "Kuda", won: 2, lost: 4, open: 5, wonValue: 1500, openValue: 2000, total: 11, winRate: 2 / 6, averageWonValue: 750 },
  ],
  bySource: [],
  trend: { granularity: "week", won: [] },
  activity: [],
  leads: { created: 54, converted: 0 },
};

describe("the sales insight", () => {
  it("opens with the deals won of those decided, then where most are lost", () => {
    expect(salesFinding(report, insightMoney)).toEqual({ fact: "6 of 12 decided deals won, 50%.", rest: "Most stop before Won: 12 of the 18 that reached Quoted have not got there." });
  });

  it("draws win rate, forecast, time to close and leads converted", () => {
    expect(salesFigures(report, insightMoney).map((figure) => [figure.label, figure.value, figure.note])).toEqual([
      ["Win rate", "50%", "6 of 12"],
      ["Weighted forecast", "$294,038.00", "of $781,500.00 open"],
      ["Time to close", "47 days", "typical"],
      ["Leads converted", "0%", "0 of 54"],
    ]);
  });

  it("marks the stage deals leak before", () => {
    expect(funnelBars(report.funnel).map((bar) => [bar.label, bar.text, bar.tone])).toEqual([
      ["Discovery", "100%", null],
      ["Quoted", "90%", null],
      ["Won", "30%", "warning"],
    ]);
  });

  it("totals the owners under the table", () => {
    const table = groupTable("owner", report.byOwner, insightMoney);
    expect(table.total?.cells).toMatchObject({ won: { text: "6" }, lost: { text: "6" }, rate: { text: "50%" }, wonValue: { text: "$5,500.00" } });
  });

  it("asks about the leak, the deals with no likelihood and the leads nobody converted", () => {
    expect(salesCards(report).map((card) => card.title)).toEqual([
      "Deals stop before Won",
      "5 open deals with no likelihood",
      "54 leads not turned into a deal",
    ]);
    expect(salesIsEmpty({ ...report, counts: { won: 0, lost: 0, open: 0 } })).toBe(true);
  });
});
