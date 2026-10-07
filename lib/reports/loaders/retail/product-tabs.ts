import type { Prisma, RetailPriceChangeSource } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { periodInstants } from "@/lib/reports/list-query";
import { num, personName, result } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportParams, ReportRow } from "@/lib/reports/types";
import { dayKey, DEFAULT_TIME_ZONE, formatMediumDay, formatWhen } from "@/lib/workspace/format";

/**
 * The product record's tabs (PRD-04), each read for one product (the
 * `product` parent): its sales, its price history and its suppliers. A
 * product has a few hundred sale lines a month at most, so each loads in
 * memory and the engine sorts, totals and pages. Without a product they have
 * no rows.
 */

const ZONE = DEFAULT_TIME_ZONE;

/** The product, when it is this company's. */
async function productOf(ctx: ReportContext, params: ReportParams) {
  if (!params.product) return null;
  return prisma.product.findFirst({
    where: { id: params.product, companyId: ctx.companyId },
    select: { id: true, supplierId: true },
  });
}

async function loadSales(ctx: ReportContext, params: ReportParams) {
  const product = await productOf(ctx, params);
  if (!product) return result([]);
  const range = params.when ? periodInstants(params.when, new Date(), ZONE) : undefined;
  const postedAt: Prisma.DateTimeNullableFilter = { not: null, ...(range?.gte ? { gte: range.gte } : {}), ...(range?.lt ? { lt: range.lt } : {}) };
  const lines = await prisma.retailSaleLine.findMany({
    where: {
      companyId: ctx.companyId,
      productId: product.id,
      sale: { companyId: ctx.companyId, status: "POSTED", saleType: { in: ["SALE", "REFUND"] }, postedAt },
    },
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
      sale: {
        select: {
          id: true,
          saleNo: true,
          postedAt: true,
          cashierName: true,
          cashier: { select: { name: true, email: true } },
          register: { select: { name: true } },
        },
      },
    },
  });
  return result(
    lines.map((line): ReportRow => {
      const at = line.sale.postedAt!;
      return {
        id: line.id,
        productId: product.id,
        saleId: line.sale.id,
        at: at.toISOString(),
        date: dayKey(at, ZONE),
        whenText: formatWhen(at, ZONE),
        saleNo: line.sale.saleNo,
        till: line.sale.register?.name ?? null,
        cashier: personName(line.sale.cashier) ?? line.sale.cashierName,
        quantity: num(line.quantity),
        price: num(line.unitPrice),
        total: num(line.lineTotal),
      };
    }),
  );
}

/** How a price changed, in the shop's words. */
export const PRICE_HOW: Record<RetailPriceChangeSource, string> = {
  ADDED: "Added",
  TYPED: "Typed",
  BULK: "Changed many at once",
  FOLLOWED: "Followed Retail",
  IMPORT: "Imported",
  REMOVED: "Taken off",
};

async function loadPriceHistory(ctx: ReportContext, params: ReportParams) {
  const product = await productOf(ctx, params);
  if (!product) return result([]);
  const now = new Date();
  const changes = await prisma.productPriceChange.findMany({
    where: { companyId: ctx.companyId, productId: product.id, cancelledAt: null },
    select: {
      id: true,
      fromPrice: true,
      toPrice: true,
      source: true,
      effectiveAt: true,
      appliedAt: true,
      priceList: { select: { name: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });
  return result(
    changes.map((change): ReportRow => {
      const at = change.effectiveAt;
      const scheduled = change.appliedAt === null && at > now;
      return {
        id: change.id,
        productId: product.id,
        at: at.toISOString(),
        whenText: `${scheduled ? "From " : ""}${formatWhen(at, ZONE)}`,
        state: scheduled ? "Scheduled" : null,
        list: change.priceList.name,
        from: num(change.fromPrice),
        to: num(change.toPrice),
        by: personName(change.createdBy) ?? "The shop",
        how: PRICE_HOW[change.source],
      };
    }),
  );
}

/**
 * The suppliers who deliver it. Deliveries name their supplier once Orders
 * (BUY-02) gives a delivery its `vendorId`; until then the only supplier the
 * product names is its own, so `deliveries` has nothing to group and every
 * figure reads as not delivered yet.
 */
type Delivered = { lastDelivered: Date | null; lastCost: number | null; delivered: number };

async function deliveriesByVendor(): Promise<Map<string, Delivered>> {
  return new Map();
}

async function loadSuppliers(ctx: ReportContext, params: ReportParams) {
  const product = await productOf(ctx, params);
  if (!product) return result([]);
  const delivered = await deliveriesByVendor();
  const ids = [...new Set([...delivered.keys(), ...(product.supplierId ? [product.supplierId] : [])])];
  const vendors = await prisma.vendor.findMany({ where: { companyId: ctx.companyId, id: { in: ids } }, select: { id: true, name: true } });
  return result(
    vendors.map((vendor): ReportRow => {
      const figures = delivered.get(vendor.id);
      const usual = vendor.id === product.supplierId;
      return {
        id: vendor.id,
        productId: product.id,
        supplierId: vendor.id,
        supplier: vendor.name,
        lastDelivered: figures?.lastDelivered ? dayKey(figures.lastDelivered, ZONE) : null,
        lastDeliveredText: figures?.lastDelivered ? `Last delivered ${formatMediumDay(figures.lastDelivered, ZONE)}` : "Not delivered yet",
        lastCost: figures?.lastCost ?? null,
        delivered: figures?.delivered ?? 0,
        usual: usual ? "Usual" : null,
        usualRank: usual ? 0 : 1,
      };
    }),
  );
}

export const PRODUCT_TAB_LOADERS: Record<string, ReportLoader> = {
  "retail-product-sales": { load: loadSales },
  "retail-product-price-history": { load: loadPriceHistory },
  "retail-product-suppliers": { load: loadSuppliers },
};
