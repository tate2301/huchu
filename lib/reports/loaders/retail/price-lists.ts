import { prisma } from "@/lib/prisma";
import { num, result } from "@/lib/reports/loaders/shared";
import { marginOf, marginTone } from "@/lib/reports/margin";
import type { ReportContext, ReportLoader, ReportOption, ReportParams, ReportRow } from "@/lib/reports/types";
import { canSeeRetailCostPrice } from "@/lib/retail/permission-matrix";
import { listSub } from "@/lib/retail/price-lists/describe";
import { loadPriceListViews, type PriceListView } from "@/lib/retail/price-lists/service";
import { harareMoment } from "@/lib/retail/pricing/engine";
import { applyDuePriceChanges } from "@/lib/retail/prices/change";
import { scheduledWords } from "@/lib/retail/prices/words";

/**
 * Price lists (PRD-05, `retail-price-lists`) and one list's worksheet
 * (`retail-prices`). The lists come from the service's own words so the page,
 * the rules sheet and the toast never disagree.
 */

const STATE_WORDS = { ON: "In use", DRAFT: "Draft", PAUSED: "Paused" } as const;

/** "In use first": the default, then on, draft, paused. */
function rankOf(view: PriceListView): number {
  if (view.isDefault) return 0;
  return view.state === "ON" ? 1 : view.state === "DRAFT" ? 2 : 3;
}

async function loadPriceLists(ctx: ReportContext, params: ReportParams) {
  const site = typeof params.site === "string" && params.site !== "any" ? params.site : null;
  const views = (await loadPriceListViews(ctx.companyId)).filter((view) => !site || view.siteId === null || view.siteId === site);
  return result(
    views.map(
      (view): ReportRow => ({
        id: view.id,
        name: view.name,
        state: view.isDefault ? "Default" : STATE_WORDS[view.state],
        stateKey: view.state,
        rank: rankOf(view),
        usedWhen: view.usedWhen,
        pricesRule: view.pricesRule,
        products: view.products,
        belowCost: view.belowCost,
        changed: view.changedAt ? harareMoment(view.changedAt).day : null,
        audience: view.audience,
        siteId: view.siteId,
      }),
    ),
  );
}

async function priceListOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const sites = await prisma.site.findMany({
    where: { companyId: ctx.companyId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return { site: sites.map((site) => ({ value: site.id, label: site.name })) };
}

const LONG_DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Harare", day: "numeric", month: "long", year: "numeric" });

/** A product with no category target is held to this margin. */
export const DEFAULT_TARGET_MARGIN = 25;

const round2 = (value: number) => Math.round(value * 100) / 100;

async function loadPrices(ctx: ReportContext, params: ReportParams) {
  const listId = typeof params.list === "string" ? params.list : null;
  if (!listId) return result([]);
  const list = await prisma.priceList.findFirst({
    where: { id: listId, companyId: ctx.companyId, archivedAt: null },
    select: { id: true, name: true, minQuantity: true },
  });
  if (!list) return result([]);
  const fallback = await prisma.priceList.findFirst({ where: { companyId: ctx.companyId, isDefault: true, archivedAt: null }, select: { name: true } });
  // Changes come due are on the list before it is read (PRD-07), as at the till.
  await applyDuePriceChanges(ctx.companyId);

  const [rows, changes] = await Promise.all([
    prisma.productPrice.findMany({
      where: { priceListId: list.id, minQuantity: list.minQuantity, product: { archivedAt: null } },
      select: {
        productId: true,
        unitPrice: true,
        product: {
          select: {
            name: true,
            code: true,
            barcode: true,
            costPrice: true,
            defaultTaxRate: true,
            categoryId: true,
            supplierId: true,
            retailCategory: { select: { name: true, targetMarginPercent: true } },
          },
        },
      },
    }),
    prisma.productPriceChange.findMany({
      where: { priceListId: list.id, cancelledAt: null },
      orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
      select: { productId: true, fromPrice: true, appliedAt: true, effectiveAt: true },
    }),
  ]);

  // Per product: the last applied change (Was, Changed) and the next scheduled one.
  const applied = new Map<string, (typeof changes)[number]>();
  const scheduled = new Map<string, Date>();
  for (const change of changes) {
    if (change.appliedAt) {
      if (!applied.has(change.productId)) applied.set(change.productId, change);
    } else {
      const at = scheduled.get(change.productId);
      if (!at || change.effectiveAt < at) scheduled.set(change.productId, change.effectiveAt);
    }
  }

  // Nothing worked out from the cost leaves here for a role that may not see
  // it: a margin or a profit beside the price gives the cost away.
  const seeCost = canSeeRetailCostPrice(ctx.role);
  return result(
    rows.map((row): ReportRow => {
      const price = num(row.unitPrice) ?? 0;
      const cost = seeCost ? num(row.product.costPrice) : null;
      const margin = marginOf(price, cost);
      const belowCost = cost !== null && price < cost;
      // The category's target, else the shop's usual 25%.
      const target = num(row.product.retailCategory?.targetMarginPercent ?? null) ?? DEFAULT_TARGET_MARGIN;
      const last = applied.get(row.productId);
      const next = scheduled.get(row.productId);
      const vat = num(row.product.defaultTaxRate);
      return {
        id: row.productId,
        productId: row.productId,
        priceListId: list.id,
        // What "Remove from this list" asks with.
        listName: list.name,
        defaultListName: fallback?.name ?? list.name,
        name: row.product.name,
        code: row.product.code,
        barcode: row.product.barcode,
        ...(seeCost
          ? {
              cost,
              margin,
              marginTone: marginTone(margin, target, belowCost),
              targetMargin: target,
              underCost: belowCost ? "Yes" : "No",
              profit: cost !== null ? round2(price - cost) : 0,
              pricedCost: cost !== null ? price : 0,
            }
          : {}),
        price,
        was: last?.fromPrice ? num(last.fromPrice) : null,
        changed: next ? scheduledWords(next) : last?.appliedAt ? LONG_DAY.format(last.appliedAt) : null,
        changedTone: next ? "info" : null,
        changedOn: last?.appliedAt ? harareMoment(last.appliedAt).day : null,
        vat,
        category: row.product.retailCategory?.name ?? null,
        categoryId: row.product.categoryId,
        supplierId: row.product.supplierId,
        cardMeta: [row.product.code, margin === null ? null : `margin ${margin.toFixed(1)}%`].filter(Boolean).join(" · "),
      };
    }),
  );
}

async function pricesOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const [categories, suppliers] = await Promise.all([
    prisma.retailCategory.findMany({ where: { companyId: ctx.companyId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.vendor.findMany({ where: { companyId: ctx.companyId, products: { some: {} } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return {
    category: categories.map((category) => ({ value: category.id, label: category.name })),
    supplier: suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
  };
}

/** The worksheet's header: the list's name, and "Default price list · all tills · all sites". */
async function priceListName(ctx: ReportContext, filters: Record<string, string>) {
  const id = filters.list;
  if (!id) return null;
  const list = await prisma.priceList.findFirst({
    where: { id, companyId: ctx.companyId, archivedAt: null },
    select: { name: true, isDefault: true, _count: { select: { entries: { where: { product: { archivedAt: null } } } } } },
  });
  return list ? { label: list.name, sub: listSub(list, list._count.entries), facts: { isDefault: list.isDefault ? "Yes" : "No" } } : null;
}

export const PRICE_LIST_LOADERS: Record<string, ReportLoader> = {
  "retail-price-lists": { load: loadPriceLists, options: priceListOptions },
  "retail-prices": { load: loadPrices, options: pricesOptions, parentLabel: priceListName },
};
