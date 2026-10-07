import { describe, expect, it } from "vitest";

import { applyBundles, bundleOnSale, shareCents, type BundleLine, type SnapshotBundle } from "./engine";

/** PRD-08: fixed sets rung as one and buy-more deals, over the lists' shelf prices. */

const CASTLE = "castle";
const ICE = "ice";
const CHARCOAL = "charcoal";
const SAVANNA = "savanna";
const HUNTERS = "hunters";
const BERNINI = "bernini";

// Wednesday 7 October 2026, 12:00 in Harare.
const WEDNESDAY = "2026-10-07T10:00:00Z";
const SATURDAY = "2026-10-10T10:00:00Z";

const braai: SnapshotBundle = {
  id: "braai",
  code: "BND-0004",
  kind: "FIXED_SET",
  name: "Braai pack",
  barcode: "6001234500044",
  categoryId: "beer",
  price: 11,
  buyQuantity: null,
  days: "EVERY_DAY",
  daysOfWeek: [],
  endsOn: null,
  siteId: null,
  tillButton: true,
  state: "ON_SALE",
  items: [
    { productId: CASTLE, name: "Castle Lager 340ml", quantity: 6, each: 1.2 },
    { productId: ICE, name: "Ice 2kg bag", quantity: 1, each: 1.5 },
    { productId: CHARCOAL, name: "Charcoal 4kg", quantity: 1, each: 3.9 },
  ],
};

const ciders: SnapshotBundle = {
  ...braai,
  id: "ciders",
  code: "BND-0006",
  kind: "BUY_MORE",
  name: "Any 3 ciders",
  barcode: null,
  price: 5,
  buyQuantity: 3,
  items: [
    { productId: SAVANNA, name: "Savanna Dry 330ml", quantity: 1, each: 1.9 },
    { productId: HUNTERS, name: "Hunter's Gold 330ml", quantity: 1, each: 1.85 },
    { productId: BERNINI, name: "Bernini Blush 275ml", quantity: 1, each: 1.8 },
  ],
};

const at = { at: WEDNESDAY, siteId: "hre" };
const line = (key: string, productId: string, quantity: number, unitPrice: number, extra: Partial<BundleLine> = {}): BundleLine => ({
  key,
  productId,
  quantity,
  unitPrice,
  ...extra,
});
const rungBraai = (n = 1, ref = "1") => [
  line("a", CASTLE, 6 * n, 1.2, { bundleId: "braai", bundleRef: ref }),
  line("b", ICE, n, 1.5, { bundleId: "braai", bundleRef: ref }),
  line("c", CHARCOAL, n, 3.9, { bundleId: "braai", bundleRef: ref }),
];
const charged = (lines: BundleLine[], result: ReturnType<typeof applyBundles>) => {
  if ("error" in result) throw new Error(result.error);
  const price = new Map(lines.map((entry) => [entry.key, entry.unitPrice]));
  return result.pieces.map((piece) => Math.round(price.get(piece.key)! * piece.quantity * 100) - Math.round(piece.discount * 100));
};

describe("a fixed set rung as one", () => {
  it("totals the bundle's price, its components summing to it to the cent, pro rata to their own prices", () => {
    const lines = rungBraai();
    const result = applyBundles([braai], lines, at);
    const cents = charged(lines, result);
    expect(cents.reduce((acc, value) => acc + value, 0)).toBe(1100);
    // 7.20, 1.50 and 3.90 of 12.60 share 11.00: 6.28, 1.30, 3.40, and the 2 cents left go to the dearest, the Castle.
    expect(cents).toEqual([630, 130, 340]);
    if ("error" in result) throw new Error();
    expect(result.saving).toBe(1.6);
    expect(new Set(result.pieces.map((piece) => piece.group))).toEqual(new Set([1]));
    expect(result.pieces.every((piece) => piece.bundleId === "braai")).toBe(true);
  });

  it("prices two of them at twice the price", () => {
    const lines = rungBraai(2);
    const cents = charged(lines, applyBundles([braai], lines, at));
    expect(cents.reduce((acc, value) => acc + value, 0)).toBe(2200);
  });

  it("refuses a set that is not the bundle's items", () => {
    const lines = [line("a", CASTLE, 5, 1.2, { bundleId: "braai", bundleRef: "1" }), line("b", ICE, 1, 1.5, { bundleId: "braai", bundleRef: "1" })];
    expect(applyBundles([braai], lines, at)).toEqual({
      error: "That is not a Braai pack: it needs 6 × Castle Lager 340ml, 1 × Ice 2kg bag, 1 × Charcoal 4kg.",
    });
  });

  it("refuses a paused, stopped, ended or other site's bundle", () => {
    for (const changed of [
      { state: "PAUSED" as const },
      { state: "STOPPED" as const },
      { endsOn: "2026-10-06" },
      { siteId: "borrowdale" },
      { days: "WEEKENDS" as const },
    ]) {
      const result = applyBundles([{ ...braai, ...changed }], rungBraai(), at);
      expect(result).toEqual({ error: "Braai pack is not on sale now. Ring its items on their own." });
    }
  });

  it("shares cents so they always add up", () => {
    expect(shareCents(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(shareCents(1100, [720, 150, 390]).reduce((a, b) => a + b, 0)).toBe(1100);
  });
});

describe("buy more, pay less", () => {
  it("takes 3 Savanna at US$5.00", () => {
    const lines = [line("s", SAVANNA, 3, 1.9)];
    const result = applyBundles([ciders], lines, at);
    expect(charged(lines, result).reduce((a, b) => a + b, 0)).toBe(500);
    if ("error" in result) throw new Error();
    expect(result.pieces).toEqual([{ key: "s", quantity: 3, discount: 0.7, bundleId: "ciders", group: 1 }]);
  });

  it("charges the 4th at its own price, the cheapest left out of the group", () => {
    const lines = [line("s", SAVANNA, 2, 1.9), line("h", HUNTERS, 1, 1.85), line("b", BERNINI, 1, 1.8)];
    const result = applyBundles([ciders], lines, at);
    expect(charged(lines, result).reduce((a, b) => a + b, 0)).toBe(500 + 180);
    if ("error" in result) throw new Error();
    expect(result.pieces.find((piece) => piece.key === "b")).toEqual({ key: "b", quantity: 1, discount: 0, bundleId: null, group: null });
  });

  it("splits a line of 4 into 3 in the deal and 1 on its own", () => {
    const lines = [line("s", SAVANNA, 4, 1.9)];
    const result = applyBundles([ciders], lines, at);
    if ("error" in result) throw new Error();
    expect(result.pieces).toEqual([
      { key: "s", quantity: 1, discount: 0, bundleId: null, group: null },
      { key: "s", quantity: 3, discount: 0.7, bundleId: "ciders", group: 1 },
    ]);
  });

  it("makes two groups of six, each its own group", () => {
    const lines = [line("s", SAVANNA, 6, 1.9)];
    const result = applyBundles([ciders], lines, at);
    if ("error" in result) throw new Error();
    expect(result.pieces.map((piece) => piece.group)).toEqual([1, 2]);
    expect(charged(lines, result).reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("leaves a deal alone when it is not on sale", () => {
    const lines = [line("s", SAVANNA, 3, 1.9)];
    for (const changed of [{ state: "PAUSED" as const }, { state: "STOPPED" as const }, { endsOn: "2026-10-01" }, { siteId: "borrowdale" }]) {
      const result = applyBundles([{ ...ciders, ...changed }], lines, at);
      expect(result).toEqual({ pieces: [{ key: "s", quantity: 3, discount: 0, bundleId: null, group: null }], saving: 0 });
    }
  });
});

describe("when a bundle is on sale", () => {
  it("reads the days on Harare's clock", () => {
    expect(bundleOnSale({ ...braai, days: "WEEKENDS" }, SATURDAY, null)).toBe(true);
    expect(bundleOnSale({ ...braai, days: "WEEKENDS" }, WEDNESDAY, null)).toBe(false);
    expect(bundleOnSale({ ...braai, days: "CHOOSE", daysOfWeek: [3] }, WEDNESDAY, null)).toBe(true);
    expect(bundleOnSale({ ...braai, endsOn: "2026-10-07" }, WEDNESDAY, null)).toBe(true);
  });
});
