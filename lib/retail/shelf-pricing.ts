/**
 * The shelf price, resolved through the till's price engine (PRD-05).
 *
 * The server builds the same snapshot a till downloads (`pos/pricing`) and
 * runs the same pure engine over it (`lib/retail/pricing/engine.ts`): the
 * till's base list (its own, its site's, else the default) against every
 * other list that is on and whose rules hold at that moment, the lower price
 * winning. What comes back is the flat shape the till has always read — the
 * price, the VAT, whether the VAT is inside it — with which list it came off
 * and when that row was last written, so `pos/sales` can tell a superseded
 * offline price from a tampered one.
 *
 * ## Never fail to sell
 *
 * A product no list prices falls back to `Product.standardPrice` and says so
 * through `priceSource`.
 */
import { money, percent, toNumberOrZero, type MoneyLike } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { priceBasket, type PriceBreak, type PricingContext, type PricingSnapshot } from "@/lib/retail/pricing/engine";
import { loadPricingSnapshot } from "@/lib/retail/pricing/snapshot";

/** Where the number the till will charge actually came from. */
export type ShelfPriceSource =
  | "PRICE_LIST"
  | "VOLUME_BREAK"
  | "STANDARD"
  | "LISTING";

export type ShelfPrice = {
  /** Numbers, not `Decimal` — the wire contract the till already reads. */
  unitPrice: number;
  taxPercent: number;
  /** Whether `unitPrice` already contains the tax. From `PriceList.taxInclusive`. */
  taxInclusive: boolean;
  currency: string;
  priceListId: string | null;
  priceListName: string | null;
  priceSource: ShelfPriceSource;
  /** When the server resolved this. Travels with the offline snapshot. */
  pricedAt: string;
  /**
   * When the row this price came off was last written.
   *
   * `pos/sales` compares it against the moment a replayed sale was rung up: a
   * price changed *after* the sale cannot have applied to it, which is how a
   * legitimately stale device is told apart from a tampered one.
   */
  priceChangedAt: string | null;
};

/** What a caller needs to hand over for one listing to be priced. */
export type ShelfPricingListing = {
  /**
   * The caller's own key. `Product.id` from S-4b, or a `productId:index` when a
   * basket carries the same line twice at different quantities.
   */
  id: string;
  productId: string | null;
  /** The listing's own columns, used only when core has nothing to say. */
  unitPrice: MoneyLike;
  taxPercent: MoneyLike;
  /** Volume breaks resolve against the quantity being sold. Defaults to one. */
  quantity?: number;
};

/** The listing's own columns, treated exactly as the till treated them before S-3. */
function fromListing(listing: ShelfPricingListing, pricedAt: string): ShelfPrice {
  return {
    unitPrice: toNumberOrZero(money(listing.unitPrice)),
    taxPercent: toNumberOrZero(percent(listing.taxPercent)),
    // Nothing declares the listing columns inclusive, and the till has always
    // added tax to them. A fallback must not change what a customer pays.
    taxInclusive: false,
    currency: "USD",
    priceListId: null,
    priceListName: null,
    priceSource: "LISTING",
    pricedAt,
    priceChangedAt: null,
  };
}

export type ShelfPricingOptions = {
  /** The till's site; else the shop's default site. */
  siteId?: string | null;
  registerId?: string | null;
  /** When the sale is rung (a replay's own moment). Default now. */
  at?: Date;
  customer?: PricingContext["customer"];
  /** The base list's price alone, never another list's (the back office's "price"). */
  baseOnly?: boolean;
  /** A snapshot already loaded for the same site and till. */
  snapshot?: PricingSnapshot;
};

/**
 * Price a batch of listings through the engine: one snapshot for the
 * products, one engine run, one query for the rows' write times.
 */
export async function resolveShelfPrices(
  companyId: string,
  listings: ShelfPricingListing[],
  options: ShelfPricingOptions = {},
): Promise<Map<string, ShelfPrice>> {
  const at = options.at ?? new Date();
  const pricedAt = new Date().toISOString();
  const resolved = new Map<string, ShelfPrice>();
  if (listings.length === 0) return resolved;

  const productIds = [...new Set(listings.map((listing) => listing.productId).filter((value): value is string => Boolean(value)))];
  const [snapshot, products] = await Promise.all([
    options.snapshot ?? loadPricingSnapshot(companyId, { siteId: options.siteId, registerId: options.registerId, productIds }),
    productIds.length
      ? prisma.product.findMany({
          where: { id: { in: productIds }, companyId },
          select: { id: true, standardPrice: true, defaultTaxRate: true, currency: true, updatedAt: true },
        })
      : Promise.resolve([]),
  ]);
  const productById = new Map(products.map((product) => [product.id, product]));
  const listById = new Map(snapshot.lists.map((list) => [list.id, list]));

  const priced = priceBasket(
    snapshot,
    listings
      .filter((listing) => listing.productId && productById.has(listing.productId))
      .map((listing) => ({ key: listing.id, productId: listing.productId!, quantity: listing.quantity ?? 1 })),
    { at, siteId: snapshot.siteId, customer: options.customer ?? null, baseOnly: options.baseOnly },
  );
  const lineByKey = new Map(priced.lines.map((line) => [line.key, line]));

  // When each winning row was last written: the replay review's "changed after the sale".
  const used = priced.lines.filter((line) => line.priceListId !== null);
  const written = used.length
    ? await prisma.productPrice.findMany({
        where: { companyId, OR: used.map((line) => ({ priceListId: line.priceListId!, productId: line.productId })) },
        select: { priceListId: true, productId: true, minQuantity: true, updatedAt: true },
      })
    : [];
  const writtenAt = new Map(written.map((row) => [`${row.priceListId}:${row.productId}:${toNumberOrZero(row.minQuantity)}`, row.updatedAt]));

  for (const listing of listings) {
    const product = listing.productId ? productById.get(listing.productId) : undefined;
    const line = lineByKey.get(listing.id);
    if (!product || !line) {
      resolved.set(listing.id, fromListing(listing, pricedAt));
      continue;
    }
    const list = line.priceListId ? listById.get(line.priceListId) : undefined;
    if (line.unitPrice === null || !list) {
      resolved.set(listing.id, {
        unitPrice: toNumberOrZero(money(product.standardPrice)),
        taxPercent: toNumberOrZero(percent(product.defaultTaxRate)),
        taxInclusive: false,
        currency: product.currency ?? "USD",
        priceListId: null,
        priceListName: null,
        priceSource: "STANDARD",
        pricedAt,
        priceChangedAt: product.updatedAt.toISOString(),
      });
      continue;
    }
    resolved.set(listing.id, {
      unitPrice: line.unitPrice,
      taxPercent: toNumberOrZero(percent(product.defaultTaxRate)),
      taxInclusive: list.taxInclusive,
      currency: list.currency,
      priceListId: list.id,
      priceListName: list.name,
      priceSource: (line.minQuantity ?? 1) > 1 ? "VOLUME_BREAK" : "PRICE_LIST",
      pricedAt,
      priceChangedAt: (writtenAt.get(`${list.id}:${line.productId}:${line.minQuantity}`) ?? product.updatedAt).toISOString(),
    });
  }

  return resolved;
}

/**
 * The volume breaks the till charges at this site and till now, no customer:
 * for each product, the engine's price at every quantity where it steps away
 * from the step before (a row's break or a list's minimum). The till prices a
 * line off the highest step at or under its quantity (`priceAtQuantity`), so
 * what it sends is what `pos/sales` charges.
 */
export async function shelfPriceBreaks(
  companyId: string,
  productIds: string[],
  options: { siteId?: string | null; registerId?: string | null; at?: Date } = {},
): Promise<Map<string, PriceBreak[]>> {
  const breaks = new Map<string, PriceBreak[]>();
  if (productIds.length === 0) return breaks;
  const snapshot = await loadPricingSnapshot(companyId, { siteId: options.siteId, registerId: options.registerId, productIds });
  const listMinimum = new Map(snapshot.lists.map((list) => [list.id, list.minQuantity]));
  const quantities = new Map<string, Set<number>>();
  for (const row of snapshot.prices) {
    for (const at of [row.minQuantity, listMinimum.get(row.priceListId) ?? 1]) {
      if (at > 1) quantities.set(row.productId, (quantities.get(row.productId) ?? new Set()).add(at));
    }
  }
  if (quantities.size === 0) return breaks;
  const basket = [...quantities].flatMap(([productId, set]) =>
    [1, ...set].map((quantity) => ({ key: `${productId}:${quantity}`, productId, quantity })),
  );
  const priced = priceBasket(snapshot, basket, { at: options.at ?? new Date(), siteId: snapshot.siteId, customer: null });
  const priceOf = new Map(priced.lines.map((line) => [line.key, line.unitPrice]));
  for (const [productId, set] of quantities) {
    let last = priceOf.get(`${productId}:1`);
    if (last === null || last === undefined) continue;
    const steps: PriceBreak[] = [];
    for (const quantity of [...set].sort((a, b) => a - b)) {
      const price = priceOf.get(`${productId}:${quantity}`);
      if (price === null || price === undefined || price === last) continue;
      steps.push({ minQuantity: quantity, unitPrice: price });
      last = price;
    }
    if (steps.length) breaks.set(productId, steps);
  }
  return breaks;
}
