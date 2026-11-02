import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { promotionProductIds } from "@/lib/retail/promotions/service";
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
  // Opened from a promotion: only the products it covers, each carrying the promotion for the parent filter.
  const covered = params.promotion ? new Set(await promotionProductIds(ctx.companyId, params.promotion)) : null;
  const since = new Date(Date.now() - COVER_WINDOW_DAYS * DAY_MS);
  const stockWhere: Prisma.InventoryItemWhereInput = { site: { companyId: ctx.companyId }, ...(siteId ? { siteId } : {}) };

  const [products, sold, refunded] = await Promise.all([
    prisma.product.findMany({
      // Ranged and not in the bin.
      where: { companyId: ctx.companyId, archivedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        barcode: true,
        kind: true,
        category: true,
        unit: true,
        unitLabel: true,
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
    // The product's price is its default list's, whatever another list charges right now.
    { baseOnly: true },
  );

  return result(
    products.filter((product) => !covered || covered.has(product.id)).map((product): ReportRow => {
      const lines = product.inventoryItems;
      const isService = product.kind === "SERVICE" || product.kind === "LABOUR";
      const onHand = lines.reduce((sum, line) => sum + (num(line.currentStock) ?? 0), 0);
      // "Reorder at" over the lines counted: summed across sites, as on hand is.
      const levels = lines.map((line) => num(line.minStock)).filter((value): value is number => value !== null);
      const reorderAt = levels.length ? levels.reduce((sum, value) => sum + value, 0) : null;
      const unit = lines[0]?.unit ?? (product.unit === "OTHER" ? product.unitLabel : product.unit ? product.unit.toLowerCase() : null);
      const sold30 = netSold(sold.get(product.id) ?? 0, refunded.get(product.id) ?? 0);
      const archived = !product.isActive;
      const stock = isService ? "In stock" : lines.length === 0 ? "In stock" : productStock({ onHand, reorderAt, sold30, archived });
      const cover = isService || lines.length === 0 ? null : coverDays(onHand, sold30);
      const price = prices.get(product.id);
      const vat = price?.taxPercent ?? num(product.defaultTaxRate) ?? 0;
      const categoryName = product.retailCategory?.name ?? product.category ?? null;
      const categoryId = product.categoryId ?? (product.category ? `custom:${product.category}` : null);
      const displayOnHand = isService || lines.length === 0 ? null : onHand;
      const displayOnHandLabel = isService || lines.length === 0 ? "—" : onHandLabel(onHand, unit);

      return {
        id: product.id,
        name: product.name,
        code: product.code,
        barcode: product.barcode,
        category: categoryName,
        categoryId,
        onHand: displayOnHand,
        unitWord: displayOnHand !== null ? unitWord(onHand, unit) : "",
        onHandLabel: displayOnHandLabel,
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
        cardMeta: [product.code, displayOnHandLabel !== "—" ? displayOnHandLabel : null, coverLabel(cover)].filter(Boolean).join(" · "),
        flag: archived ? "Archived" : stock === "In stock" ? null : stock,
        promotionId: params.promotion ?? null,
      };
    }),
  );
}

async function productOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const [categories, customCategories, sites] = await Promise.all([
    prisma.retailCategory.findMany({
      where: { companyId: ctx.companyId, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { companyId: ctx.companyId, archivedAt: null, category: { not: null } },
      select: { category: true },
      distinct: ["category"],
    }),
    prisma.site.findMany({
      where: { companyId: ctx.companyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const categoryOptions: ReportOption[] = categories.map((category) => ({ value: category.id, label: category.name }));
  for (const item of customCategories) {
    if (item.category && !categories.some((c) => c.name.toLowerCase() === item.category!.toLowerCase())) {
      categoryOptions.push({ value: `custom:${item.category}`, label: item.category });
    }
  }

  return {
    category: categoryOptions,
    site: sites.map((site) => ({ value: site.id, label: site.name })),
  };
}

export const PRODUCT_LOADERS: Record<string, ReportLoader> = {
  "retail-products": { load: loadProducts, options: productOptions, parentLabel: promotionName },
};

/** The promotion a products list is opened on, by its name. */
async function promotionName(ctx: ReportContext, filters: Record<string, string>): Promise<string | null> {
  if (!filters.promotion || !/^[0-9a-f-]{36}$/i.test(filters.promotion)) return null;
  const promotion = await prisma.retailPromotion.findFirst({ where: { id: filters.promotion, companyId: ctx.companyId }, select: { name: true } });
  return promotion ? `On ${promotion.name}` : null;
}
