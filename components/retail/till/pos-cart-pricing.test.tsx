import { describe, expect, it } from "vitest";

import type { PricingSnapshot, SnapshotBundle, SnapshotList, SnapshotPromotion } from "@/lib/retail/pricing/engine";
import { priceSale } from "@/lib/retail/pricing/sale";

import { bundleOffers, makeBundle, priceCart, repriceLines } from "./cart-pricing";
import type { CartItem } from "./types";

/**
 * FLR-10 (PRD-05, PRD-08, PRD-09): the till prices every change of the cart
 * with the engine over the price snapshot, so its totals are the ones
 * `pos/sales` re-prices to: Happy hour on a Friday at 17:30, Wholesale from
 * 6, a bundle rung as one, a promotion on its line. A new snapshot re-prices
 * the lines still at the shelf price.
 */

// Friday 9 October 2026, 17:30 in Harare (UTC+2); and the Thursday before at noon.
const FRIDAY_1730 = new Date("2026-10-09T15:30:00Z");
const THURSDAY_NOON = new Date("2026-10-08T10:00:00Z");

const list = (patch: Partial<SnapshotList> & Pick<SnapshotList, "id" | "name">): SnapshotList => ({
  isDefault: false,
  state: "ON",
  archived: false,
  currency: "USD",
  taxInclusive: true,
  audience: "EVERYONE",
  whenKind: "ALWAYS",
  daysOfWeek: [],
  fromTime: null,
  toTime: null,
  startsOn: null,
  endsOn: null,
  siteId: null,
  minQuantity: 0,
  categoryIds: [],
  ...patch,
});

const braai: SnapshotBundle = {
  id: "braai",
  code: "BND-0004",
  kind: "FIXED_SET",
  name: "Braai pack",
  barcode: "6009900000044",
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
    { productId: "castle", name: "Castle Lager 340ml", quantity: 6, each: 1.2 },
    { productId: "ice", name: "Ice 2kg bag", quantity: 1, each: 1.5 },
    { productId: "charcoal", name: "Charcoal 4kg", quantity: 1, each: 3.9 },
  ],
};

const festive: SnapshotPromotion = {
  id: "festive",
  code: "PROMO-0012",
  name: "Festive spirits",
  type: "AMOUNT",
  value: 2,
  buyQuantity: null,
  scope: "PRODUCTS",
  productIds: ["jwb"],
  categoryIds: [],
  minBasket: null,
  daysOfWeek: [],
  fromTime: null,
  toTime: null,
  audience: "EVERYONE",
  stacks: false,
  siteId: null,
  startsAt: "2026-10-01T00:00:00Z",
  endsAt: null,
};

function snapshot(castlePrice = 1.2): PricingSnapshot {
  return {
    version: `v-${castlePrice}`,
    pricedAt: "2026-10-09T15:00:00Z",
    currency: "USD",
    siteId: "site",
    registerId: "till",
    defaultListId: "default",
    ownListId: null,
    lists: [
      list({ id: "default", name: "Default", isDefault: true }),
      list({ id: "happy", name: "Happy hour", whenKind: "DAYS_AND_HOURS", daysOfWeek: [5], fromTime: "17:00", toTime: "19:00", categoryIds: ["beer"] }),
      list({ id: "wholesale", name: "Wholesale", minQuantity: 6 }),
    ],
    prices: [
      { priceListId: "default", productId: "castle", minQuantity: 0, unitPrice: castlePrice },
      { priceListId: "default", productId: "ice", minQuantity: 0, unitPrice: 1.5 },
      { priceListId: "default", productId: "charcoal", minQuantity: 0, unitPrice: 3.9 },
      { priceListId: "default", productId: "coke", minQuantity: 0, unitPrice: 2.5 },
      { priceListId: "default", productId: "jwb", minQuantity: 0, unitPrice: 42 },
      { priceListId: "happy", productId: "castle", minQuantity: 0, unitPrice: 1.08 },
      { priceListId: "wholesale", productId: "coke", minQuantity: 0, unitPrice: 2.2 },
    ],
    products: [
      { id: "castle", categoryId: "beer", barcode: null, ageCheck: true, packOfId: null, packSize: null, breakAtTill: false, wasPrice: null },
      { id: "ice", categoryId: "ice", barcode: null, ageCheck: false, packOfId: null, packSize: null, breakAtTill: false, wasPrice: null },
      { id: "charcoal", categoryId: "braai", barcode: null, ageCheck: false, packOfId: null, packSize: null, breakAtTill: false, wasPrice: null },
      { id: "coke", categoryId: "soft", barcode: null, ageCheck: false, packOfId: null, packSize: null, breakAtTill: false, wasPrice: null },
      { id: "jwb", categoryId: "spirits", barcode: null, ageCheck: true, packOfId: null, packSize: null, breakAtTill: false, wasPrice: null },
    ],
    bundles: [braai],
    promotions: [festive],
  };
}

/** A line as `lineFromItem` puts it on the sale: at the catalog's price until the engine re-prices it. */
function line(productId: string, quantity: number, catalogPrice: number, patch: Partial<CartItem> = {}): CartItem {
  return {
    id: productId,
    name: productId,
    catalogItemId: productId,
    category: null,
    quantity,
    unitPrice: catalogPrice,
    shelfPrice: catalogPrice,
    priceOfOne: catalogPrice,
    priceBreaks: [],
    openPrice: false,
    taxPercent: 15.5,
    taxInclusive: true,
    lineDiscountAmount: 0,
    ageRestricted: false,
    returnable: false,
    depositAmount: null,
    depositName: null,
    emptiesBack: 0,
    maxDiscountPercent: null,
    openableCase: null,
    ...patch,
  };
}

const totals = (lines: CartItem[], snap: PricingSnapshot, at: Date) =>
  priceCart({ lines, snapshot: snap, at, siteId: "site", customer: { loyalty: false, staff: false }, orderDiscountAmount: 0, voucher: null, vouchersSold: [] });

/** What the server's sum comes to for the same lines: `priceSale` over the same snapshot at the same moment. */
function serverTotal(lines: CartItem[], snap: PricingSnapshot, at: Date) {
  const category = new Map(snap.products.map((product) => [product.id, product.categoryId]));
  const sale = priceSale({
    lines: lines.map((item) => ({
      key: item.id,
      productId: item.catalogItemId,
      categoryId: category.get(item.catalogItemId) ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxPercent: item.taxPercent,
      taxInclusive: item.taxInclusive,
      lineDiscount: item.lineDiscountAmount,
      bundleId: item.bundleId ?? null,
      bundleRef: item.bundleRef ?? null,
    })),
    bundles: snap.bundles,
    promotions: snap.promotions,
    at,
    siteId: "site",
  });
  if ("error" in sale) throw new Error(sale.error);
  return sale.checkout.total;
}

describe("the till's cart, priced by the engine", () => {
  it("sells Castle at the Happy hour price on a Friday at 17:30, and says which list", () => {
    const snap = snapshot();
    const [castle] = repriceLines([line("castle", 6, 1.2)], snap, FRIDAY_1730);
    expect(castle.unitPrice).toBe(1.08);
    expect(castle.listName).toBe("Happy hour");
    expect(totals([castle], snap, FRIDAY_1730).goodsTotal).toBe(serverTotal([castle], snap, FRIDAY_1730));
    expect(totals([castle], snap, FRIDAY_1730).goodsTotal).toBe(6.48);

    // Thursday noon: the default list, and no list named on the line.
    const [thursday] = repriceLines([line("castle", 6, 1.2)], snap, THURSDAY_NOON);
    expect(thursday.unitPrice).toBe(1.2);
    expect(thursday.listName).toBeNull();
  });

  it("sells at Wholesale from 6", () => {
    const snap = snapshot();
    const [five] = repriceLines([line("coke", 5, 2.5)], snap, THURSDAY_NOON);
    const [six] = repriceLines([line("coke", 6, 2.5)], snap, THURSDAY_NOON);
    expect(five.unitPrice).toBe(2.5);
    expect(six.unitPrice).toBe(2.2);
    expect(six.listName).toBe("Wholesale");
    expect(totals([six], snap, THURSDAY_NOON).goodsTotal).toBe(serverTotal([six], snap, THURSDAY_NOON));
    expect(totals([six], snap, THURSDAY_NOON).goodsTotal).toBe(13.2);
  });

  it("offers a bundle once its items are all on, and rings it at the bundle's price", () => {
    const snap = snapshot();
    const loose = repriceLines([line("castle", 6, 1.2), line("ice", 1, 1.5), line("charcoal", 1, 3.9)], snap, THURSDAY_NOON);
    expect(bundleOffers(loose, snap.bundles, THURSDAY_NOON, "site").map((bundle) => bundle.name)).toEqual(["Braai pack"]);

    const bundled = makeBundle(loose, braai, "B1");
    expect(bundled.every((item) => item.bundleRef === "B1" && item.bundleId === "braai")).toBe(true);
    expect(bundleOffers(bundled, snap.bundles, THURSDAY_NOON, "site")).toEqual([]);
    const priced = totals(bundled, snap, THURSDAY_NOON);
    expect(priced.bundleProblem).toBeNull();
    expect(priced.goodsTotal).toBe(11);
    expect(priced.goodsTotal).toBe(serverTotal(bundled, snap, THURSDAY_NOON));
    // Every component's saving rides on its own line.
    expect([...priced.lineSavings.values()].reduce((sum, entry) => sum + entry.bundle, 0)).toBeCloseTo(1.6, 2);
  });

  it("shows a promotion on its line, by name and amount", () => {
    const snap = snapshot();
    const lines = repriceLines([line("jwb", 1, 42), line("coke", 1, 2.5)], snap, THURSDAY_NOON);
    const priced = totals(lines, snap, THURSDAY_NOON);
    expect(priced.lineSavings.get("jwb")?.promotion).toEqual({ name: "Festive spirits", amount: 2 });
    expect(priced.lineSavings.get("coke")?.promotion).toBeNull();
    expect(priced.goodsTotal).toBe(42.5);
    expect(priced.goodsTotal).toBe(serverTotal(lines, snap, THURSDAY_NOON));
  });

  it("re-prices when the snapshot changes, leaving a price the cashier changed alone", () => {
    const before = snapshot(1.2);
    const after = snapshot(1.3);
    const cart = [line("castle", 2, 1.2), line("coke", 1, 2.5, { unitPrice: 2, shelfPrice: 2.5 })];
    const first = repriceLines(cart, before, THURSDAY_NOON);
    const second = repriceLines(cart, after, THURSDAY_NOON);
    expect(first[0].unitPrice).toBe(1.2);
    expect(second[0].unitPrice).toBe(1.3);
    expect(totals(second, after, THURSDAY_NOON).goodsTotal).toBe(serverTotal(second, after, THURSDAY_NOON));
    // The changed Coke stays at what the cashier typed.
    expect(second[1].unitPrice).toBe(2);
  });
});
