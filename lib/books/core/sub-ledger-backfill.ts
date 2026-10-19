import type { AccountingSourceType, Prisma, PrismaClient } from "@prisma/client";

import { ledgerSourceId, syncPaymentLedgerEntryForSource } from "@/lib/accounting/payment-ledger";
import { prisma } from "@/lib/prisma";

/**
 * The sub-ledger lines a posting should have written and did not (books-final
 * §6.1 fix 2): before the line was written in the post's own transaction, a
 * post inside a caller's transaction (every CRM invoice and receipt) synced
 * through another connection that could not see the document yet, and wrote
 * nothing. For each posted journal of a type with a party and no line, the
 * line is written now from its document, as the post would have. Idempotent:
 * a source with a line is left alone, and no journal changes.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export const SUB_LEDGER_TYPES: AccountingSourceType[] = [
  "SALES_INVOICE",
  "SALES_RECEIPT",
  "SALES_CREDIT_NOTE",
  "SALES_WRITE_OFF",
  "PURCHASE_BILL",
  "PURCHASE_PAYMENT",
  "PURCHASE_DEBIT_NOTE",
  "PURCHASE_WRITE_OFF",
  // P2 (fix 1): retail's supplier money, an order's cash and its change.
  "RETAIL_REQUISITION_PAYOUT",
  "RETAIL_REQUISITION_CHANGE",
  "RETAIL_SUPPLIER_PAYMENT",
];

export async function writeMissingSubLedgerLines(companyId: string, db: Db = prisma): Promise<{ checked: number; written: number }> {
  const entries = await db.journalEntry.findMany({
    where: { companyId, status: "POSTED", reversedAt: null, sourceType: { in: SUB_LEDGER_TYPES }, sourceId: { not: null }, NOT: { sourceId: { startsWith: "void:" } } },
    orderBy: { entryDate: "asc" },
    select: { id: true, sourceType: true, sourceId: true },
  });
  const lines = await db.paymentLedgerEntry.findMany({ where: { companyId }, select: { sourceType: true, sourceId: true } });
  const have = new Set(lines.map((line) => `${line.sourceType}|${line.sourceId}`));
  let written = 0;
  for (const entry of entries) {
    const key = `${entry.sourceType}|${ledgerSourceId(entry.sourceType, entry.sourceId!)}`;
    if (have.has(key)) continue;
    const line = await syncPaymentLedgerEntryForSource({ companyId, sourceType: entry.sourceType, sourceId: entry.sourceId, journalEntryId: entry.id, db });
    if (line) {
      written += 1;
      have.add(key);
    }
  }
  return { checked: entries.length, written };
}
