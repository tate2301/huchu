/**
 * What the shop sells, read out of the one item master.
 *
 * S-4b. Until this file existed, retail's answer to "what is on the shelf" was
 * `RetailCatalogItem` — a second item master beside core `Product`, with its own
 * price columns, its own status enum and its own code. §1.2 of
 * `docs/retail/retail-stock-consolidation-plan-2026-08-13.md` retires it:
 * `Product` is what a thing *is*, `InventoryItem` is how much of it is at one
 * site, and a **listing is the pair**. Nothing else is needed to sell a bottle
 * over a counter.
 *
 * ## Why the pair, and not just the product
 *
 * A till is at a branch. `Product` is company-wide and carries no stock, so a
 * product on its own cannot say whether there is anything to sell or which stock
 * row a sale should decrement. `InventoryItem` carries `siteId`,
 * `currentStock` and `unitCost` — the three facts the counter needs and the
 * product does not have. Ranging a line is therefore exactly:
 * `InventoryItem.productId` is set. That is the same condition
 * S-4a established when it linked the three rows to each other.
 *
 * ## The identity the till uses
 *
 * `Product.id`. It used to be `RetailCatalogItem.id`, which is why
 * `RetailSaleLine` gained a `productId` beside its frozen `catalogItemId`, and
 * why the POS wire carries `productId` where it used to carry `catalogItemId`.
 * One identity, and it is the one the CRM, a quote and a job card already use.
 *
 * ## Status
 *
 * `Product.isActive` replaces `RetailCatalogItemStatus`. The enum only ever held
 * `ACTIVE` and `INACTIVE`, which is a boolean with extra steps. `archivedAt` is
 * the harder line: an archived product is off the range entirely and does not
 * appear on the back-office list either, which is what the old `DELETE` did by
 * removing the listing row. It is done by archiving rather than deleting because
 * 12,600 sale lines point at these products and a receipt reprint is not
 * negotiable.
 */
import { Prisma } from "@prisma/client";

import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { ageCheckFor } from "@/lib/retail/products/age-check";
import { resolveShelfPrices, type ShelfPriceSource } from "@/lib/retail/shelf-pricing";

/**
 * The two states a line can be in on the range. `RetailCatalogItemStatus` in
 * words, so the screens and the API keep the vocabulary the shop already reads.
 */
export type ShelfListingStatus = "ACTIVE" | "INACTIVE";

/** One sellable line: a product, the stock behind it, and what it costs. */
export type ShelfListing = {
  /** `Product.id`. The identity the till, the cart and the sale line all use. */
  id: string;
  productId: string;
  /** `Product.code` — the SKU, the catalogue code and the scanner's key, in one. */
  sku: string;
  name: string;
  barcode: string | null;
  description: string | null;
  imageUrl: string | null;
  /**
   * A liquor licence is not optional. Carried so the counter can be told to ask.
   * The product's own answer, else its category's (`ageCheckFor`).
   */
  ageRestricted: boolean;
  /** The most any discount may take off this product, in percent; null for no limit. */
  maxDiscountPercent: number | null;
  /** An empty that comes back for money, and what it is worth. */
  returnable: boolean;
  depositAmount: number | null;
  /** Sold at whatever the cashier types (airtime): the till asks for the price. */
  openPrice: boolean;
  /** A case: the single it opens into, and how many. Null on a single. */
  packOf: { id: string; name: string } | null;
  packSize: number | null;
  status: ShelfListingStatus;
  /** When it went in the bin; null while it is on the range. */
  binnedAt: string | null;
  unitPrice: number;
  taxPercent: number;
  taxInclusive: boolean;
  currency: string;
  priceListId: string | null;
  priceSource: ShelfPriceSource;
  pricedAt: string | null;
  inventoryItemId: string;
  siteId: string;
  /** The shop's own category, from Products › Categories. */
  categoryId: string | null;
  category: string | null;
  inventoryItem: {
    id: string;
    itemCode: string;
    name: string;
    currentStock: number;
    unit: string;
    locationId: string;
    /** Stock at or below this is low. Null when the shop never set one. */
    reorderLevel: number | null;
    /** How many to order when it is low. Null when the shop never set one. */
    reorderQty: number | null;
  } | null;
  site: { id: string; name: string; code: string } | null;
};

const listingSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  barcode: true,
  imageUrl: true,
  ageRestricted: true,
  maxDiscountPercent: true,
  returnable: true,
  depositAmount: true,
  openPrice: true,
  categoryId: true,
  retailCategory: { select: { name: true, ageRestricted: true } },
  packSize: true,
  packOf: { select: { id: true, name: true } },
  isActive: true,
  standardPrice: true,
  defaultTaxRate: true,
  archivedAt: true,
} satisfies Prisma.ProductSelect;

/**
 * Load the range.
 *
 * One query for the products, one for the stock rows behind them, and one batch
 * through the price engine — which is itself three queries whatever the size of
 * the batch. The stock rows are fetched separately rather than with a nested
 * `include` for the reason S-4a's migration gave: a required
 * relation that has lost its row makes Prisma throw on the whole query, and a
 * shop with one bad row should still be able to open its catalogue.
 */
export async function loadShelfListings(
  companyId: string,
  options: {
    /** Restrict to one branch. The till always passes this; the back office may not. */
    siteId?: string | null;
    search?: string | null;
    /** Only what the till may ring up. The back office lists inactive lines too. */
    activeOnly?: boolean;
    /** Filter the back-office list the way the old `status` query parameter did. */
    status?: ShelfListingStatus | null;
    category?: string | null;
    /** Narrow to named products. Used by the single-listing read. */
    productIds?: readonly string[];
    take?: number;
    /** Read binned lines too: only the record page, which draws the bin banner. */
    includeBinned?: boolean;
  } = {},
): Promise<ShelfListing[]> {
  const { siteId, search, activeOnly, status, category, productIds, take, includeBinned } = options;

  const stockWhere: Prisma.InventoryItemWhereInput = {
    site: { companyId },
    ...(siteId ? { siteId } : {}),
  };

  const where: Prisma.ProductWhereInput = {
    companyId,
    // Archived is off the range, not merely inactive. See the header.
    ...(includeBinned ? {} : { archivedAt: null }),
    // A product with no stock row at this branch is not something this till can
    // sell, however well core describes it.
    inventoryItems: { some: stockWhere },
    ...(activeOnly ? { isActive: true } : {}),
    ...(status ? { isActive: status === "ACTIVE" } : {}),
    ...(productIds ? { id: { in: [...productIds] } } : {}),
    // The till's category chips name the shop's own categories.
    ...(category ? { retailCategory: { name: category } } : {}),
  };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
      { barcode: { contains: search, mode: "insensitive" } },
    ];
  }

  const products = await prisma.product.findMany({
    where,
    // Active first, then alphabetical — what `RetailCatalogItem`'s
    // `[{ status: "asc" }, { name: "asc" }]` came to, since ACTIVE sorts before
    // INACTIVE.
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: listingSelect,
    ...(take ? { take } : {}),
  });

  if (products.length === 0) return [];

  const stockRows = await prisma.inventoryItem.findMany({
    where: { ...stockWhere, productId: { in: products.map((product) => product.id) } },
    orderBy: { itemCode: "asc" },
    select: {
      id: true,
      itemCode: true,
      name: true,
      currentStock: true,
      minStock: true,
      reorderQty: true,
      unit: true,
      locationId: true,
      siteId: true,
      productId: true,
      site: { select: { id: true, name: true, code: true } },
    },
  });

  // First stock row wins, by item code. A product stocked at two branches with no
  // `siteId` filter has to be shown as one row — it is one thing the shop sells —
  // and the till, which is the caller that actually decrements stock, always
  // passes a `siteId` and therefore always sees exactly one.
  const stockByProduct = new Map<string, (typeof stockRows)[number]>();
  for (const row of stockRows) {
    if (!row.productId || stockByProduct.has(row.productId)) continue;
    stockByProduct.set(row.productId, row);
  }

  const priced = await resolveShelfPrices(
    companyId,
    products.map((product) => ({
      id: product.id,
      productId: product.id,
      unitPrice: product.standardPrice,
      taxPercent: product.defaultTaxRate,
    })),
  );

  const listings: ShelfListing[] = [];
  for (const product of products) {
    const stock = stockByProduct.get(product.id);
    // `inventoryItems: { some: stockWhere }` already guaranteed one exists; a
    // product that slipped through between the two queries is skipped rather than
    // listed with nothing to sell.
    if (!stock) continue;
    const shelf = priced.get(product.id);

    listings.push({
      id: product.id,
      productId: product.id,
      sku: product.code,
      name: product.name,
      barcode: product.barcode,
      description: product.description,
      imageUrl: product.imageUrl,
      ageRestricted: ageCheckFor(product),
      maxDiscountPercent: product.maxDiscountPercent === null ? null : toNumberOrZero(product.maxDiscountPercent),
      returnable: product.returnable,
      depositAmount: product.depositAmount === null ? null : toNumberOrZero(product.depositAmount),
      openPrice: product.openPrice,
      packOf: product.packOf,
      packSize: product.packOf ? product.packSize : null,
      status: product.isActive ? "ACTIVE" : "INACTIVE",
      binnedAt: product.archivedAt?.toISOString() ?? null,
      unitPrice: shelf?.unitPrice ?? toNumberOrZero(product.standardPrice),
      taxPercent: shelf?.taxPercent ?? toNumberOrZero(product.defaultTaxRate),
      taxInclusive: shelf?.taxInclusive ?? false,
      currency: shelf?.currency ?? "USD",
      priceListId: shelf?.priceListId ?? null,
      priceSource: shelf?.priceSource ?? "STANDARD",
      pricedAt: shelf?.pricedAt ?? null,
      inventoryItemId: stock.id,
      siteId: stock.siteId,
      categoryId: product.categoryId,
      category: product.retailCategory?.name ?? null,
      inventoryItem: {
        id: stock.id,
        itemCode: stock.itemCode,
        name: stock.name,
        // S-1 — the column is `Decimal(12,4)` now. `ShelfListing` is a wire
        // type and stays `number`: it crosses JSON to a till that has no
        // Decimal, and a bottle count is not a figure anything downstream does
        // money arithmetic on.
        currentStock: toNumberOrZero(stock.currentStock),
        unit: stock.unit,
        locationId: stock.locationId,
        reorderLevel: stock.minStock === null ? null : toNumberOrZero(stock.minStock),
        reorderQty: stock.reorderQty === null ? null : toNumberOrZero(stock.reorderQty),
      },
      site: stock.site,
    });
  }

  return listings;
}

/** One line, by product id. Returns null when the product is not this tenant's. */
export async function loadShelfListing(
  companyId: string,
  productId: string,
  options: { includeBinned?: boolean } = {},
): Promise<ShelfListing | null> {
  const [listing] = await loadShelfListings(companyId, { productIds: [productId], ...options });
  return listing ?? null;
}

/**
 * The stock row a sale should decrement, for a set of products at one branch.
 *
 * This is the join `RetailCatalogItem.inventoryItemId` used to hardcode. Doing it
 * by query means a product moved to another branch stops being sellable at the
 * old till the moment its stock does, rather than when somebody remembers to
 * edit a listing.
 */
export async function loadSellableProducts(input: {
  companyId: string;
  siteId: string;
  productIds: readonly string[];
}) {
  const productIds = [...new Set(input.productIds)];
  if (productIds.length === 0) {
    return { products: new Map<string, SellableProduct>(), missing: [] as string[] };
  }

  const rows = await prisma.inventoryItem.findMany({
    where: {
      siteId: input.siteId,
      site: { companyId: input.companyId },
      productId: { in: productIds },
      product: { companyId: input.companyId, isActive: true, archivedAt: null },
    },
    select: {
      id: true,
      itemCode: true,
      name: true,
      currentStock: true,
      unit: true,
      unitCost: true,
      locationId: true,
      siteId: true,
      productId: true,
      product: {
        select: {
          id: true,
          code: true,
          name: true,
          standardPrice: true,
          defaultTaxRate: true,
          ageRestricted: true,
          returnable: true,
          depositAmount: true,
          openPrice: true,
          retailCategory: { select: { ageRestricted: true } },
        },
      },
    },
  });

  const products = new Map<string, SellableProduct>();
  for (const row of rows) {
    if (!row.product || products.has(row.product.id)) continue;
    products.set(row.product.id, {
      productId: row.product.id,
      sku: row.product.code,
      name: row.product.name,
      standardPrice: row.product.standardPrice,
      defaultTaxRate: row.product.defaultTaxRate,
      // The same rule as the shelf: the product's own answer, else its category's.
      ageRestricted: ageCheckFor(row.product),
      returnable: row.product.returnable,
      depositAmount: row.product.depositAmount === null ? null : toNumberOrZero(row.product.depositAmount),
      openPrice: row.product.openPrice,
      siteId: row.siteId,
      inventoryItem: {
        id: row.id,
        itemCode: row.itemCode,
        name: row.name,
        currentStock: toNumberOrZero(row.currentStock),
        unit: row.unit,
        // `unitCost` is money and this one keeps its null: an item with no cost
        // recorded is not an item that cost nothing, and the margin column has
        // to be able to say so.
        unitCost: row.unitCost === null ? null : toNumberOrZero(row.unitCost),
        locationId: row.locationId,
      },
    });
  }

  return {
    products,
    missing: productIds.filter((id) => !products.has(id)),
  };
}

export type SellableProduct = {
  productId: string;
  sku: string;
  name: string;
  standardPrice: Prisma.Decimal;
  defaultTaxRate: Prisma.Decimal;
  ageRestricted: boolean;
  /** An empty that comes back for money, and the deposit on it. */
  returnable: boolean;
  depositAmount: number | null;
  /** Sold at whatever the cashier types: the typed price is the shelf price. */
  openPrice: boolean;
  siteId: string;
  inventoryItem: {
    id: string;
    itemCode: string;
    name: string;
    currentStock: number;
    unit: string;
    unitCost: number | null;
    locationId: string;
  };
};
