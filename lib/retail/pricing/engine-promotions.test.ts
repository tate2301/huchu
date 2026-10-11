import { describe, expect, it } from "vitest";

import { applyPromotions, promotionApplies, type PromotionLine, type SnapshotBundle, type SnapshotPromotion } from "./engine";
import { priceSale, type SaleLineInput } from "./sale";

/**
 * The promotions part of the till's price engine (PRD-09, 20-products 4.9),
 * with the board's cases: US$2 off a spirit; two ciders for US$5, mixed and
 * dearest first; a basket minimum read before promotions; the biggest of the
 * non-stacking ones, the stacking ones added, and the better of the two; a
 * promotion against a buy-more deal; percent and fixed price; an amount never
 * below zero; nothing before the start; staff and loyalty never without a
 * customer.
 */

const SATURDAY = "2026-10-03T10:00:00Z";

const promotion = (extra: Partial<SnapshotPromotion>): SnapshotPromotion => ({
  id: "festive",
  code: "PROMO-FESTIVE",
  name: "Festive season US$2 off spirits",
  type: "AMOUNT",
  value: 2,
  buyQuantity: null,
  scope: "CATEGORIES",
  productIds: [],
  categoryIds: ["spirits"],
  minBasket: null,
  daysOfWeek: [],
  fromTime: null,
  toTime: null,
  audience: "EVERYONE",
  stacks: false,
  siteId: null,
  startsAt: "2026-09-01T22:00:00Z",
  endsAt: null,
  ...extra,
});

const line = (key: string, productId: string, categoryId: string | null, quantity: number, unitPrice: number, alreadyOff = 0): PromotionLine => ({
  key,
  productId,
  categoryId,
  quantity,
  unitPrice,
  alreadyOff,
});

const at = { at: SATURDAY, siteId: "hre" };

describe("one promotion", () => {
  it("takes US$2.00 off each bottle of a spirit, and nothing off the beer", () => {
    const out = applyPromotions([promotion({})], [line("j", "jameson", "spirits", 2, 27.9), line("c", "castle", "beer", 6, 1.2)], at);
    expect(out).toEqual([
      { key: "j", promotionId: "festive", discount: 4 },
      { key: "c", promotionId: null, discount: 0 },
    ]);
  });

  it("prices two ciders at US$5.00, mixed within the scope, the dearest first", () => {
    const twoFor5 = promotion({
      id: "cider",
      code: "MONTHEND-CIDER",
      type: "BUY_X_PAY",
      value: 5,
      buyQuantity: 2,
      scope: "PRODUCTS",
      productIds: ["savanna", "hunters", "bernini"],
      categoryIds: [],
    });
    // Three units: Savanna 3.10, Hunter's 2.90, Bernini 2.00. The pair is the two dearest; Bernini sells at its own price.
    const out = applyPromotions(
      [twoFor5],
      [line("b", "bernini", "ciders", 1, 2), line("s", "savanna", "ciders", 1, 3.1), line("h", "hunters", "ciders", 1, 2.9)],
      at,
    );
    expect(out.find((entry) => entry.key === "b")).toEqual({ key: "b", promotionId: null, discount: 0 });
    const s = out.find((entry) => entry.key === "s")!.discount;
    const h = out.find((entry) => entry.key === "h")!.discount;
    expect(Math.round((s + h) * 100)).toBe(100);
    expect(s).toBeGreaterThan(h);
  });

  it("takes a percent off the shelf and sells a fixed price only where it is lower", () => {
    const tenOff = promotion({ id: "xmas", type: "PERCENT", value: 10, scope: "EVERYTHING", categoryIds: [] });
    expect(applyPromotions([tenOff], [line("a", "amarula", null, 1, 18.25)], at)[0]!.discount).toBe(1.83);
    const case24 = promotion({ id: "case24", type: "FIXED_PRICE", value: 24, scope: "PRODUCTS", productIds: ["case", "single"], categoryIds: [] });
    const out = applyPromotions([case24], [line("c", "case", null, 2, 26), line("s", "single", null, 1, 1.2)], at);
    expect(out).toEqual([
      { key: "c", promotionId: "case24", discount: 4 },
      { key: "s", promotionId: null, discount: 0 },
    ]);
  });

  it("never takes an amount below zero, nor past what the cashier already took off", () => {
    const out = applyPromotions([promotion({ scope: "EVERYTHING", categoryIds: [] })], [line("i", "ice", null, 1, 1.5), line("t", "tonic", null, 1, 3, 2)], at);
    expect(out).toEqual([
      { key: "i", promotionId: "festive", discount: 1.5 },
      { key: "t", promotionId: "festive", discount: 1 },
    ]);
  });
});

describe("when and for whom", () => {
  it("does not apply a scheduled promotion before it starts, nor after it ends", () => {
    const xmas = promotion({ startsAt: "2026-11-30T22:00:00Z", endsAt: "2026-12-26T21:59:00Z" });
    expect(promotionApplies(xmas, at)).toBe(false);
    expect(promotionApplies(xmas, { ...at, at: "2026-12-10T10:00:00Z" })).toBe(true);
    expect(promotionApplies(xmas, { ...at, at: "2026-12-27T10:00:00Z" })).toBe(false);
  });

  it("never matches loyalty members or staff without a customer", () => {
    expect(promotionApplies(promotion({ audience: "STAFF" }), at)).toBe(false);
    expect(promotionApplies(promotion({ audience: "LOYALTY_MEMBERS" }), at)).toBe(false);
    expect(promotionApplies(promotion({ audience: "STAFF" }), { ...at, customer: { staff: true } })).toBe(true);
  });

  it("keeps to its site, days and hours on Harare's clock", () => {
    expect(promotionApplies(promotion({ siteId: "borrowdale" }), at)).toBe(false);
    expect(promotionApplies(promotion({ daysOfWeek: [6] }), at)).toBe(true);
    expect(promotionApplies(promotion({ daysOfWeek: [5] }), at)).toBe(false);
    // 10:00 UTC is 12:00 in Harare.
    expect(promotionApplies(promotion({ fromTime: "12:00", toTime: "13:00" }), at)).toBe(true);
    expect(promotionApplies(promotion({ fromTime: "11:00", toTime: "12:00" }), at)).toBe(false);
  });

  it("asks the basket before promotions for its minimum", () => {
    const winter = promotion({ id: "winter", type: "PERCENT", value: 5, scope: "EVERYTHING", categoryIds: [], minBasket: 20 });
    // 20.00 before promotions reaches US$20, though 5% off would take it under.
    expect(applyPromotions([winter], [line("a", "a", null, 2, 10)], at)[0]!.discount).toBe(1);
    expect(applyPromotions([winter], [line("a", "a", null, 1, 19.99)], at)[0]!.discount).toBe(0);
  });
});

describe("several at once", () => {
  const amount = promotion({});
  const percent = promotion({ id: "percent", code: "PROMO-P", type: "PERCENT", value: 10 });
  const items = [line("j", "jameson", "spirits", 1, 27.9)];

  it("takes the biggest of the non-stacking ones", () => {
    expect(applyPromotions([amount, percent], items, at)).toEqual([{ key: "j", promotionId: "percent", discount: 2.79 }]);
  });

  it("adds the stacking ones together", () => {
    const out = applyPromotions([{ ...amount, stacks: true }, { ...percent, stacks: true }], items, at);
    expect(out).toEqual([{ key: "j", promotionId: "percent", discount: 4.79 }]);
  });

  it("takes whichever saves more: the best non-stacking one, or the stacking ones together", () => {
    const big = promotion({ id: "big", code: "PROMO-BIG", type: "FIXED_PRICE", value: 20 });
    // Stacking 2.00 + 2.79 = 4.79 against a fixed 20.00 saving 7.90.
    expect(applyPromotions([{ ...amount, stacks: true }, { ...percent, stacks: true }, big], items, at)).toEqual([
      { key: "j", promotionId: "big", discount: 7.9 },
    ]);
  });
});

describe("a promotion against a buy-more deal", () => {
  const deal: SnapshotBundle = {
    id: "ciders",
    code: "BND-0006",
    kind: "BUY_MORE",
    name: "Any 3 ciders",
    barcode: null,
    categoryId: null,
    price: 5,
    buyQuantity: 3,
    days: "EVERY_DAY",
    daysOfWeek: [],
    endsOn: null,
    siteId: null,
    tillButton: true,
    state: "ON_SALE",
    items: [{ productId: "savanna", name: "Savanna Dry 330ml", quantity: 1, each: 1.85 }],
  };
  const sale = (promotions: SnapshotPromotion[]) => {
    const lines: SaleLineInput[] = [
      { key: "s", productId: "savanna", categoryId: "ciders", quantity: 3, unitPrice: 1.85, taxPercent: 15.5, taxInclusive: true, lineDiscount: 0 },
    ];
    const priced = priceSale({ lines, bundles: [deal], promotions, at: SATURDAY, siteId: "hre" });
    if ("error" in priced) throw new Error(priced.error);
    return priced;
  };

  it("keeps the deal when it saves more than a non-stacking promotion", () => {
    const priced = sale([promotion({ type: "PERCENT", value: 5, scope: "CATEGORIES", categoryIds: ["ciders"] })]);
    expect(priced.pieces[0]).toMatchObject({ bundleId: "ciders", promotionId: null });
    expect(priced.checkout.total).toBe(5);
  });

  it("takes the promotion when it saves more than the deal", () => {
    const priced = sale([promotion({ type: "AMOUNT", value: 0.5, scope: "CATEGORIES", categoryIds: ["ciders"] })]);
    expect(priced.pieces[0]).toMatchObject({ bundleId: null, promotionId: "festive", promotionDiscount: 1.5 });
    expect(priced.checkout.total).toBe(4.05);
  });
});
