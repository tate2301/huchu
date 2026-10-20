import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/accounting/ledger";
import { receiptAllocation } from "@/lib/books/core/currency";

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * What is paid, credited and written off on an invoice, from its receipts,
 * credit notes and write-offs, and whether that makes it PAID or ISSUED again.
 * A void receipt (`lib/books/void-receipt.ts`) pays nothing. `db` is a
 * transaction's client when the caller changes the receipts inside one.
 */
export async function recalcSalesInvoiceBalance(invoiceId: string, db: Db = prisma) {
  const invoice = await db.salesInvoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, companyId: true, total: true, status: true, currency: true, exchangeRate: true },
  });
  if (!invoice) return null;

  const [receiptRows, credits, writeOffs] = await Promise.all([
    db.salesReceipt.findMany({
      where: { invoiceId, voidedAt: null },
      select: { amount: true, currency: true, exchangeRate: true, receivedAt: true, createdAt: true },
    }),
    db.creditNote.aggregate({
      where: { invoiceId, status: "ISSUED" },
      _sum: { total: true },
    }),
    db.salesWriteOff.aggregate({
      where: { invoiceId, status: "POSTED" },
      _sum: { amount: true },
    }),
  ]);

  // A receipt in another currency pays its base value at the invoice currency's rate on its day (§5.9.3).
  let paid = 0;
  for (const receipt of receiptRows) paid += await receiptAllocation(invoice.companyId, invoice, receipt);
  const amountPaid = toMoney(paid);
  const creditTotal = toMoney(credits._sum.total);
  const writeOffTotal = toMoney(writeOffs._sum.amount);
  const balance = Math.max(0, toMoney(invoice.total) - amountPaid - creditTotal - writeOffTotal);

  let nextStatus = invoice.status;
  if (invoice.status !== "VOIDED") {
    if (balance <= 0 && invoice.status !== "DRAFT") {
      nextStatus = "PAID";
    } else if (invoice.status === "PAID" && balance > 0) {
      nextStatus = "ISSUED";
    }
  }

  await db.salesInvoice.update({
    where: { id: invoiceId },
    data: {
      amountPaid,
      creditTotal,
      writeOffTotal,
      status: nextStatus,
    },
  });

  return { amountPaid, creditTotal, writeOffTotal, balance, status: nextStatus };
}

export async function recalcPurchaseBillBalance(billId: string) {
  const bill = await prisma.purchaseBill.findUnique({
    where: { id: billId },
    select: { id: true, total: true, status: true },
  });
  if (!bill) return null;

  const [payments, debitNotes, writeOffs] = await Promise.all([
    prisma.purchasePayment.aggregate({
      // Only money that left (D5): a draft, one waiting for approval or a voided one pays nothing.
      where: { billId, status: "PAID" },
      _sum: { amount: true },
    }),
    prisma.debitNote.aggregate({
      where: { billId, status: "ISSUED" },
      _sum: { total: true },
    }),
    prisma.purchaseWriteOff.aggregate({
      where: { billId, status: "POSTED" },
      _sum: { amount: true },
    }),
  ]);

  const amountPaid = toMoney(payments._sum.amount);
  const debitNoteTotal = toMoney(debitNotes._sum.total);
  const writeOffTotal = toMoney(writeOffs._sum.amount);
  const balance = Math.max(0, toMoney(bill.total) - amountPaid - debitNoteTotal - writeOffTotal);

  let nextStatus = bill.status;
  if (bill.status !== "VOIDED") {
    if (balance <= 0 && bill.status !== "DRAFT") {
      nextStatus = "PAID";
    } else if (bill.status === "PAID" && balance > 0) {
      nextStatus = "RECEIVED";
    }
  }

  await prisma.purchaseBill.update({
    where: { id: billId },
    data: {
      amountPaid,
      debitNoteTotal,
      writeOffTotal,
      status: nextStatus,
    },
  });

  return { amountPaid, debitNoteTotal, writeOffTotal, balance, status: nextStatus };
}
