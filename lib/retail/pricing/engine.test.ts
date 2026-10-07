import { describe, expect, it } from "vitest";

import { priceBasket, type PricingSnapshot, type SnapshotList } from "./engine";

/**
 * The till's price engine (PRD-05) over the demo shop's lists: Retail the
 * default, Happy hour 10% off beer on Fridays 17:00 to 19:00, Wholesale 8%
 * off for an account customer buying 6 or more, a paused, a binned and a
 * draft list that are never charged. Harare is UTC+2: Friday 9 October 2026
 * 17:30 there is 15:30Z.
 */

const list = (fields: Partial<SnapshotList> & { id: string }): SnapshotList => ({
  name: fields.id,
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
  minQuantity: 1,
  categoryIds: [],
  ...fields,
});

const BEER = "cat-beer";
const CASTLE = "castle";
const AMARULA = "amarula";

function snapshot(extra: Partial<PricingSnapshot> = {}): PricingSnapshot {
  return {
    version: "v1",
    pricedAt: "2026-10-09T15:30:00Z",
    currency: "USD",
    siteId: "hre",
    registerId: null,
    defaultListId: "retail",
    ownListId: null,
    lists: [
      list({ id: "retail", isDefault: true }),
      list({ id: "happy", whenKind: "DAYS_AND_HOURS", daysOfWeek: [5], fromTime: "17:00", toTime: "19:00", categoryIds: [BEER] }),
      list({ id: "wholesale", audience: "ACCOUNT_CUSTOMERS", minQuantity: 6 }),
      list({ id: "paused", state: "PAUSED" }),
      list({ id: "binned", archived: true }),
      list({ id: "draft", state: "DRAFT" }),
      list({ id: "staff", audience: "STAFF" }),
    ],
    prices: [
      { priceListId: "retail", productId: CASTLE, minQuantity: 1, unitPrice: 1.2 },
      { priceListId: "retail", productId: AMARULA, minQuantity: 1, unitPrice: 18.25 },
      { priceListId: "happy", productId: CASTLE, minQuantity: 1, unitPrice: 1.08 },
      { priceListId: "wholesale", productId: CASTLE, minQuantity: 6, unitPrice: 1.1 },
      { priceListId: "paused", productId: CASTLE, minQuantity: 1, unitPrice: 0.5 },
      { priceListId: "binned", productId: CASTLE, minQuantity: 1, unitPrice: 0.4 },
      { priceListId: "draft", productId: CASTLE, minQuantity: 1, unitPrice: 0.3 },
      { priceListId: "staff", productId: CASTLE, minQuantity: 1, unitPrice: 0.9 },
    ],
    products: [
      { id: CASTLE, categoryId: BEER, barcode: null, ageCheck: true, packOfId: null, packSize: null, breakAtTill: true, wasPrice: null },
      { id: AMARULA, categoryId: "cat-spirits", barcode: null, ageCheck: true, packOfId: null, packSize: null, breakAtTill: true, wasPrice: null },
    ],
    bundles: [],
    promotions: [],
    ...extra,
  };
}

const FRIDAY_1730 = "2026-10-09T15:30:00Z";
const FRIDAY_1905 = "2026-10-09T17:05:00Z";
const castle = (quantity = 1) => [{ key: "1", productId: CASTLE, quantity }];

describe("priceBasket", () => {
  it("charges Happy hour's 10% off a Castle on a Friday at 17:30, and Retail at 19:05", () => {
    const happy = priceBasket(snapshot(), castle(), { at: FRIDAY_1730 });
    expect(happy.lines[0]).toMatchObject({ unitPrice: 1.08, priceListId: "happy", total: 1.08 });
    const after = priceBasket(snapshot(), castle(), { at: FRIDAY_1905 });
    expect(after.lines[0]).toMatchObject({ unitPrice: 1.2, priceListId: "retail" });
  });

  it("keeps Happy hour to its categories", () => {
    const amarula = priceBasket(snapshot(), [{ key: "1", productId: AMARULA, quantity: 1 }], { at: FRIDAY_1730 });
    expect(amarula.lines[0]).toMatchObject({ unitPrice: 18.25, priceListId: "retail" });
  });

  it("gives an account customer buying 6 Wholesale, and 5 Retail", () => {
    const customer = { accountPriceListId: "wholesale" };
    const six = priceBasket(snapshot(), castle(6), { at: FRIDAY_1905, customer });
    expect(six.lines[0]).toMatchObject({ unitPrice: 1.1, priceListId: "wholesale", total: 6.6 });
    const five = priceBasket(snapshot(), castle(5), { at: FRIDAY_1905, customer });
    expect(five.lines[0]).toMatchObject({ unitPrice: 1.2, priceListId: "retail" });
  });

  it("never matches an audience list without a customer", () => {
    const six = priceBasket(snapshot(), castle(6), { at: FRIDAY_1905 });
    expect(six.lines[0]?.priceListId).toBe("retail");
    const staff = priceBasket(snapshot(), castle(), { at: FRIDAY_1905, customer: { staff: true } });
    expect(staff.lines[0]).toMatchObject({ unitPrice: 0.9, priceListId: "staff" });
  });

  it("charges the lower of two lists, and Retail on a tie", () => {
    const both = priceBasket(snapshot(), castle(6), { at: FRIDAY_1730, customer: { accountPriceListId: "wholesale" } });
    expect(both.lines[0]).toMatchObject({ unitPrice: 1.08, priceListId: "happy" });
    const tie = snapshot();
    tie.prices = tie.prices.map((row) => (row.priceListId === "happy" ? { ...row, unitPrice: 1.2 } : row));
    expect(priceBasket(tie, castle(), { at: FRIDAY_1730 }).lines[0]?.priceListId).toBe("retail");
  });

  it("lets a till's own list replace the default", () => {
    const own = snapshot({ ownListId: "borrowdale" });
    own.lists.push(list({ id: "borrowdale" }));
    own.prices.push({ priceListId: "borrowdale", productId: CASTLE, minQuantity: 1, unitPrice: 1.26 });
    expect(priceBasket(own, castle(), { at: FRIDAY_1905 }).lines[0]).toMatchObject({ unitPrice: 1.26, priceListId: "borrowdale" });
    // A paused own list falls back to the default.
    own.lists = own.lists.map((entry) => (entry.id === "borrowdale" ? { ...entry, state: "PAUSED" } : entry));
    expect(priceBasket(own, castle(), { at: FRIDAY_1905 }).lines[0]?.priceListId).toBe("retail");
  });

  it("ignores paused, binned and draft lists", () => {
    const line = priceBasket(snapshot(), castle(), { at: FRIDAY_1905 }).lines[0];
    expect(["paused", "binned", "draft"]).not.toContain(line?.priceListId);
  });

  it("keeps a site's list to its site, and dates to their days", () => {
    const site = snapshot();
    site.lists.push(list({ id: "borrowdale-only", siteId: "brd" }), list({ id: "xmas", whenKind: "BETWEEN_DATES", startsOn: "2026-12-01", endsOn: "2026-12-26" }));
    site.prices.push(
      { priceListId: "borrowdale-only", productId: CASTLE, minQuantity: 1, unitPrice: 1 },
      { priceListId: "xmas", productId: CASTLE, minQuantity: 1, unitPrice: 0.95 },
    );
    expect(priceBasket(site, castle(), { at: FRIDAY_1905 }).lines[0]?.priceListId).toBe("retail");
    expect(priceBasket(site, castle(), { at: FRIDAY_1905, siteId: "brd" }).lines[0]?.priceListId).toBe("borrowdale-only");
    expect(priceBasket(site, castle(), { at: "2026-12-26T20:00:00Z" }).lines[0]?.priceListId).toBe("xmas");
    expect(priceBasket(site, castle(), { at: "2026-12-26T22:30:00Z" }).lines[0]?.priceListId).toBe("retail");
  });

  it("counts in cents and totals the basket", () => {
    const basket = priceBasket(snapshot(), [...castle(3), { key: "2", productId: AMARULA, quantity: 1 }], { at: FRIDAY_1905 });
    expect(basket).toMatchObject({ subtotal: 21.85, discount: 0, total: 21.85 });
    expect(basket.lines[0]?.total).toBe(3.6);
  });

  it("prices off the base list alone when asked", () => {
    expect(priceBasket(snapshot(), castle(), { at: FRIDAY_1730, baseOnly: true }).lines[0]?.priceListId).toBe("retail");
  });
});
