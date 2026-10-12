import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { balance, spendPoints } from "./ledger";
import { LOYALTY_DEFAULTS } from "./settings";
import { LoyaltyRefusal, pointsValue, spendRefusal, spreadPointsDiscount } from "./spend";
import { dropLoyaltyShops, ledgerRow, loyaltyShop, testSale } from "./test-fixtures";

const made: string[] = [];
afterAll(() => dropLoyaltyShops(made));

const ask = (overrides: Partial<Parameters<typeof spendRefusal>[0]> = {}) =>
  spendRefusal({
    enabled: true,
    customer: { name: "Tapiwa Marange", balance: 3021 },
    points: 500,
    spendFrom: 500,
    pointValue: 0.01,
    payable: 21.4,
    ...overrides,
  });

describe("spending points at the till", () => {
  it("refuses in the till's words", () => {
    expect(ask()).toBeNull();
    expect(ask({ enabled: false })).toBe("Loyalty is off.");
    expect(ask({ customer: null })).toBe("Pick the customer first.");
    expect(ask({ points: 300, customer: { name: "Tapiwa Marange", balance: 320 } })).toBe(
      "Tapiwa needs 500 points to spend them. They have 320.",
    );
    expect(ask({ points: 4000 })).toBe("Tapiwa has 3,021 points.");
    expect(ask({ points: 1300, payable: 12.4 })).toBe("Points can pay US$12.40 of this sale.");
  });

  it("leaves alcohol unpaid by points when the rule is off", () => {
    const lines = [
      { lineTotal: 12.4, discountAmount: 0, taxAmount: 1.66, taxPercent: 15.5, payable: true },
      { lineTotal: 9, discountAmount: 0, taxAmount: 1.21, taxPercent: 15.5, payable: false },
    ];
    const payable = lines.filter((line) => line.payable).reduce((sum, line) => sum + line.lineTotal, 0);
    expect(ask({ points: 1300, payable })).toBe("Points can pay US$12.40 of this sale.");
    const { lines: spread } = spreadPointsDiscount(lines, 5);
    expect(spread[1]).toEqual(lines[1]);
    expect(spread[0]!.lineTotal).toBe(7.4);
  });

  it("floors what points are worth to the cent", () => {
    expect(pointsValue(500, 0.01)).toBe(5);
    expect(pointsValue(333, 0.0125)).toBe(4.16);
    expect(pointsValue(99, 0.0333)).toBe(3.29);
  });

  it("spreads the worth over the lines to the cent, VAT following", () => {
    const lines = [
      { lineTotal: 11.2, discountAmount: 0, taxAmount: 1.5, taxPercent: 15.5, payable: true },
      { lineTotal: 7.1, discountAmount: 0.5, taxAmount: 0.95, taxPercent: 15.5, payable: true },
      { lineTotal: 3.1, discountAmount: 0, taxAmount: 0, taxPercent: 0, payable: true },
    ];
    const { lines: spread, shares } = spreadPointsDiscount(lines, 5);
    expect(Math.round(shares.reduce((sum, share) => sum + share, 0) * 100)).toBe(500);
    const before = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const after = spread.reduce((sum, line) => sum + line.lineTotal, 0);
    expect(Math.round((before - after) * 100)).toBe(500);
    for (const [index, line] of spread.entries()) {
      const net = line.taxPercent > 0 ? Math.round((line.lineTotal * 100) / (1 + line.taxPercent / 100)) / 100 : line.lineTotal;
      expect(line.taxAmount).toBeCloseTo(line.lineTotal - net, 2);
      // base − discount + tax = lineTotal still holds.
      const base = lines[index]!.lineTotal + lines[index]!.discountAmount - lines[index]!.taxAmount;
      expect(base - line.discountAmount + line.taxAmount).toBeCloseTo(line.lineTotal, 2);
    }
  });

  it("lets only one of two sales spend the same points", async () => {
    const shop = await loyaltyShop("Points race");
    made.push(shop.companyId);
    await ledgerRow(shop, { customerId: shop.customerId, kind: "EARNED", points: 600 });
    const [first, second] = await Promise.all([testSale(shop, { total: "10.00" }), testSale(shop, { total: "10.00" })]);
    const spend = (saleId: string) =>
      prisma.$transaction((tx) =>
        spendPoints(tx, {
          companyId: shop.companyId,
          customer: { id: shop.customerId, name: "Tapiwa Marange" },
          points: 500,
          value: 5,
          payable: 10,
          saleId,
          actor: { id: null, name: "Chipo" },
          settings: LOYALTY_DEFAULTS,
          at: new Date(),
        }),
      );
    const results = await Promise.allSettled([spend(first), spend(second)]);
    const refused = results.filter((result) => result.status === "rejected");
    expect(refused).toHaveLength(1);
    const reason = (refused[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(LoyaltyRefusal);
    expect(reason.message).toBe("Tapiwa needs 500 points to spend them. They have 100.");
    expect(await balance(prisma, shop.customerId)).toBe(100);
  });
});
