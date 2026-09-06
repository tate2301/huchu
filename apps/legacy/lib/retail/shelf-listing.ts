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
import { Prisma } from "@corelithzw/db";

import { money, moneyOrNull, percent, toNumberOrZero, type MoneyLike } from "@corelithzw/platform/money";
import { prisma } from "@corelithzw/db/client";
import {
  resolveShelfPrices,
  SHELF_PRICE_LIST_NAME,
  type ShelfPriceSource,
} from "@/lib/retail/shelf-pricing";

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
  /** A liquor licence is not optional. Carried so the counter can be told to ask. */
  ageRestricted: boolean;
  status: ShelfListingStatus;
  unitPrice: number;
  compareAtPrice: number | null;
  taxPercent: number;
  taxInclusive: boolean;
  currency: string;
  priceListId: string | null;
  priceSource: ShelfPriceSource;
  pricedAt: string | null;
  inventoryItemId: string;
  siteId: string;
  category: string | null;
  inventoryItem: {
    id: string;
    itemCode: string;
    name: string;
    currentStock: number;
    unit: string;
    locationId: string;
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
  isActive: true,
  standardPrice: true,
  compareAtPrice: true,
  defaultTaxRate: true,
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
  } = {},
): Promise<ShelfListing[]> {
  const { siteId, search, activeOnly, status, category, productIds, take } = options;

  const stockWhere: Prisma.InventoryItemWhereInput = {
    site: { companyId },
    ...(siteId ? { siteId } : {}),
    ...(category ? { category } : {}),
  };

  const where: Prisma.ProductWhereInput = {
    companyId,
    // Archived is off the range, not merely inactive. See the header.
    archivedAt: null,
    // A product with no stock row at this branch is not something this till can
    // sell, however well core describes it.
    inventoryItems: { some: stockWhere },
    ...(activeOnly ? { isActive: true } : {}),
    ...(status ? { isActive: status === "ACTIVE" } : {}),
    ...(productIds ? { id: { in: [...productIds] } } : {}),
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
      unit: true,
      locationId: true,
      category: true,
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
      ageRestricted: product.ageRestricted,
      status: product.isActive ? "ACTIVE" : "INACTIVE",
      unitPrice: shelf?.unitPrice ?? toNumberOrZero(product.standardPrice),
      compareAtPrice:
        product.compareAtPrice === null ? null : toNumberOrZero(product.compareAtPrice),
      taxPercent: shelf?.taxPercent ?? toNumberOrZero(product.defaultTaxRate),
      taxInclusive: shelf?.taxInclusive ?? false,
      currency: shelf?.currency ?? "USD",
      priceListId: shelf?.priceListId ?? null,
      priceSource: shelf?.priceSource ?? "STANDARD",
      pricedAt: shelf?.pricedAt ?? null,
      inventoryItemId: stock.id,
      siteId: stock.siteId,
      category: stock.category ?? null,
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
): Promise<ShelfListing | null> {
  const [listing] = await loadShelfListings(companyId, { productIds: [productId] });
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
      ageRestricted: row.product.ageRestricted,
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

/**
 * Create or edit one shelf line, writing core and nothing else.
 *
 * This replaces `linkListingToCore`, which wrote the same product and price *and*
 * a `RetailCatalogItem` row alongside them because the till still read the
 * listing. Now that nothing reads it, writing it would keep two item masters
 * alive on purpose — and `scripts/retail-drop-catalog-item.ts` would rightly
 * refuse to drop a table the application still writes.
 *
 * Three rows, in one transaction, because a product with no price on the shelf
 * list resolves to `Product.standardPrice` and quietly stops being the number the
 * pricing screen edits:
 *
 *  - the tenant's `RETAIL` shelf list, created on first use,
 *  - the `Product`, keyed on `@@unique([companyId, code])`,
 *  - its `ProductPrice` at a minimum quantity of one.
 *
 * `standardPrice` is written alongside the list entry deliberately: it is the
 * fallback the resolver reaches for when a list entry goes missing, and a
 * fallback that has drifted degrades to the wrong number rather than the old one.
 * `lib/inventory/retail-price-parity.test.ts` asserts the two stay equal.
 *
 * The stock row is linked in the same transaction. An `InventoryItem` with no
 * `productId` is not sellable at all now — `loadShelfListings` finds the range by
 * exactly that column — so leaving it unlinked would create a line the till
 * cannot see.
 */
export async function upsertShelfListing(input: {
  companyId: string;
  /** Null when creating. The product being edited, otherwise. */
  productId: string | null;
  /** `Product.code`. The SKU, and the catalogue code the shop reads. */
  sku: string;
  name: string;
  inventoryItemId: string;
  unitPrice: MoneyLike;
  taxPercent: MoneyLike;
  /** `undefined` leaves the stored value alone; `null` clears it. */
  description?: string | null;
  barcode?: string | null;
  imageUrl?: string | null;
  compareAtPrice?: MoneyLike | null;
  isActive?: boolean;
  currency?: string;
}): Promise<string> {
  const unitPrice = money(input.unitPrice);
  const taxPercent = percent(input.taxPercent);
  const compareAtPrice =
    input.compareAtPrice === undefined ? undefined : moneyOrNull(input.compareAtPrice);

  return prisma.$transaction(async (tx) => {
    const priceList = await tx.priceList.upsert({
      where: { companyId_name: { companyId: input.companyId, name: SHELF_PRICE_LIST_NAME } },
      create: {
        companyId: input.companyId,
        name: SHELF_PRICE_LIST_NAME,
        kind: "RETAIL",
        // A Zimbabwean shelf price is what the customer pays.
        taxInclusive: true,
        isActive: true,
        ...(input.currency ? { currency: input.currency } : {}),
      },
      update: {},
      select: { id: true },
    });

    const shared = {
      name: input.name,
      standardPrice: unitPrice,
      defaultTaxRate: taxPercent,
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.barcode === undefined ? {} : { barcode: input.barcode }),
      ...(input.imageUrl === undefined ? {} : { imageUrl: input.imageUrl }),
      ...(compareAtPrice === undefined ? {} : { compareAtPrice }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    } satisfies Prisma.ProductUpdateInput;

    const product = input.productId
      ? await tx.product.update({
          where: { id: input.productId },
          data: { ...shared, code: input.sku },
          select: { id: true },
        })
      : await tx.product.upsert({
          where: { companyId_code: { companyId: input.companyId, code: input.sku } },
          create: {
            companyId: input.companyId,
            code: input.sku,
            name: input.name,
            kind: "GOODS",
            description: input.description ?? null,
            barcode: input.barcode ?? null,
            imageUrl: input.imageUrl ?? null,
            standardPrice: unitPrice,
            compareAtPrice: compareAtPrice ?? null,
            defaultTaxRate: taxPercent,
            isActive: input.isActive ?? true,
            ...(input.currency ? { currency: input.currency } : {}),
          },
          update: shared,
          select: { id: true },
        });

    await tx.productPrice.upsert({
      where: {
        priceListId_productId_minQuantity: {
          priceListId: priceList.id,
          productId: product.id,
          minQuantity: new Prisma.Decimal(1),
        },
      },
      create: {
        companyId: input.companyId,
        priceListId: priceList.id,
        productId: product.id,
        minQuantity: new Prisma.Decimal(1),
        unitPrice,
      },
      update: { unitPrice },
    });

    // Only claims a stock row nobody else has claimed. Repointing an
    // `InventoryItem` that already belongs to another product would move a
    // different line's stock, which is a decision for a human.
    await tx.inventoryItem.updateMany({
      where: { id: input.inventoryItemId, OR: [{ productId: null }, { productId: product.id }] },
      data: { productId: product.id },
    });

    return product.id;
  });
}

/**
 * Take a line off the range without deleting anything a receipt needs.
 *
 * `DELETE /api/v2/retail/catalog/{id}` used to remove a `RetailCatalogItem` row
 * and leave the stock line alone. The equivalent on a `Product` cannot be a
 * delete: 12,600 sale lines point at these products, and although the foreign key
 * is `SET NULL` and `itemName` would still print, throwing away the link is
 * rewriting history to save a row. So the product is archived — off the till, off
 * the back-office list, and still attached to every sale it was ever part of —
 * and its shelf price is removed so a later un-archive cannot resurrect a stale
 * number.
 */
export async function archiveShelfListing(input: {
  companyId: string;
  productId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.productPrice.deleteMany({
      where: {
        productId: input.productId,
        companyId: input.companyId,
        priceList: { name: SHELF_PRICE_LIST_NAME },
      },
    });
    await tx.product.update({
      where: { id: input.productId },
      data: { isActive: false, archivedAt: new Date() },
    });
  });
}

export type SellableProduct = {
  productId: string;
  sku: string;
  name: string;
  standardPrice: Prisma.Decimal;
  defaultTaxRate: Prisma.Decimal;
  ageRestricted: boolean;
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
