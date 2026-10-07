import { prisma } from "@/lib/prisma";
import { num, result } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportParams, ReportRow } from "@/lib/reports/types";
import { formatPercent } from "@/lib/workspace/format";
import { tenderLabel } from "@/lib/retail/words";

/**
 * The shift record's tab sources, read for one shift (the `shift` parent).
 * A shift has tens of sales, so each loads in memory. Every row carries the
 * shift's cashier, which a cashier's own scope reads.
 */

async function shiftFor(ctx: ReportContext, params: ReportParams) {
  if (!params.shift) return null;
  return prisma.retailShift.findFirst({
    where: { id: params.shift, companyId: ctx.companyId },
    select: { id: true, cashierId: true },
  });
}

const cents = (value: number) => Math.round(value * 100) / 100;

/** "Cash", or "Cash and card" when a sale was split. */
function paidWith(tenders: string[]): string | null {
  const labels = [...new Set(tenders.map((tender) => tenderLabel(tender)))];
  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0]!;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]!.toLowerCase()}`;
}

async function loadSales(ctx: ReportContext, params: ReportParams) {
  const shift = await shiftFor(ctx, params);
  if (!shift) return result([]);
  const sales = await prisma.retailSale.findMany({
    where: { companyId: ctx.companyId, shiftId: shift.id },
    orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      saleNo: true,
      saleType: true,
      status: true,
      sourceSaleId: true,
      baseAmount: true,
      postedAt: true,
      createdAt: true,
      lines: { select: { quantity: true } },
      payments: { select: { tenderType: true } },
    },
  });
  return result(
    sales.map(
      (sale): ReportRow => ({
        id: sale.id,
        shiftId: shift.id,
        cashierId: shift.cashierId,
        postedAt: (sale.postedAt ?? sale.createdAt).toISOString(),
        saleNo: sale.saleNo,
        // A void is not a page of its own: its row opens the sale it cancelled.
        saleId: sale.saleType === "VOID" ? sale.sourceSaleId : sale.id,
        items: sale.lines.reduce((sum, line) => sum + (num(line.quantity) ?? 0), 0),
        // A reversal says so where the tender would be, so the rows add up to
        // the Σ's "17 sales, 1 refund".
        paidWith:
          sale.saleType === "REFUND"
            ? "Refund"
            : sale.saleType === "VOID" || sale.status !== "POSTED"
              ? "Voided"
              : paidWith(sale.payments.map((payment) => payment.tenderType)),
        total: cents(num(sale.baseAmount) ?? 0),
      }),
    ),
  );
}

const MOVEMENT_WHAT: Record<string, string> = {
  DROP_TO_SAFE: "Drop to the safe",
  FLOAT_TOP_UP: "Float top-up",
  PAYOUT: "Paid out",
};

async function loadCash(ctx: ReportContext, params: ReportParams) {
  const shift = await shiftFor(ctx, params);
  if (!shift) return result([]);
  const movements = await prisma.retailCashMovement.findMany({
    where: { companyId: ctx.companyId, shiftId: shift.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true, reason: true, baseAmount: true, recordedByName: true, createdAt: true },
  });
  return result(
    movements.map((movement): ReportRow => {
      const size = Math.abs(num(movement.baseAmount) ?? 0);
      return {
        id: movement.id,
        shiftId: shift.id,
        cashierId: shift.cashierId,
        at: movement.createdAt.toISOString(),
        what: MOVEMENT_WHAT[movement.type] ?? movement.type,
        note: movement.reason,
        by: movement.recordedByName,
        // Out of the drawer is negative: what the drawer should hold goes down.
        amount: cents(movement.type === "FLOAT_TOP_UP" ? size : -size),
      };
    }),
  );
}

async function loadTenders(ctx: ReportContext, params: ReportParams) {
  const shift = await shiftFor(ctx, params);
  if (!shift) return result([]);
  const payments = await prisma.retailSalePayment.findMany({
    where: { companyId: ctx.companyId, sale: { shiftId: shift.id, companyId: ctx.companyId } },
    select: { tenderType: true, baseAmount: true, saleId: true },
  });
  const byTender = new Map<string, { amount: number; sales: Set<string> }>();
  for (const payment of payments) {
    const entry = byTender.get(payment.tenderType) ?? { amount: 0, sales: new Set<string>() };
    entry.amount += num(payment.baseAmount) ?? 0;
    entry.sales.add(payment.saleId);
    byTender.set(payment.tenderType, entry);
  }
  const all = [...byTender.values()].reduce((sum, entry) => sum + entry.amount, 0);
  return result(
    [...byTender.entries()].map(
      ([tender, entry]): ReportRow => ({
        id: tender,
        shiftId: shift.id,
        cashierId: shift.cashierId,
        paidWith: tenderLabel(tender),
        sales: entry.sales.size,
        amount: cents(entry.amount),
        share: all > 0 ? formatPercent((entry.amount / all) * 100) : null,
      }),
    ),
  );
}

export const SHIFT_RECORD_LOADERS: Record<string, ReportLoader> = {
  "retail-shift-sales": { load: loadSales },
  "retail-shift-cash": { load: loadCash },
  "retail-shift-tenders": { load: loadTenders },
};
