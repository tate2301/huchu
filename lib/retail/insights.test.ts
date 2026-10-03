import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { daysOfCover, insightWindow, profitOf, relativeChange, salesTotals } from "./insights";

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

  it("works out days of cover at the period's rate, and has none for what does not sell", () => {
    // 30 sold in 30 days is one a day; 14 on hand lasts 14 days.
    expect(daysOfCover(14, 30, 30)).toBe(14);
    expect(daysOfCover(14, 0, 30)).toBeNull();
  });

  it("compares with the period before, and not with nothing", () => {
    expect(relativeChange(110, 100)).toBeCloseTo(0.1, 10);
    expect(relativeChange(5, 0)).toBeNull();
    // US$17,000 against US$90 is an empty month, not a 18,000% rise.
    expect(relativeChange(17_000, 90)).toBeNull();
    expect(relativeChange(17_000, 9_000)).toBeCloseTo(0.889, 3);
  });

  it("puts the period before right behind this one", () => {
    const { from, to, before } = insightWindow(30, new Date("2026-10-03T12:00:00Z"));
    expect(to.getTime() - from.getTime()).toBe(30 * 86_400_000);
    expect(from.getTime() - before.getTime()).toBe(30 * 86_400_000);
  });
});
