import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  buildRetailZReportFigures,
  parseTradingDay,
  tradingDayAsDate,
  tradingDayWindow,
} from "@/lib/retail/z-report";

/**
 * Taking a till's Z-report (S-7.2), moved here from the retail services so
 * that Close the day (FLR-07) takes every till's report inside its own
 * transaction: `db` is that transaction, or the client on its own.
 */

type Db = typeof prisma | Prisma.TransactionClient;

export type ZReportActor = { companyId: string; userId: string; userName?: string | null; userEmail?: string | null };

/** The currency the company keeps its books in (`AccountingSettings.baseCurrency`), USD before accounting is set up. */
async function companyBaseCurrency(companyId: string, db: Db) {
  const settings = await db.accountingSettings.findUnique({ where: { companyId }, select: { baseCurrency: true } });
  return settings?.baseCurrency?.trim().toUpperCase() || "USD";
}

/**
 * Closes one register's trading day and writes the Z-report down.
 *
 * S-7.2. The whole point of this function is that it happens **once**. A
 * Z-report is the fiscal close of a register-day: the takings are banked against
 * it, and it must read the same on a reprint a month later even though a sale has
 * since been voided, a shelf price has moved and the till has been renamed. So the
 * figures are computed here, from the rows as they stand right now, and persisted.
 * Nothing recomputes them afterwards.
 *
 * ── The re-run rule ────────────────────────────────────────────────────────
 *
 * Asking twice returns the same document. That is enforced in three places and the
 * database is the one that counts:
 *
 *  1. A lookup on `(companyId, registerCode, businessDate)` short-circuits before
 *     any work is done — the ordinary case, a manager reopening the screen.
 *  2. `RetailZReport_companyId_registerCode_businessDate_key` refuses the insert
 *     regardless. Two managers pressing the button in the same second cannot both
 *     win a read-then-write race, because the race is not what decides.
 *  3. The `P2002` that (2) raises is caught and turned into a read of the row that
 *     won, not into an error. The loser of the race gets the same document as the
 *     winner, which is the only correct answer.
 *
 * `created` says which happened, so the caller can answer 200 or 201 honestly.
 *
 * ── An open drawer is an X-report, and this is not that ────────────────────
 *
 * A register with a shift still open has not finished its day, and a "final"
 * document over an unfinished one is a lie that cannot be withdrawn. So this
 * refuses, and names the shift. Reading a day mid-trade is what the reports screen
 * and the cash-up screen are for — they recompute every time and promise nothing,
 * which is exactly what an X-report is.
 */
export async function generateRetailZReportTransaction(
  input: { actor: ZReportActor; registerCode: string; businessDate: string },
  db: Db = prisma,
) {
  const businessDate = parseTradingDay(input.businessDate);
  const registerCode = input.registerCode.trim();
  if (!registerCode) {
    throw new Error("A Z-report is taken for one register");
  }

  const existing = await db.retailZReport.findUnique({
    where: {
      companyId_registerCode_businessDate: {
        companyId: input.actor.companyId,
        registerCode,
        businessDate: tradingDayAsDate(businessDate),
      },
    },
    include: { site: { select: { name: true } } },
  });
  if (existing) {
    return { report: existing, created: false };
  }

  const { data, stillOpen } = await tillDayReport({ actor: input.actor, registerCode, businessDate }, db);
  if (stillOpen) {
    throw new Error(`Cash up and close ${stillOpen} before taking the end-of-day report`);
  }

  try {
    const report = await db.retailZReport.create({
      data,
      include: { site: { select: { name: true } } },
    });
    return { report, created: true };
  } catch (error) {
    // The other manager got there first. Their document is the document. Inside a
    // caller's transaction the refusal has already aborted it, so it is the
    // caller's to answer (Close the day: "closed already").
    if (db === prisma && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await db.retailZReport.findUniqueOrThrow({
        where: {
          companyId_registerCode_businessDate: {
            companyId: input.actor.companyId,
            registerCode,
            businessDate: tradingDayAsDate(businessDate),
          },
        },
        include: { site: { select: { name: true } } },
      });
      return { report: winner, created: false };
    }
    throw error;
  }
}

/**
 * One till's trading day as its Z-report reads it, computed from the rows as
 * they stand and not stored: what the generator persists, and the X-report
 * End of day prints while the day is open. `stillOpen` names a shift still
 * open on it.
 */
export async function tillDayReport(
  input: { actor: ZReportActor; registerCode: string; businessDate: string },
  db: Db = prisma,
) {
  const businessDate = parseTradingDay(input.businessDate);
  const registerCode = input.registerCode.trim();
  const { start, end } = tradingDayWindow(businessDate);
  // The drawer is the unit, so the drawer's opening decides the day — see
  // `lib/retail/z-report.ts`. Filtering sales on `postedAt` instead would move a
  // basket rung at 00:15 onto tomorrow's report while its cash sat in tonight's
  // till.
  const shifts = await db.retailShift.findMany({
    where: {
      companyId: input.actor.companyId,
      registerCode,
      openedAt: { gte: start, lt: end },
    },
    orderBy: { openedAt: "asc" },
  });

  if (shifts.length === 0) {
    throw new Error(`No till was opened on ${registerCode} on ${businessDate}`);
  }

  const shiftIds = shifts.map((shift) => shift.id);
  const [movements, sales, baseCurrency] = await Promise.all([
    db.retailCashMovement.findMany({
      where: { companyId: input.actor.companyId, shiftId: { in: shiftIds } },
      orderBy: { createdAt: "asc" },
    }),
    // No `status` filter, deliberately. A sale later voided keeps `status: VOIDED`
    // and its cancelling `VOID` row carries the negated amounts, so summing both
    // nets to zero. Dropping the voided original and keeping the reversal would
    // drive the day negative by the value of every cancelled basket.
    db.retailSale.findMany({
      where: { companyId: input.actor.companyId, shiftId: { in: shiftIds } },
      include: {
        payments: { select: { tenderType: true, baseAmount: true } },
        lines: {
          select: {
            inventoryItemId: true,
            productId: true,
            itemName: true,
            quantity: true,
            lineTotal: true,
            product: { select: { code: true } },
          },
        },
      },
    }),
    companyBaseCurrency(input.actor.companyId, db),
  ]);

  const movementsByShift = new Map<string, typeof movements>();
  for (const movement of movements) {
    const list = movementsByShift.get(movement.shiftId) ?? [];
    list.push(movement);
    movementsByShift.set(movement.shiftId, list);
  }
  const salesByShift = new Map<string, typeof sales>();
  for (const sale of sales) {
    if (!sale.shiftId) continue;
    const list = salesByShift.get(sale.shiftId) ?? [];
    list.push(sale);
    salesByShift.set(sale.shiftId, list);
  }

  const figures = buildRetailZReportFigures({
    businessDate,
    registerCode,
    // The last shift's naming wins, and it is snapshotted here rather than joined
    // later: a till renamed in March must not restate a report locked in February.
    registerName: shifts[shifts.length - 1].registerName,
    siteId: shifts[shifts.length - 1].siteId,
    currency: baseCurrency,
    shifts: shifts.map((shift) => ({
      id: shift.id,
      shiftNo: shift.shiftNo,
      cashierName: shift.cashierName,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
      openingFloat: shift.openingFloat,
      openingFloatZigBase: shift.openingFloatZigBase,
      countedCash: shift.countedCash,
      variance: shift.variance,
      movements: (movementsByShift.get(shift.id) ?? []).map((movement) => ({
        type: movement.type,
        reasonCode: movement.reasonCode,
        baseAmount: movement.baseAmount,
      })),
      sales: (salesByShift.get(shift.id) ?? []).map((sale) => ({
        saleType: sale.saleType,
        discountAmount: sale.discountAmount,
        taxAmount: sale.taxAmount,
        totalAmount: sale.totalAmount,
        depositAmount: sale.depositAmount,
        changeAmount: sale.changeAmount ?? 0,
        exchangeRate: sale.exchangeRate,
        payments: sale.payments,
        status: sale.status,
        approvedById: sale.approvedById,
        lines: sale.lines.map((line) => ({
          // The product is the identity a shop thinks in; the stock row is the
          // fallback for a line rung against an item with no product behind it.
          itemKey: line.productId ?? line.inventoryItemId,
          itemName: line.itemName,
          sku: line.product?.code ?? null,
          quantity: line.quantity,
          lineTotal: line.lineTotal,

        })),
      })),
    })),
  });

  const data = {
    companyId: input.actor.companyId,
    reportNo: figures.reportNo,
    businessDate: tradingDayAsDate(figures.businessDate),
    registerCode: figures.registerCode,
    registerName: figures.registerName,
    siteId: figures.siteId,
    currency: figures.currency,
    generatedById: input.actor.userId,
    generatedByName: input.actor.userName || input.actor.userEmail || "Cashier",
    shiftCount: figures.shiftCount,
    saleCount: figures.saleCount,
    refundCount: figures.refundCount,
    voidCount: figures.voidCount,
    itemCount: figures.itemCount,
    grossSales: figures.grossSales,
    discountTotal: figures.discountTotal,
    netSales: figures.netSales,
    taxTotal: figures.taxTotal,
    taxRatePercent: figures.taxRatePercent,
    grossTakings: figures.grossTakings,
    depositTotal: figures.depositTotal,
    refundTotal: figures.refundTotal,
    voidTotal: figures.voidTotal,
    openingFloat: figures.openingFloat,
    cashTakings: figures.cashTakings,
    cashDropTotal: figures.cashDropTotal,
    cashTopUpTotal: figures.cashTopUpTotal,
    cashPayoutTotal: figures.cashPayoutTotal,
    cashMovementNet: figures.cashMovementNet,
    expectedCash: figures.expectedCash,
    countedCash: figures.countedCash,
    cashVariance: figures.cashVariance,
    tenderBreakdown: figures.tenderBreakdown,
    topItems: figures.topItems,
    cashMovements: figures.cashMovements,
    shifts: figures.shifts,
  };

  return { data, stillOpen: shifts.find((shift) => shift.status === "OPEN")?.shiftNo ?? null };
}
