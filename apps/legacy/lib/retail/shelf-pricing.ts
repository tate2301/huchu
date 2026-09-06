/**
 * The shelf price, resolved through the core price engine.
 *
 * S-3. Before this, `RetailCatalogItem.unitPrice` and `.taxPercent` were the
 * authoritative shelf price and core's `PriceList` / `ProductPrice` were never
 * read by retail at all. Two stores of the same fact, one of which nobody could
 * edit from the pricing screen. This module makes core the author and the
 * listing columns a shadow — S-4b then stops reading and writing the shadow
 * altogether, and `scripts/retail-drop-catalog-item.ts` removes it.
 *
 * ## The offline constraint stays satisfied
 *
 * `prisma/schema.prisma` states the blocker plainly: the offline till reads
 * `unitPrice`/`taxPercent` literally and "must not have to resolve a price list
 * with no network". Nothing here runs on the till. The **server** resolves, and
 * ships a flat snapshot — the same two numbers as before, plus a stamp saying
 * which list they came off and when. The till reads that snapshot exactly as
 * literally as it read the columns, so the offline runtime's read path is
 * unchanged and no slower.
 *
 * The stamp is the point. Today a cached price is a number with no provenance,
 * so a sale replayed after a price change cannot be told from a sale replayed
 * before one. `pricedAt` and `priceListId` make that difference visible, which
 * is what lets `pos/sync` stop trusting whatever the device sends.
 *
 * ## Which list
 *
 * The tenant's active `RETAIL` list, falling back to whichever list is default.
 * For every tenant that has a shelf list today these are the same row, which is
 * what `lib/inventory/retail-price-parity.test.ts` proves against the real
 * database before this code is allowed to be believed.
 *
 * ## Never fail to sell
 *
 * A listing with no `Product` behind it, or a product core has no row for,
 * falls back to the listing's own columns and says so through `priceSource`.
 * The parity test asserts no such listing exists; if one ever does, the shop
 * still trades and the fallback is visible in the payload rather than silent.
 */
import { choosePriceList, resolvePrice, type PriceEntry } from "@/lib/inventory/catalogue";
import { money, percent, toNumberOrZero, type MoneyLike } from "@corelithzw/platform/money";
import { prisma } from "@corelithzw/db/client";

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
   * `pos/sync` compares it against the moment a replayed sale was rung up: a
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

export type RetailPriceList = {
  id: string;
  name: string;
  currency: string;
  taxInclusive: boolean;
};

/**
 * The list a till prices against.
 *
 * An explicit `RETAIL` list wins; otherwise the company default, via the same
 * `choosePriceList` every other module uses so nobody invents a second
 * precedence.
 */
export async function activeRetailPriceList(
  companyId: string,
): Promise<RetailPriceList | null> {
  const lists = await prisma.priceList.findMany({
    where: { companyId },
    select: {
      id: true,
      name: true,
      kind: true,
      isDefault: true,
      isActive: true,
      currency: true,
      taxInclusive: true,
    },
  });

  const shelf = lists.find((list) => list.isActive && list.kind === "RETAIL");
  const chosen = choosePriceList(lists, { priceListId: shelf?.id ?? null });
  if (!chosen) return null;

  return {
    id: chosen.id,
    name: chosen.name,
    currency: chosen.currency,
    taxInclusive: chosen.taxInclusive,
  };
}

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

/**
 * Price a batch of listings through core.
 *
 * Three queries whatever the size of the batch — the list, the products, the
 * list's entries for exactly those products. A till bootstrapping 120 lines
 * must not make 120 round trips against a pooled connection.
 */
export async function resolveShelfPrices(
  companyId: string,
  listings: ShelfPricingListing[],
): Promise<Map<string, ShelfPrice>> {
  const pricedAt = new Date().toISOString();
  const resolved = new Map<string, ShelfPrice>();
  if (listings.length === 0) return resolved;

  const productIds = [
    ...new Set(
      listings
        .map((listing) => listing.productId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const priceList = await activeRetailPriceList(companyId);

  const [products, entries] = await Promise.all([
    productIds.length
      ? prisma.product.findMany({
          where: { id: { in: productIds }, companyId },
          select: {
            id: true,
            standardPrice: true,
            defaultTaxRate: true,
            currency: true,
            updatedAt: true,
          },
        })
      : Promise.resolve([]),
    priceList && productIds.length
      ? prisma.productPrice.findMany({
          where: { priceListId: priceList.id, productId: { in: productIds } },
          select: {
            productId: true,
            minQuantity: true,
            unitPrice: true,
            updatedAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const productById = new Map(products.map((product) => [product.id, product]));

  type StampedEntry = PriceEntry & { updatedAt: Date };
  const entriesByProduct = new Map<string, StampedEntry[]>();
  for (const entry of entries) {
    const list = entriesByProduct.get(entry.productId) ?? [];
    list.push({
      minQuantity: toNumberOrZero(entry.minQuantity),
      unitPrice: toNumberOrZero(entry.unitPrice),
      updatedAt: entry.updatedAt,
    });
    entriesByProduct.set(entry.productId, list);
  }

  for (const listing of listings) {
    const product = listing.productId ? productById.get(listing.productId) : undefined;
    if (!product) {
      resolved.set(listing.id, fromListing(listing, pricedAt));
      continue;
    }

    const quantity = listing.quantity ?? 1;
    const productEntries = entriesByProduct.get(product.id) ?? [];

    // `resolvePrice` is the core engine — the same function
    // `catalogue-service.priceProducts` calls, which is the one the parity test
    // exercises. Called directly rather than through `priceProduct` so a batch
    // can carry a different quantity per line and still cost three queries.
    const price = resolvePrice({
      standardPrice: toNumberOrZero(product.standardPrice),
      quantity,
      entries: productEntries,
      priceListId: priceList?.id ?? null,
      priceListName: priceList?.name ?? null,
    });

    // Which row the resolver actually used, so supersession is measured against
    // the row that produced this number rather than against the list as a whole.
    const usedEntry = productEntries
      .filter((entry) => quantity >= entry.minQuantity)
      .sort((a, b) => b.minQuantity - a.minQuantity)[0];

    resolved.set(listing.id, {
      unitPrice: toNumberOrZero(money(price.unitPrice)),
      taxPercent: toNumberOrZero(percent(product.defaultTaxRate)),
      // Only a list declares its convention. A price that fell all the way back
      // to `Product.standardPrice` has nothing saying the tax is inside it.
      taxInclusive: price.source === "STANDARD" ? false : (priceList?.taxInclusive ?? false),
      currency: priceList?.currency ?? product.currency ?? "USD",
      priceListId: price.source === "STANDARD" ? null : (priceList?.id ?? null),
      priceListName: price.source === "STANDARD" ? null : (priceList?.name ?? null),
      priceSource: price.source,
      pricedAt,
      priceChangedAt: (usedEntry?.updatedAt ?? product.updatedAt).toISOString(),
    });
  }

  return resolved;
}

/** One listing, priced. For the single-item admin route. */
export async function resolveShelfPrice(
  companyId: string,
  listing: ShelfPricingListing,
): Promise<ShelfPrice> {
  const resolved = await resolveShelfPrices(companyId, [listing]);
  return resolved.get(listing.id) ?? fromListing(listing, new Date().toISOString());
}

/**
 * The name S-4a's migration gave the list, and the name `upsertShelfListing`
 * upserts by. Changing it strands every tenant's shelf prices on a list nothing
 * looks for, and the till falls back to `Product.standardPrice` without saying so.
 *
 * S-4b: `upsertShelfListing` in `lib/retail/shelf-listing.ts` is what writes to
 * it now. The `linkListingToCore` that used to live here wrote a
 * `RetailCatalogItem` row beside the product, because the till still read one;
 * nothing reads one any more, so nothing writes one.
 */
export const SHELF_PRICE_LIST_NAME = "Shelf prices";
