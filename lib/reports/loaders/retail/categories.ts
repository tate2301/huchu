import type { RetailBusinessType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { num, result } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportOption, ReportParams, ReportRow } from "@/lib/reports/types";
import { categoryPath, seedCategoriesIfNone, vatLabelOf, vatOf } from "@/lib/retail/categories";
import { COVER_WINDOW_DAYS } from "@/lib/retail/stock/levels";

/**
 * Categories (20-products 4.1, `retail-categories`): every live category with
 * its products, VAT, age check and target margin, and what its products sold
 * in the last 30 days — takings (VAT inclusive, after discounts, refunds
 * taken off) and the margin those takings made over their cost.
 *
 * "Shop type" narrows to the categories one business type's seed made, plus
 * the shop's own; it starts on the company's own type.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const SHOP_TYPE_WORDS: Record<RetailBusinessType, string> = { LIQUOR: "Liquor store", GENERAL: "General retail" };

const otherType = (type: RetailBusinessType): RetailBusinessType => (type === "LIQUOR" ? "GENERAL" : "LIQUOR");

async function businessTypeOf(companyId: string): Promise<RetailBusinessType> {
  const profile = await prisma.retailShopProfile.findUnique({ where: { companyId }, select: { businessType: true } });
  return profile?.businessType ?? "GENERAL";
}

/** Takings and their cost per category over the window: sales less refunds (refund lines are negative). */
async function soldByCategory(companyId: string, since: Date) {
  const grouped = await prisma.retailSaleLine.groupBy({
    by: ["productId"],
    where: {
      companyId,
      productId: { not: null },
      sale: { companyId, status: "POSTED", saleType: { in: ["SALE", "REFUND"] }, postedAt: { gte: since } },
    },
    _sum: { lineTotal: true, costTotal: true },
  });
  const products = await prisma.product.findMany({
    where: { companyId, id: { in: grouped.map((entry) => entry.productId!) } },
    select: { id: true, categoryId: true },
  });
  const categoryOf = new Map(products.map((product) => [product.id, product.categoryId]));
  const out = new Map<string, { takings: number; cost: number }>();
  for (const entry of grouped) {
    const categoryId = categoryOf.get(entry.productId!);
    if (!categoryId) continue;
    const sum = out.get(categoryId) ?? { takings: 0, cost: 0 };
    sum.takings += num(entry._sum.lineTotal) ?? 0;
    sum.cost += num(entry._sum.costTotal) ?? 0;
    out.set(categoryId, sum);
  }
  return out;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** The 30-day margin as a percentage, one place; null with no takings. */
export function marginNow(takings: number, cost: number): number | null {
  if (takings <= 0) return null;
  return Math.round(((takings - cost) / takings) * 1000) / 10;
}

async function loadCategories(ctx: ReportContext, params: ReportParams) {
  await seedCategoriesIfNone(ctx.companyId);
  const since = new Date(Date.now() - COVER_WINDOW_DAYS * DAY_MS);
  const own = await businessTypeOf(ctx.companyId);
  const shopType = params.shopType === "own" ? own : params.shopType === "other" ? otherType(own) : null;

  const [rows, sold] = await Promise.all([
    prisma.retailCategory.findMany({
      where: {
        companyId: ctx.companyId,
        archivedAt: null,
        ...(shopType ? { OR: [{ seededFor: shopType }, { seededFor: null }] } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        vatRate: true,
        vatExempt: true,
        ageRestricted: true,
        targetMarginPercent: true,
        parent: { select: { name: true } },
        _count: { select: { products: { where: { archivedAt: null } } } },
      },
    }),
    soldByCategory(ctx.companyId, since),
  ]);

  return result(
    rows.map((row): ReportRow => {
      const sales = sold.get(row.id) ?? { takings: 0, cost: 0 };
      const target = num(row.targetMarginPercent);
      const margin = marginNow(sales.takings, sales.cost);
      const vat = vatLabelOf(row);
      const products = row._count.products;
      return {
        id: row.id,
        name: categoryPath(row),
        parent: row.parent?.name ?? null,
        products,
        vat,
        ageCheck: row.ageRestricted ? "Yes" : "No",
        targetMargin: target === null ? null : `${target}%`,
        marginNow: margin,
        // Under the margin it aims for: the figure sits in the owed pill.
        marginTone: margin !== null && target !== null && margin < target ? "warn" : null,
        sold30: round2(sales.takings),
        profit30: round2(sales.takings - sales.cost),
        // The phone card: "6 products · 22.3% margin · 18+"; VAT only when it is not the standard rate.
        cardMeta: [
          `${products} ${products === 1 ? "product" : "products"}`,
          margin === null ? null : `${margin.toFixed(1)}% margin`,
          row.ageRestricted ? "18+" : null,
          vatOf(row) === "STANDARD" ? null : vat,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    }),
  );
}

async function categoryOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const own = await businessTypeOf(ctx.companyId);
  return {
    shopType: [
      { value: "own", label: SHOP_TYPE_WORDS[own] },
      { value: "other", label: SHOP_TYPE_WORDS[otherType(own)] },
    ],
  };
}

export const CATEGORY_LOADERS: Record<string, ReportLoader> = {
  "retail-categories": { load: loadCategories, options: categoryOptions },
};
