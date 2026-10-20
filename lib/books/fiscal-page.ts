import type { Prisma, PrismaClient } from "@prisma/client";

import { fiscalRegister } from "@/lib/books/core/fiscal-register";

import { asOf, dayOf, shortDay, weekday } from "./format";
import type { FiscalTab } from "./fiscal-labels";

/**
 * Books → Tax → Fiscal register (BkFiscal): every document sent to the fiscal
 * device, its FDMS result (its verification code, or how often it was tried),
 * the fiscal days, and what failed and waits to be retried. Fiscal setup lives
 * in Management (Shop › Fiscal device); this page only reads and retries.
 */

type Db = PrismaClient;

export type FiscalRow = {
  id: string;
  number: string;
  kind: string;
  customer: string | null;
  sent: string;
  day: number | null;
  amount: number | null;
  currency: string;
  status: "Valid" | "Failed" | "Pending";
  code: string | null;
  attempts: number;
  error: string | null;
};

export type FiscalDayRow = { id: string; no: number; opened: string; closed: string | null; receipts: number; status: "Open" | "Closing" | "Closed"; error: string | null };

export type FiscalPage = {
  tab: FiscalTab;
  finding: { fact: string; rest: string | null };
  counts: { documents: number; days: number; failed: number };
  sums: { valid: number; failed: number };
  rows: FiscalRow[];
  days: FiscalDayRow[];
  range: { from: number; to: number; of: number; page: number };
  hasDevice: boolean;
};

const KIND: Record<string, string> = { invoice: "Tax invoice", "credit-note": "Credit note", "school-receipt": "Fee receipt", "till-sale": "Till sale" };
const PAGE = 50;

export function fiscalFinding(openDay: { no: number; receipts: number } | null, failed: Array<{ number: string; sentDay: string }>, today: string): { fact: string; rest: string | null } {
  const fact = openDay ? `Fiscal day ${openDay.no} is open with ${openDay.receipts} ${openDay.receipts === 1 ? "receipt" : "receipts"} signed.` : "No fiscal day is open.";
  if (failed.length === 0) return { fact, rest: "Every document sent is signed." };
  if (failed.length === 1) {
    const gap = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${failed[0].sentDay}T00:00:00Z`)) / 86_400_000);
    const when = gap === 0 ? "today" : gap < 7 ? `from ${weekday(failed[0].sentDay)}` : `from ${shortDay(failed[0].sentDay)}`;
    return { fact, rest: `${failed[0].number} ${when} isn’t signed.` };
  }
  return { fact, rest: `${failed.length} documents aren’t signed.` };
}

export async function readFiscal(db: Db, companyId: string, { tab = "documents", q = "", kind = null, status = null, page = 1 }: { tab?: FiscalTab; q?: string; kind?: string | null; status?: string | null; page?: number } = {}, now = new Date()): Promise<FiscalPage> {
  const today = dayOf(now);
  const window = { from: new Date(now.getTime() - 400 * 86_400_000), to: now };
  const register = await fiscalRegister(companyId, window, now, db);
  const needle = q.trim();
  const where: Prisma.FiscalReceiptWhereInput = {
    companyId,
    ...(tab === "failed" ? { status: "FAILED" } : status === "Valid" ? { status: "SUCCESS" } : status === "Failed" ? { status: "FAILED" } : status === "Pending" ? { status: "PENDING" } : {}),
    ...(kind === "invoice" ? { invoiceId: { not: null } } : kind === "credit-note" ? { creditNoteId: { not: null } } : kind === "till-sale" ? { retailSaleId: { not: null } } : kind === "school-receipt" ? { schoolReceiptId: { not: null } } : {}),
    ...(needle
      ? {
          OR: [
            { invoice: { invoiceNumber: { contains: needle, mode: "insensitive" } } },
            { creditNote: { noteNumber: { contains: needle, mode: "insensitive" } } },
            { invoice: { customer: { name: { contains: needle, mode: "insensitive" } } } },
            { fiscalNumber: { contains: needle, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [total, receipts, device] = await Promise.all([
    db.fiscalReceipt.count({ where }),
    db.fiscalReceipt.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (Math.max(1, page) - 1) * PAGE,
      take: PAGE,
      select: {
        id: true,
        status: true,
        createdAt: true,
        issuedAt: true,
        receiptNumber: true,
        fiscalNumber: true,
        receiptCurrency: true,
        attemptCount: true,
        lastError: true,
        invoiceId: true,
        creditNoteId: true,
        schoolReceiptId: true,
        fiscalDay: { select: { fiscalDayNo: true } },
        invoice: { select: { invoiceNumber: true, total: true, currency: true, customer: { select: { name: true } } } },
        creditNote: { select: { noteNumber: true, total: true, currency: true, invoice: { select: { customer: { select: { name: true } } } } } },
        retailSale: { select: { saleNo: true, totalAmount: true, customerName: true } },
        schoolReceipt: { select: { receiptNo: true, amountReceived: true } },
      },
    }),
    db.fiscalisationProviderConfig.findFirst({ where: { companyId }, select: { id: true } }),
  ]);
  const rows: FiscalRow[] = receipts.map((row) => {
    const kindKey = row.invoiceId ? "invoice" : row.creditNoteId ? "credit-note" : row.schoolReceiptId ? "school-receipt" : "till-sale";
    const amount = row.invoice ? row.invoice.total : row.creditNote ? -row.creditNote.total : row.retailSale ? Number(row.retailSale.totalAmount) : row.schoolReceipt ? Number(row.schoolReceipt.amountReceived) : null;
    return {
      id: row.id,
      number: row.invoice?.invoiceNumber ?? row.creditNote?.noteNumber ?? row.retailSale?.saleNo ?? row.schoolReceipt?.receiptNo ?? row.receiptNumber ?? "—",
      kind: KIND[kindKey],
      customer: row.invoice?.customer.name ?? row.creditNote?.invoice.customer.name ?? row.retailSale?.customerName ?? null,
      sent: asOf(row.issuedAt ?? row.createdAt, now).replace(/^Today /, "Today ").replace(/^Yesterday /, "Yesterday "),
      day: row.fiscalDay?.fiscalDayNo ?? null,
      amount,
      currency: (row.invoice?.currency ?? row.creditNote?.currency ?? row.receiptCurrency ?? "USD").toUpperCase(),
      status: row.status === "SUCCESS" ? "Valid" : row.status === "FAILED" ? "Failed" : "Pending",
      code: row.fiscalNumber,
      attempts: row.attemptCount,
      error: row.lastError,
    };
  });
  const open = register.days.find((day) => day.status === "OPENED") ?? null;
  const failedDocs = register.documents.filter((doc) => doc.status === "FAILED");
  return {
    tab,
    finding: fiscalFinding(open ? { no: open.fiscalDayNo, receipts: open.receipts } : null, failedDocs.map((doc) => ({ number: doc.number ?? "A document", sentDay: (doc.issuedAt ?? new Date().toISOString()).slice(0, 10) })), today),
    counts: { documents: register.documents.length, days: register.days.length, failed: register.counts.failed },
    sums: { valid: register.counts.success, failed: register.counts.failed },
    rows,
    days: register.days.map((day) => ({
      id: day.id,
      no: day.fiscalDayNo,
      opened: asOf(new Date(day.openedAt), now),
      closed: day.closedAt ? asOf(new Date(day.closedAt), now) : null,
      receipts: day.receipts,
      status: day.status === "CLOSED" ? "Closed" : day.status === "CLOSING" ? "Closing" : "Open",
      error: day.error,
    })),
    range: { from: total === 0 ? 0 : (Math.max(1, page) - 1) * PAGE + 1, to: Math.min(total, Math.max(1, page) * PAGE), of: total, page: Math.max(1, page) },
    hasDevice: Boolean(device),
  };
}

