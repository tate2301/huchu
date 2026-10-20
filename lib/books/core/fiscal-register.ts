import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Books → Fiscal register (books-final §4.17, §6.1 fix 15): the fiscal days,
 * every document sent to the device in a window, and what failed and waits
 * to be retried. Fiscal setup lives in Management; this only reads. A failed
 * receipt, or a day stuck in Closing, blocks the month's close.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type FiscalDocumentKind = "invoice" | "credit-note" | "school-receipt" | "till-sale";

export type FiscalRegister = {
  days: Array<{ id: string; fiscalDayNo: number; deviceId: string; status: string; openedAt: string; closedAt: string | null; receipts: number; error: string | null; stuck: boolean }>;
  documents: Array<{
    id: string;
    kind: FiscalDocumentKind;
    /** The document's own number: the invoice's, the note's, the till sale's. */
    number: string | null;
    receiptType: string | null;
    currency: string | null;
    status: string;
    fiscalNumber: string | null;
    globalNo: number | null;
    issuedAt: string | null;
    error: string | null;
    attempts: number;
    nextRetryAt: string | null;
  }>;
  /** Failed, or pending past their retry time: the ones to retry. */
  toRetry: number;
  counts: { success: number; pending: number; failed: number };
};

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

export async function fiscalRegister(companyId: string, window: { from: Date; to: Date }, now = new Date(), db: Db = prisma): Promise<FiscalRegister> {
  const [days, receipts] = await Promise.all([
    db.fiscalDay.findMany({
      where: { companyId, OR: [{ openedAt: { gte: window.from, lte: window.to } }, { status: { not: "CLOSED" } }] },
      orderBy: { openedAt: "desc" },
      select: { id: true, fiscalDayNo: true, deviceId: true, status: true, openedAt: true, closedAt: true, lastError: true, closingSince: true, _count: { select: { receipts: true } } },
    }),
    db.fiscalReceipt.findMany({
      where: { companyId, OR: [{ createdAt: { gte: window.from, lte: window.to } }, { status: { in: ["FAILED", "PENDING"] } }] },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: {
        id: true,
        status: true,
        receiptType: true,
        receiptCurrency: true,
        fiscalNumber: true,
        receiptGlobalNo: true,
        receiptNumber: true,
        issuedAt: true,
        lastError: true,
        attemptCount: true,
        nextRetryAt: true,
        invoiceId: true,
        creditNoteId: true,
        schoolReceiptId: true,
        retailSaleId: true,
        invoice: { select: { invoiceNumber: true } },
        creditNote: { select: { noteNumber: true } },
        retailSale: { select: { saleNo: true } },
      },
    }),
  ]);
  const documents = receipts.map((row) => {
    const kind: FiscalDocumentKind = row.invoiceId ? "invoice" : row.creditNoteId ? "credit-note" : row.schoolReceiptId ? "school-receipt" : "till-sale";
    return {
      id: row.id,
      kind,
      number: row.invoice?.invoiceNumber ?? row.creditNote?.noteNumber ?? row.retailSale?.saleNo ?? row.receiptNumber ?? null,
      receiptType: row.receiptType,
      currency: row.receiptCurrency,
      status: row.status,
      fiscalNumber: row.fiscalNumber,
      globalNo: row.receiptGlobalNo,
      issuedAt: iso(row.issuedAt),
      error: row.lastError,
      attempts: row.attemptCount,
      nextRetryAt: iso(row.nextRetryAt),
    };
  });
  const toRetry = receipts.filter((row) => row.status === "FAILED" || (row.status === "PENDING" && (!row.nextRetryAt || row.nextRetryAt <= now))).length;
  return {
    days: days.map((day) => ({
      id: day.id,
      fiscalDayNo: day.fiscalDayNo,
      deviceId: day.deviceId,
      status: day.status,
      openedAt: day.openedAt.toISOString(),
      closedAt: iso(day.closedAt),
      receipts: day._count.receipts,
      error: day.lastError,
      stuck: day.status === "CLOSING",
    })),
    documents,
    toRetry,
    counts: {
      success: receipts.filter((row) => row.status === "SUCCESS").length,
      pending: receipts.filter((row) => row.status === "PENDING").length,
      failed: receipts.filter((row) => row.status === "FAILED").length,
    },
  };
}
