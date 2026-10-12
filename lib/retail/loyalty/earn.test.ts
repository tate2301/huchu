import { describe, expect, it } from "vitest";

import { pointsEarned } from "./earn";
import { LOYALTY_DEFAULTS } from "./settings";
import { spreadPointsDiscount } from "./spend";

const settings = LOYALTY_DEFAULTS;

describe("points earned on a sale", () => {
  it("floors the dollars times the rate", () => {
    expect(pointsEarned({ lines: [{ lineTotal: "21.40", promotionId: null }], settings, topTier: false })).toBe(21);
    expect(pointsEarned({ lines: [{ lineTotal: "0.99", promotionId: null }], settings, topTier: false })).toBe(0);
  });

  it("earns the top tier's 1.5 a dollar: US$21.40 is 32", () => {
    expect(pointsEarned({ lines: [{ lineTotal: "21.40", promotionId: null }], settings, topTier: true })).toBe(32);
  });

  it("leaves promoted lines out while earning on promotion prices is off", () => {
    const lines = [
      { lineTotal: "10.00", promotionId: null },
      { lineTotal: "8.00", promotionId: "promo-1" },
    ];
    expect(pointsEarned({ lines, settings, topTier: false })).toBe(18);
    expect(pointsEarned({ lines, settings: { ...settings, earnOnPromotions: false }, topTier: false })).toBe(10);
  });

  it("earns on goods only: deposits and vouchers sold are never in a line", () => {
    // A sale of US$10.00 of goods, US$0.10 of deposits and a US$20.00 gift voucher: the lines hold the goods alone.
    const sale = { lines: [{ lineTotal: "10.00", promotionId: null }], depositAmount: "0.10", vouchersSoldAmount: "20.00" };
    expect(pointsEarned({ lines: sale.lines, settings, topTier: false })).toBe(10);
  });

  it("earns nothing on the points spent: their worth is out of the lines", () => {
    const { lines } = spreadPointsDiscount(
      [{ lineTotal: 21.4, discountAmount: 0, taxAmount: 2.87, taxPercent: 15.5, payable: true, promotionId: null }],
      5,
    );
    expect(lines[0]!.lineTotal).toBe(16.4);
    expect(pointsEarned({ lines, settings, topTier: true })).toBe(24);
  });

  it("earns nothing while loyalty is off", () => {
    expect(pointsEarned({ lines: [{ lineTotal: "21.40", promotionId: null }], settings: { ...settings, enabled: false }, topTier: true })).toBe(0);
  });
});
