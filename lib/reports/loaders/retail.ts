import { prisma } from "@/lib/prisma";
import { dateRange } from "@/lib/reports/params";
import { day, label, num, personName, result, TAKE } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportParams } from "@/lib/reports/types";

/**
 * A figure on a sale, signed by what the sale was.
 *
 * Stored signs are not consistent: a refund's lines are stored negative
 * throughout, while a void carries a negative total beside a positive quantity
 * and cost. So the sign comes from the kind of sale and the size from the
 * stored value — a sale adds, a refund or a void takes away — and a column of
 * them sums to what actually changed hands.
 */
function signedBy(saleType: string, value: Parameters<typeof num>[0]): number {
  const size = Math.abs(num(value) ?? 0);
  // Zero is not negative: a void with no discount took off nothing, not "−0".
  if (size === 0) return 0;
  return saleType === "SALE" ? size : -size;
}

async function loadSales(ctx: ReportContext, params: ReportParams) {
  const found = await prisma.retailSale.findMany({
    where: { companyId: ctx.companyId, createdAt: dateRange(params) },
    select: {
      id: true,
      saleNo: true,
      createdAt: true,
      cashierName: true,
      customerName: true,
      saleType: true,
      status: true,
      subtotal: true,
      discountAmount: true,
      taxAmount: true,
      totalAmount: true,
      site: { select: { name: true } },
      cashier: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: TAKE,
  });
  return result(
    found.map((sale) => {
      // A sale whose status is voided took nothing at all.
      const money = (value: Parameters<typeof num>[0]) =>
        sale.status === "VOIDED" ? 0 : signedBy(sale.saleType, value);
      return {
        id: sale.id,
        saleNo: sale.saleNo,
        date: day(sale.createdAt),
        site: sale.site.name,
        cashier: sale.cashierName ?? personName(sale.cashier),
        customer: sale.customerName,
        type: label(sale.saleType),
        status: label(sale.status),
        subtotal: money(sale.subtotal),
        discount: money(sale.discountAmount),
        tax: money(sale.taxAmount),
        total: money(sale.totalAmount),
      };
    }),
  );
}

async function loadItemsSold(ctx: ReportContext, params: ReportParams) {
  const found = await prisma.retailSaleLine.findMany({
    where: {
      companyId: ctx.companyId,
      sale: { createdAt: dateRange(params), status: "POSTED" },
    },
    select: {
      id: true,
      itemName: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
      costTotal: true,
      sale: { select: { saleNo: true, createdAt: true, saleType: true } },
    },
    orderBy: { createdAt: "desc" },
    take: TAKE,
  });
  return result(
    found.map((line) => {
      const revenue = signedBy(line.sale.saleType, line.lineTotal);
      const cost = signedBy(line.sale.saleType, line.costTotal);
      return {
        id: line.id,
        item: line.itemName,
        date: day(line.sale.createdAt),
        saleNo: line.sale.saleNo,
        quantity: signedBy(line.sale.saleType, line.quantity),
        unitPrice: num(line.unitPrice),
        revenue,
        cost,
        margin: Math.round((revenue - cost) * 100) / 100,
      };
    }),
  );
}

async function loadStock(ctx: ReportContext) {
  const found = await prisma.inventoryItem.findMany({
    where: { site: { companyId: ctx.companyId } },
    select: {
      id: true,
      name: true,
      itemCode: true,
      category: true,
      currentStock: true,
      minStock: true,
      unitCost: true,
      site: { select: { name: true } },
    },
    orderBy: { name: "asc" },
    take: TAKE,
  });
  return result(
    found.map((item) => {
      const onHand = num(item.currentStock) ?? 0;
      const min = num(item.minStock);
      const unitCost = num(item.unitCost);
      return {
        id: item.id,
        item: item.name,
        code: item.itemCode,
        category: label(item.category),
        site: item.site.name,
        state: onHand <= 0 ? "Out" : min !== null && onHand <= min ? "Reorder" : "In stock",
        onHand,
        min,
        unitCost,
        value: unitCost === null ? null : Math.round(onHand * unitCost * 100) / 100,
      };
    }),
  );
}

async function loadTills(ctx: ReportContext, params: ReportParams) {
  const found = await prisma.retailShift.findMany({
    where: { companyId: ctx.companyId, openedAt: dateRange(params) },
    select: {
      id: true,
      shiftNo: true,
      registerName: true,
      cashierName: true,
      openedAt: true,
      status: true,
      openingFloat: true,
      expectedCash: true,
      countedCash: true,
      variance: true,
    },
    orderBy: { openedAt: "desc" },
    take: TAKE,
  });
  return result(
    found.map((shift) => ({
      id: shift.id,
      shiftNo: shift.shiftNo,
      register: shift.registerName,
      cashier: shift.cashierName,
      opened: day(shift.openedAt),
      status: label(shift.status),
      float: num(shift.openingFloat),
      expected: num(shift.expectedCash),
      counted: num(shift.countedCash),
      variance: num(shift.variance),
    })),
  );
}

export const RETAIL_LOADERS: Record<string, ReportLoader> = {
  "retail-sales": { load: loadSales },
  "retail-items-sold": { load: loadItemsSold },
  "retail-stock": { load: loadStock },
  "retail-shifts": { load: loadTills },
};
