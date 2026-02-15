import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/accounting/ledger";

export async function recalcSalesInvoiceBalance(invoiceId: string) {
  const invoice = await prisma.salesInvoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, total: true, status: true },
  });
  if (!invoice) return null;

  const [receipts, credits, writeOffs] = await Promise.all([
    prisma.salesReceipt.aggregate({
      where: { invoiceId },
      _sum: { amount: true },
    }),
    prisma.creditNote.aggregate({
      where: { invoiceId, status: "ISSUED" },
      _sum: { total: true },
    }),
    prisma.salesWriteOff.aggregate({
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

  await prisma.salesInvoice.update({
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
