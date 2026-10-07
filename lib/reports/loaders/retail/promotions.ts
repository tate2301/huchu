import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { result } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportParams, ReportRow } from "@/lib/reports/types";
import { loadPromotionViews, promotionProductRows, type PromotionView } from "@/lib/retail/promotions/service";
import { formatMoney, formatShortDay, formatWhen } from "@/lib/workspace/format";

/**
 * Promotions (PRD-09): every promotion in the shop, read in memory (a shop
 * runs a handful), with its state by the clock and what it did; and a
 * promotion record's tabs, the products it covers and the sale lines it
 * discounted.
 */

const STATE_TONE = { ok: "ok", warn: "warn", info: "info", neutral: "neutral" } as const;

function promotionRow(view: PromotionView): ReportRow {
  const scheduled = view.state === "SCHEDULED";
  return {
    id: view.id,
    code: view.code,
    name: view.name,
    stateKey: view.state,
    state: view.badge.label,
    stateTone: STATE_TONE[view.badge.tone],
    typeKey: view.kind,
    type: view.kindLabel,
    appliesKey: view.scope === "EVERYTHING" && view.minBasket !== null ? "BASKET" : view.scope,
    appliesTo: view.appliesToShort,
    starts: view.startsAt,
    ends: view.endsAt,
    value: view.valueLabel,
    sold: scheduled ? null : view.figures.soldUnder,
    givenAway: scheduled ? null : view.figures.givenAway,
    // "PROMO-FESTIVE · Spirits, 12 · from 2 Sep"
    cardMeta: `${view.code} · ${view.appliesToShort} · from ${formatShortDay(view.startsAt)}`,
  };
}

async function loadPromotions(ctx: ReportContext) {
  const views = await loadPromotionViews(ctx.companyId);
  return result(views.map(promotionRow));
}

/** The promotion a record tab is opened on, as this company's. */
const isId = (value: string | undefined) => Boolean(value && /^[0-9a-f-]{36}$/i.test(value));

async function loadProducts(ctx: ReportContext, params: ReportParams) {
  if (!isId(params.promotion)) return result([]);
  const rows = (await promotionProductRows(ctx.companyId, params.promotion!, ctx.role)) ?? [];
  return result(
    rows.map(
      (row): ReportRow => ({
        id: row.productId,
        productId: row.productId,
        promotionId: params.promotion!,
        product: row.name,
        normal: row.normal,
        onPromotion: row.onPromotion,
        sold: row.sold,
        givenAway: row.givenAway,
        givenAwayText: formatMoney(row.givenAway),
        ...(row.margin === null && row.cost === null
          ? {}
          : {
              margin: row.margin,
              marginTone: row.marginTone,
              // The average margin over what it would sell at: profit ÷ the promotion prices that have a cost.
              profit: row.cost !== null && row.onPromotion !== null ? Math.round((row.onPromotion - row.cost) * 100) / 100 : 0,
              pricedCost: row.cost !== null && row.onPromotion !== null ? row.onPromotion : 0,
            }),
      }),
    ),
  );
}

async function loadSales(ctx: ReportContext, params: ReportParams) {
  if (!isId(params.promotion)) return result([]);
  const lines = await prisma.retailSaleLine.findMany({
    where: { companyId: ctx.companyId, promotionId: params.promotion!, sale: { status: "POSTED", saleType: "SALE" } },
    select: {
      id: true,
      itemName: true,
      quantity: true,
      promotionDiscount: true,
      sale: { select: { id: true, saleNo: true, postedAt: true, createdAt: true, register: { select: { name: true } } } },
    },
  });
  return result(
    lines.map((line): ReportRow => {
      const at = line.sale.postedAt ?? line.sale.createdAt;
      return {
        id: line.id,
        promotionId: params.promotion!,
        saleId: line.sale.id,
        saleNo: line.sale.saleNo,
        at: at.toISOString(),
        whenText: formatWhen(at.toISOString()),
        till: line.sale.register?.name ?? "Back office",
        product: line.itemName,
        quantity: toNumberOrZero(line.quantity),
        givenAway: toNumberOrZero(line.promotionDiscount),
      };
    }),
  );
}

export const PROMOTION_LOADERS: Record<string, ReportLoader> = {
  "retail-promotions": { load: loadPromotions },
  "retail-promotion-products": { load: loadProducts },
  "retail-promotion-sales": { load: loadSales },
};
