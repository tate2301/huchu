import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/accounting/ledger";

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
    select: { id: true, total: true, status: true },
  });
  if (!invoice) return null;

  const [receipts, credits, writeOffs] = await Promise.all([
    db.salesReceipt.aggregate({
      where: { invoiceId, voidedAt: null },
      _sum: { amount: true },
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

  const amountPaid = toMoney(receipts._sum.amount);
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
      where: { billId },
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
