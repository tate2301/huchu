/**
 * The catalogue's database side, and the one door modules come through.
 *
 * Modules import from here rather than reaching for `prisma.product` directly.
 * That is the whole extensibility story: when a new module needs the catalogue
 * it calls `priceProducts()` and writes an adapter, and never learns the shape
 * of a price list. If the pricing rules change, they change once.
 */
import type { Prisma, ProductKind } from "@prisma/client";

import { quantity, sumMoney, toNumber, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import {
  choosePriceList,
  toCatalogueLine,
  type CatalogueLine,
  type CatalogueProduct,
  type PriceEntry,
} from "./catalogue";

export type ProductFilters = {
  q?: string;
  kind?: ProductKind;
  category?: string;
  includeInactive?: boolean;
  /** Only what can be held in stock, for screens that only deal in goods. */
  stockableOnly?: boolean;
  ids?: string[];
};

export function buildProductWhere(
  companyId: string,
  filters: ProductFilters = {},
): Prisma.ProductWhereInput {
  return {
    companyId,
    ...(filters.includeInactive ? {} : { isActive: true, archivedAt: null }),
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.stockableOnly ? { kind: { in: ["GOODS", "MATERIAL"] } } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.ids ? { id: { in: filters.ids } } : {}),
    ...(filters.q
      ? {
          OR: [
            { name: { contains: filters.q, mode: "insensitive" as const } },
            { code: { contains: filters.q, mode: "insensitive" as const } },
            { description: { contains: filters.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

/** The price list to use, resolved once for a whole request. */
export async function activePriceList(
  companyId: string,
  preference?: { priceListId?: string | null; customerPriceListId?: string | null },
) {
  const lists = await prisma.priceList.findMany({
    where: { companyId },
    select: { id: true, name: true, kind: true, isDefault: true, isActive: true, currency: true },
  });
  return choosePriceList(lists, preference);
}

export type PricedProduct = CatalogueProduct & {
  category: string | null;
  imageUrl: string | null;
  isActive: boolean;
  line: CatalogueLine;
  /** Stock on hand across sites, present only for stockable items. */
  stock: { onHand: number; sites: { siteId: string; siteName: string; onHand: number }[] } | null;
};

/**
 * Products with a price already resolved for this buyer, and stock where it
 * applies.
 *
 * Three queries total no matter how many products come back: the products, the
 * price-list entries for exactly those products, and the stock rows. A picker
 * showing fifty items must not make fifty round trips.
 */
export async function priceProducts(
  companyId: string,
  filters: ProductFilters = {},
  options: {
    quantity?: number;
    priceListId?: string | null;
    customerPriceListId?: string | null;
    withStock?: boolean;
    limit?: number;
  } = {},
): Promise<{ products: PricedProduct[]; priceList: { id: string; name: string } | null }> {
  const [products, priceList] = await Promise.all([
    prisma.product.findMany({
      where: buildProductWhere(companyId, filters),
      orderBy: [{ category: "asc" }, { name: "asc" }],
      take: options.limit ?? 200,
    }),
    activePriceList(companyId, {
      priceListId: options.priceListId,
      customerPriceListId: options.customerPriceListId,
    }),
  ]);

  if (products.length === 0) {
    return { products: [], priceList: priceList ? { id: priceList.id, name: priceList.name } : null };
  }

  const productIds = products.map((product) => product.id);

  const [entries, stockRows] = await Promise.all([
    priceList
      ? prisma.productPrice.findMany({
          where: { priceListId: priceList.id, productId: { in: productIds } },
          select: { productId: true, minQuantity: true, unitPrice: true },
        })
      : Promise.resolve([]),
    options.withStock
      ? prisma.inventoryItem.findMany({
          // Scoped through Site, which is where InventoryItem carries its tenant.
          where: { productId: { in: productIds }, site: { companyId } },
          select: {
            productId: true,
            currentStock: true,
            site: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const entriesByProduct = new Map<string, PriceEntry[]>();
  for (const entry of entries) {
    const list = entriesByProduct.get(entry.productId) ?? [];
    // S-1 — these columns are `Decimal` in the database now. `catalogue.ts` is
    // still pure `number`, and moving price *resolution* onto `Decimal` is S-3;
    // this service is the one boundary that converts.
    list.push({
      minQuantity: toNumberOrZero(entry.minQuantity),
      unitPrice: toNumberOrZero(entry.unitPrice),
    });
    entriesByProduct.set(entry.productId, list);
  }

  /*
    S-1. `onHand` was accumulated with `+=` on a double. Summed across every
    site holding a line, that is the drift `lib/money.ts` exists to end — and
    an on-hand total that is 0.30000000000000004 renders as a stock figure
    nobody typed.

    Collected as `Decimal` and totalled once at the end. The map's values stay
    `number` because this is a serialiser and its output crosses JSON.
  */
  const stockByProduct = new Map<
    string,
    { amounts: Prisma.Decimal[]; sites: { siteId: string; siteName: string; onHand: number }[] }
  >();
  for (const row of stockRows) {
    if (!row.productId) continue;
    const current = stockByProduct.get(row.productId) ?? { amounts: [], sites: [] };
    current.amounts.push(quantity(row.currentStock));
    current.sites.push({
      siteId: row.site.id,
      siteName: row.site.name,
      onHand: toNumberOrZero(row.currentStock),
    });
    stockByProduct.set(row.productId, current);
  }

  return {
    priceList: priceList ? { id: priceList.id, name: priceList.name } : null,
    products: products.map((product) => {
      // Converted once, here, and used for both the response and the line — so a
      // product cannot be priced off one representation and rendered off another.
      const catalogue: CatalogueProduct = {
        id: product.id,
        code: product.code,
        name: product.name,
        description: product.description,
        kind: product.kind,
        unit: product.unit,
        unitLabel: product.unitLabel,
        standardPrice: toNumberOrZero(product.standardPrice),
        costPrice: toNumber(product.costPrice),
        defaultTaxRate: toNumberOrZero(product.defaultTaxRate),
        maxDiscountPercent: toNumber(product.maxDiscountPercent),
      };
      return {
        ...catalogue,
        category: product.category,
        imageUrl: product.imageUrl,
        isActive: product.isActive,
        line: toCatalogueLine(catalogue, {
          quantity: options.quantity,
          entries: entriesByProduct.get(product.id),
          priceListId: priceList?.id,
        }),
        // Null rather than zero for a service: "no stock record" and "none left"
        // are different facts and must not render the same.
        stock: (() => {
          const held = stockByProduct.get(product.id);
          if (!held) return null;
          // Totalled once, in Decimal, and turned into a number here at the
          // wire boundary rather than accumulated as one.
          return { onHand: toNumberOrZero(sumMoney(held.amounts)), sites: held.sites };
        })(),
      };
    }),
  };
}

/** One product, priced — for adding a single line to a document. */
export async function priceProduct(
  companyId: string,
  productId: string,
  options: { quantity?: number; priceListId?: string | null } = {},
): Promise<PricedProduct | null> {
  const { products } = await priceProducts(
    companyId,
    { ids: [productId], includeInactive: true },
    { ...options, withStock: true, limit: 1 },
  );
  return products[0] ?? null;
}
