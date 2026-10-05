import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { insightWindow, profitOf, relativeChange, salesHeat, salesTable, salesTotals, tradingHours, weekdaysIn } from "./insights";

const d = (value: number) => new Prisma.Decimal(value);
const line = (quantity: number, lineTotal: number, taxAmount: number, costTotal: number) => ({
  quantity: d(quantity),
  lineTotal: d(lineTotal),
  taxAmount: d(taxAmount),
  costTotal: d(costTotal),
});

describe("the figures Insights is built from", () => {
  it("counts a refund against the takings and a void against the baskets", () => {
    const totals = salesTotals([
      { saleType: "SALE", totalAmount: d(12), lines: [line(10, 12, 1.57, 8.5)] },
      { saleType: "SALE", totalAmount: d(6), lines: [line(2, 6, 0.78, 4)] },
      { saleType: "REFUND", totalAmount: d(-1.2), lines: [line(-1, -1.2, -0.16, -0.85)] },
      { saleType: "VOID", totalAmount: d(-6), lines: [line(-2, -6, -0.78, -4)] },
    ]);
    expect(totals.takings).toBeCloseTo(10.8, 10);
    expect(totals.baskets).toBe(1);
    expect(totals.items).toBe(12);
  });

  it("takes VAT out before it measures profit, refunds included", () => {
    // 12.00 incl. 1.57 VAT is 10.43 of sales; less 8.50 of cost is 1.93.
    const profit = profitOf([line(10, 12, 1.57, 8.5), line(-1, -1.2, -0.16, -0.85)]);
    expect(profit.revenue).toBeCloseTo(9.39, 10);
    expect(profit.cost).toBeCloseTo(7.65, 10);
    expect(profit.profit).toBeCloseTo(1.74, 10);
    expect(profit.margin).toBeCloseTo(1.74 / 9.39, 10);
  });

  it("compares with the period before, and not with nothing", () => {
    expect(relativeChange(110, 100)).toBeCloseTo(0.1, 10);
    expect(relativeChange(5, 0)).toBeNull();
    // US$17,000 against US$90 is an empty month, not a 18,000% rise.
    expect(relativeChange(17_000, 90)).toBeNull();
    expect(relativeChange(17_000, 9_000)).toBeCloseTo(0.889, 3);
  });

  it("puts the period before right behind this one", () => {
    const window = insightWindow("30d", new Date("2026-10-03T12:00:00Z"));
    expect(window.to.getTime() - window.from.getTime()).toBe(30 * 86_400_000);
    expect(window.from.getTime() - window.before.getTime()).toBe(30 * 86_400_000);
    expect(window.beforeTo).toEqual(window.from);
    expect(window.compareWords).toBe("Compared with the 30 days before");
    expect(window.beforeNote).toBe("on the 30 days before");
    expect(window.words).toBe("last 30 days");
    expect(insightWindow("7d", new Date("2026-10-03T12:00:00Z")).compareWords).toBe("Compared with the 7 days before");
  });

  it("starts today at the shop's midnight and compares it with yesterday to the same time", () => {
    // 14:42 in Harare is 12:42 UTC.
    const now = new Date("2026-10-03T12:42:00Z");
    const window = insightWindow("today", now);
    expect(window.from.toISOString()).toBe("2026-10-02T22:00:00.000Z");
    expect(window.before.toISOString()).toBe("2026-10-01T22:00:00.000Z");
    expect(window.beforeTo.toISOString()).toBe("2026-10-02T12:42:00.000Z");
    expect(window.compareWords).toBe("Compared with the day before");
    expect(window.words).toBe("today");
  });

  it("runs this month from the 1st and compares it with last month to the same day", () => {
    const now = new Date("2026-10-03T12:42:00Z");
    const window = insightWindow("month", now);
    expect(window.from.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(window.before.toISOString()).toBe("2026-08-31T22:00:00.000Z");
    expect(window.beforeTo.getTime() - window.before.getTime()).toBe(now.getTime() - window.from.getTime());
    expect(window.compareWords).toBe("Compared with the month before");
    expect(window.short).toBe("this month");
  });
});

describe("Sales: when do we sell", () => {
  const hours = { weekdayOpensAt: "08:00", weekdayClosesAt: "22:00", sundayOpensAt: "10:00", sundayClosesAt: "18:00" };

  it("draws the trading hours, earliest opening to latest closing, and shuts what is closed", () => {
    const trading = tradingHours(hours);
    expect(trading.hours).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
    expect(trading.isOpen("Fri", 21)).toBe(true);
    expect(trading.isOpen("Sun", 9)).toBe(false);
    expect(trading.isOpen("Sun", 10)).toBe(true);
    expect(trading.isOpen("Sun", 17)).toBe(true);
    expect(trading.isOpen("Sun", 18)).toBe(false);
  });

  it("counts each weekday the window touches by the shop's calendar", () => {
    const counts = weekdaysIn(new Date("2026-09-03T12:42:00Z"), new Date("2026-10-03T12:42:00Z"));
    // 3 September to 3 October: 31 dates, five Thursdays, Fridays and Saturdays.
    expect([...counts.values()].reduce((sum, value) => sum + value, 0)).toBe(31);
    expect(counts.get("Sat")).toBe(5);
    expect(counts.get("Mon")).toBe(4);
  });

  it("averages a cell over the days of that weekday, and leaves a shut hour empty", () => {
    const from = new Date("2026-09-19T22:00:00Z"); // Sunday 20 September, 00:00 in Harare
    const to = new Date("2026-10-03T22:00:00Z"); // two whole weeks
    const sale = (iso: string, total: number) => ({ postedAt: new Date(iso), createdAt: new Date(iso), totalAmount: d(total) });
    const chart = salesHeat(
      [sale("2026-10-02T16:10:00Z", 30), sale("2026-09-25T16:40:00Z", 10), sale("2026-09-27T12:05:00Z", 8)],
      { from, to, period: "7d" },
      hours,
    );
    expect(chart.rows).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(chart.columns[0]).toBe("08");
    expect(chart.columns.at(-1)).toBe("21");
    // Two Fridays at 18:00 took 40: 20 a day.
    expect(chart.values[4][chart.columns.indexOf("18")]).toBe(20);
    // Sunday 14:00 took 8 over two Sundays.
    expect(chart.values[6][chart.columns.indexOf("14")]).toBe(4);
    expect(chart.values[6][chart.columns.indexOf("08")]).toBeNull();
    expect(chart.values[6][chart.columns.indexOf("20")]).toBeNull();
    expect(chart.values[0][0]).toBe(0);
  });

  it("draws one row for today", () => {
    const chart = salesHeat([], { from: new Date("2026-10-02T22:00:00Z"), to: new Date("2026-10-03T12:42:00Z"), period: "today" }, hours);
    expect(chart.rows).toEqual(["Sat"]);
  });
});

describe("Sales: the tables", () => {
  const table = salesTable({
    id: "category",
    label: "By category",
    noun: ["category", "categories"],
    column: "Category",
    now: new Map([
      ["spirits", { name: "Spirits", takings: 30, baskets: 2 }],
      ["beer", { name: "Beer", takings: 70, baskets: 5 }],
      ["wine", { name: "Wine", takings: 0, baskets: 0 }],
    ]),
    then: new Map([
      ["beer", 50],
      ["spirits", 40],
    ]),
    total: { takings: 100, baskets: 6 },
    totalBefore: 90,
  });

  it("puts the most takings first, with the share and the change on before", () => {
    expect(table.rows.map((row) => row.cells.name)).toEqual(["Beer", "Spirits", "Wine"]);
    expect(table.rows[0].cells.share).toEqual({ value: 0.7, format: "percent" });
    expect(table.rows[0].cells.change).toEqual({ value: 0.4, format: "percent", tone: "good" });
    expect(table.rows[1].cells.change).toEqual({ value: -0.25, format: "percent", tone: "bad" });
    expect(table.rows[2].cells.change).toBe("New");
    expect(table.columns.map((column) => column.label)).toEqual(["Category", "Takings", "Share", "Against before", "Baskets"]);
  });

  it("adds a Σ row with all the baskets, not the sum of the rows", () => {
    expect(table.total?.label).toBe("Σ 3 categories");
    expect(table.total?.cells.takings).toEqual({ value: 100, format: "money" });
    expect(table.total?.cells.share).toBe("100%");
    expect(table.total?.cells.baskets).toEqual({ value: 6, format: "count" });
    expect((table.total?.cells.change as { value: number }).value).toBeCloseTo(0.111, 3);
  });

  it("has no Σ row and says so when nothing sold", () => {
    const empty = salesTable({
      id: "till",
      label: "By till",
      noun: ["till", "tills"],
      column: "Till",
      now: new Map(),
      then: new Map(),
      total: { takings: 0, baskets: 0 },
      totalBefore: 0,
    });
    expect(empty.total).toBeNull();
    expect(empty.empty).toBe("No sales in these dates.");
  });
});
