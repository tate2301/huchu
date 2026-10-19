import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Whom the business owes, from the sub-ledger (books-final §6.1 fix 2, P2
 * exit): each supplier's posted payables lines (bills, debit notes and
 * write-offs against payments, retail's order cash and supplier payments
 * included), aged from each line's date. The control is the ledger's 2000
 * Accounts payable; the two agree when every payable posting has its line.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type AgingRow = { vendorId: string; name: string; current: number; days30: number; days60: number; days90: number; over90: number; total: number };

const DAY = 86_400_000;
const round = (n: number) => Math.round(n * 100) / 100;

export async function supplierAging(companyId: string, asOf = new Date(), db: Db = prisma): Promise<{ rows: AgingRow[]; total: number }> {
  const lines = await db.paymentLedgerEntry.findMany({
    where: { companyId, accountType: "PAYABLE", status: "POSTED", entryDate: { lte: asOf }, partyId: { not: null } },
    select: { partyId: true, entryDate: true, debit: true, credit: true },
  });
  const ids = [...new Set(lines.map((line) => line.partyId!))];
  const vendors = ids.length ? await db.vendor.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = new Map(vendors.map((vendor) => [vendor.id, vendor.name]));
  const rows = new Map<string, AgingRow>();
  for (const line of lines) {
    const owed = line.credit - line.debit;
    if (owed === 0) continue;
    const row = rows.get(line.partyId!) ?? { vendorId: line.partyId!, name: names.get(line.partyId!) ?? "Supplier", current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 };
    const days = Math.floor((asOf.getTime() - line.entryDate.getTime()) / DAY);
    const bucket = days <= 30 ? "current" : days <= 60 ? "days30" : days <= 90 ? "days60" : days <= 120 ? "days90" : "over90";
    row[bucket] = round(row[bucket] + owed);
    row.total = round(row.total + owed);
    rows.set(line.partyId!, row);
  }
  const list = [...rows.values()].filter((row) => Math.abs(row.total) >= 0.005).sort((a, b) => b.total - a.total);
  return { rows: list, total: round(list.reduce((sum, row) => sum + row.total, 0)) };
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
