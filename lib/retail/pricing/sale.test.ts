import { describe, expect, it } from "vitest";

import type { SnapshotBundle } from "./engine";
import { priceSale, type SaleLineInput } from "./sale";

/**
 * PRD-08: the one sum the till shows and `pos/sales` stores. A buy-more deal
 * comes off on its own; the cashier's discount on a line a deal split is
 * shared over its pieces by quantity; a sale promotion takes nothing off a
 * bundled unit.
 */

const WEDNESDAY = "2026-10-07T10:00:00Z";

const base: Omit<SnapshotBundle, "id" | "code" | "kind" | "name" | "price" | "buyQuantity" | "items"> = {
  barcode: null,
  categoryId: null,
  days: "EVERY_DAY",
  daysOfWeek: [],
  endsOn: null,
  siteId: null,
  tillButton: true,
  state: "ON_SALE",
};
const braai: SnapshotBundle = {
  ...base,
  id: "braai",
  code: "BND-0004",
  kind: "FIXED_SET",
  name: "Braai pack",
  price: 11,
  buyQuantity: null,
  items: [
    { productId: "castle", name: "Castle Lager 340ml", quantity: 6, each: 1.2 },
    { productId: "ice", name: "Ice 2kg bag", quantity: 1, each: 1.5 },
    { productId: "charcoal", name: "Charcoal 4kg", quantity: 1, each: 3.9 },
  ],
};
const ciders: SnapshotBundle = {
  ...base,
  id: "ciders",
  code: "BND-0006",
  kind: "BUY_MORE",
  name: "Any 3 ciders",
  price: 5,
  buyQuantity: 3,
  items: [
    { productId: "savanna", name: "Savanna Dry 330ml", quantity: 1, each: 1.85 },
    { productId: "hunters", name: "Hunter's Gold 330ml", quantity: 1, each: 1.85 },
  ],
};

const line = (key: string, productId: string, quantity: number, unitPrice: number, extra: Partial<SaleLineInput> = {}): SaleLineInput => ({
  key,
  productId,
  quantity,
  unitPrice,
  taxPercent: 15.5,
  taxInclusive: true,
  lineDiscount: 0,
  ...extra,
});
const sell = (lines: SaleLineInput[], extra: Partial<Parameters<typeof priceSale>[0]> = {}) => {
  const priced = priceSale({ lines, bundles: [braai, ciders], at: WEDNESDAY, siteId: "hre", ...extra });
  if ("error" in priced) throw new Error(priced.error);
  return priced;
};
const braaiLines = () => [
  line("a", "castle", 6, 1.2, { bundleId: "braai", bundleRef: "1" }),
  line("b", "ice", 1, 1.5, { bundleId: "braai", bundleRef: "1" }),
  line("c", "charcoal", 1, 3.9, { bundleId: "braai", bundleRef: "1" }),
];

describe("a buy-more deal", () => {
  it("takes three Savanna to US$5.00, the saving apart from the cashier's", () => {
    const priced = sell([line("s", "savanna", 3, 1.85)]);
    expect(priced.checkout.total).toBe(5);
    expect(priced.bundleSaving).toBe(0.55);
    expect(priced.pieces).toEqual([
      { key: "s", lineKey: "s", quantity: 3, lineDiscount: 0, bundleDiscount: 0.55, bundleId: "ciders", group: 1 },
    ]);
  });

  it("shares US$2.50 off four Hunter's over its pieces by quantity, so all of it is given", () => {
    const priced = sell([line("h", "hunters", 4, 1.85, { lineDiscount: 2.5 })]);
    expect(priced.pieces.map((piece) => [piece.quantity, piece.lineDiscount, piece.bundleDiscount])).toEqual([
      [1, 0.62, 0],
      [3, 1.88, 0.55],
    ]);
    // 7.40 less the deal's 0.55 less the cashier's 2.50.
    expect(priced.checkout.total).toBe(4.35);
  });

  it("keeps US$1.00 off four Savanna to US$0.25 on the single left over", () => {
    const priced = sell([line("s", "savanna", 4, 1.85, { lineDiscount: 1 })]);
    expect(priced.pieces.map((piece) => piece.lineDiscount)).toEqual([0.25, 0.75]);
    expect(priced.checkout.total).toBe(5.85);
  });
});

describe("a sale promotion beside a bundle", () => {
  const tenPercent = { id: "promo", type: "PERCENT" as const, value: 10 };

  it("takes nothing off a Braai pack: it stays US$11.00", () => {
    const priced = sell(braaiLines(), { promotion: tenPercent });
    expect(priced.checkout.promotionDiscountAmount).toBe(0);
    expect(priced.checkout.total).toBe(11);
  });

  it("takes its 10% off the Coke beside it, and only off the Coke", () => {
    const priced = sell([...braaiLines(), line("d", "coke", 2, 0.75)], { promotion: tenPercent });
    expect(priced.checkout.promotionDiscountAmount).toBe(0.15);
    expect(priced.checkout.total).toBe(12.35);
    const coke = priced.checkout.lines.find((entry) => entry.id === "d")!;
    expect(coke.lineTotal).toBe(1.35);
  });

  it("takes no promotion off three Savanna in the deal", () => {
    const priced = sell([line("s", "savanna", 4, 1.85)], { promotion: { ...tenPercent, value: 20 } });
    // The fourth, at its own price, takes the 20%: 5.00 + 1.85 − 0.37.
    expect(priced.checkout.promotionDiscountAmount).toBe(0.37);
    expect(priced.checkout.total).toBe(6.48);
  });

  it("caps an amount off at what is sold at its own price", () => {
    const priced = sell(braaiLines(), { promotion: { id: "promo", type: "AMOUNT", value: 2 } });
    expect(priced.checkout.total).toBe(11);
  });
});

describe("refusals", () => {
  it("passes a wrong set's refusal back", () => {
    const priced = priceSale({ lines: braaiLines().slice(0, 2), bundles: [braai], at: WEDNESDAY, siteId: "hre" });
    expect(priced).toEqual({ error: "That is not a Braai pack: it needs 6 × Castle Lager 340ml, 1 × Ice 2kg bag, 1 × Charcoal 4kg." });
  });
});
