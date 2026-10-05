import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { num, result } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportOption, ReportParams, ReportRow } from "@/lib/reports/types";
import {
  coverDays,
  coverFill,
  coverLabel,
  netSold,
  onHandLabel,
  productStock,
  unitWord,
  vatLabel,
} from "@/lib/retail/products/figures";
import { resolveShelfPrices } from "@/lib/retail/shelf-pricing";
import { COVER_WINDOW_DAYS } from "@/lib/retail/stock/levels";

/**
 * Products (20-products 4.1, `retail-products`): every product the shop ranges
 * — a product with a stock line, not in the bin — with its on hand, its 30
 * days of sales, its cover and its price on the default list.
 *
 * A shop ranges hundreds of lines, not thousands, so the list is in memory:
 * two grouped reads give every product's sales and refunds, and the engine
 * narrows, sorts, totals and pages. With `site` set, on hand and sales are that
 * site's alone.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Units on posted lines of one kind of sale, per product, since a moment. */
async function unitsSold(
  companyId: string,
  saleType: "SALE" | "REFUND",
  since: Date,
  siteId: string | null,
): Promise<Map<string, number>> {
  const sale: Prisma.RetailSaleWhereInput = {
    companyId,
    saleType,
    status: "POSTED",
    postedAt: { gte: since },
    ...(siteId ? { siteId } : {}),
  };
  const grouped = await prisma.retailSaleLine.groupBy({
    by: ["productId"],
    where: { companyId, productId: { not: null }, sale },
    _sum: { quantity: true },
  });
  return new Map(grouped.map((entry) => [entry.productId!, Math.abs(num(entry._sum.quantity) ?? 0)]));
}

async function loadProducts(ctx: ReportContext, params: ReportParams) {
  const siteId = params.site ?? null;
  const since = new Date(Date.now() - COVER_WINDOW_DAYS * DAY_MS);
  const stockWhere: Prisma.InventoryItemWhereInput = { site: { companyId: ctx.companyId }, ...(siteId ? { siteId } : {}) };

  const [products, sold, refunded] = await Promise.all([
    prisma.product.findMany({
      // Ranged (it has a stock line somewhere) and not in the bin.
      where: { companyId: ctx.companyId, archivedAt: null, inventoryItems: { some: { site: { companyId: ctx.companyId } } } },
      select: {
        id: true,
        code: true,
        name: true,
        barcode: true,
        isActive: true,
        standardPrice: true,
        defaultTaxRate: true,
        categoryId: true,
        retailCategory: { select: { name: true } },
        inventoryItems: {
          where: stockWhere,
          orderBy: { itemCode: "asc" },
          select: { currentStock: true, minStock: true, unit: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    unitsSold(ctx.companyId, "SALE", since, siteId),
    unitsSold(ctx.companyId, "REFUND", since, siteId),
  ]);

  const prices = await resolveShelfPrices(
    ctx.companyId,
    products.map((product) => ({
      id: product.id,
      productId: product.id,
      unitPrice: product.standardPrice,
      taxPercent: product.defaultTaxRate,
    })),
  );

  return result(
    products.map((product): ReportRow => {
      const lines = product.inventoryItems;
      const onHand = lines.reduce((sum, line) => sum + (num(line.currentStock) ?? 0), 0);
      // "Reorder at" over the lines counted: summed across sites, as on hand is.
      const levels = lines.map((line) => num(line.minStock)).filter((value): value is number => value !== null);
      const reorderAt = levels.length ? levels.reduce((sum, value) => sum + value, 0) : null;
      const unit = lines[0]?.unit ?? null;
      const sold30 = netSold(sold.get(product.id) ?? 0, refunded.get(product.id) ?? 0);
      const archived = !product.isActive;
      const stock = productStock({ onHand, reorderAt, sold30, archived });
      const cover = coverDays(onHand, sold30);
      const price = prices.get(product.id);
      const vat = price?.taxPercent ?? num(product.defaultTaxRate) ?? 0;
      return {
        id: product.id,
        name: product.name,
        code: product.code,
        barcode: product.barcode,
        category: product.retailCategory?.name ?? null,
        categoryId: product.categoryId,
        onHand,
        unitWord: unitWord(onHand, unit),
        onHandLabel: onHandLabel(onHand, unit),
        cover: coverLabel(cover),
        coverDays: cover,
        coverPct: coverFill(cover),
        price: price?.unitPrice ?? num(product.standardPrice) ?? 0,
        sold30,
        vat: vatLabel(vat),
        state: archived ? "Archived" : "Selling",
        stock,
        // The phone card: "AMARULA-750 · 13 bottles · 6 days", and its badge —
        // archived first, then what needs buying.
        cardMeta: [product.code, onHandLabel(onHand, unit), coverLabel(cover)].filter(Boolean).join(" · "),
        flag: archived ? "Archived" : stock === "In stock" ? null : stock,
      };
    }),
  );
}

async function productOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const [categories, sites] = await Promise.all([
    prisma.retailCategory.findMany({
      where: { companyId: ctx.companyId, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.site.findMany({
      where: { companyId: ctx.companyId, isActive: true, inventory: { some: { productId: { not: null } } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    category: categories.map((category) => ({ value: category.id, label: category.name })),
    site: sites.map((site) => ({ value: site.id, label: site.name })),
  };
}

export const PRODUCT_LOADERS: Record<string, ReportLoader> = {
  "retail-products": { load: loadProducts, options: productOptions },
};
