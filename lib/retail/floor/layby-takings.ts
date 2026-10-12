import type { Prisma, PrismaClient, RetailTenderType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type Db = PrismaClient | Prisma.TransactionClient;

/** A lay-by payment taken, or paid back (negative), on a drawer by a tender other than cash. */
export type LaybyTenderRow = { shiftId: string; tenderType: RetailTenderType; baseAmount: Prisma.Decimal };

/**
 * The lay-by money that went through these drawers by EcoCash, card and the
 * other non-cash tenders (FLR-06): deposits and payments in, refunds of a
 * cancelled lay-by out. It is on the tender's statement, so the cash-up's
 * check against the statement and the Z-report's tenders count it. Cash is
 * not here: a cash lay-by payment is already the drawer's own cash movement.
 */
export async function laybyNonCashOnShifts(companyId: string, shiftIds: string[], db: Db = prisma): Promise<LaybyTenderRow[]> {
  if (shiftIds.length === 0) return [];
  const rows = await db.retailLaybyPayment.findMany({
    where: { companyId, shiftId: { in: shiftIds }, tenderType: { not: "CASH" } },
    select: { shiftId: true, tenderType: true, baseAmount: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.flatMap((row) => (row.shiftId ? [{ shiftId: row.shiftId, tenderType: row.tenderType, baseAmount: row.baseAmount }] : []));
}
