import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { partyAging } from "./statement-aging";

/**
 * Whom the business owes, from the sub-ledger (books-final §6.1 fix 2, P2
 * exit): each supplier's posted payables lines (bills, debit notes and
 * write-offs against payments, retail's order cash and supplier payments
 * included), aged from each line's date. The control is the ledger's 2000
 * Accounts payable; the two agree when every payable posting has its line.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type AgingRow = { vendorId: string; name: string; current: number; days30: number; days60: number; days90: number; over90: number; total: number };

const round = (n: number) => Math.round(n * 100) / 100;

export async function supplierAging(companyId: string, asOf = new Date(), db: Db = prisma): Promise<{ rows: AgingRow[]; total: number }> {
  // The one aging (fix 14): the sub-ledger in the base currency at each document's frozen rate.
  const aged = await partyAging(companyId, "supplier", asOf, db);
  const rows = aged.rows.map((row) => ({ vendorId: row.partyId, name: row.name, current: row.current, days30: row.days30, days60: row.days60, days90: row.days90, over90: row.over90, total: row.total }));
  return { rows, total: round(rows.reduce((sum, row) => sum + row.total, 0)) };
}

/** What the ledger says is owed to suppliers: credits less debits on 2000 Accounts payable. */
export async function payablesControl(companyId: string, db: Db = prisma): Promise<number> {
  const [row] = await db.$queryRaw<Array<{ owed: number }>>`
    SELECT COALESCE(SUM(l."credit" - l."debit"), 0)::float8 AS owed
    FROM "JournalLine" l
    JOIN "JournalEntry" j ON j."id" = l."entryId" AND j."companyId" = ${companyId} AND j."status" = 'POSTED'
    JOIN "ChartOfAccount" a ON a."id" = l."accountId" AND a."code" = '2000'`;
  return round(row?.owed ?? 0);
}
