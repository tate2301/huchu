import { recalcPurchaseBillBalance, recalcSalesInvoiceBalance } from "@/lib/accounting/balances";
import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { prisma } from "@/lib/prisma";

/**
 * Revise moves the payments (books-final §4.3, §4.8, §5.12): voiding the old
 * invoice or bill left its payments on the party's account; when the new
 * one, which supersedes it, is issued or recorded for the same party, those
 * payments go onto it, whole, while they fit what it asks. What does not fit,
 * or a payment the party has since used elsewhere, stays on account. A new
 * one for another party takes none: the money stays with whoever paid.
 */

const round = (n: number) => Math.round(n * 100) / 100;

/** The ids a void's audit event says it left on account. */
async function leftOnAccount(companyId: string, eventType: string, entityId: string, field: string): Promise<string[]> {
  const event = await prisma.platformAuditEvent.findFirst({ where: { companyId, eventType, entityId }, orderBy: { createdAt: "desc" }, select: { payloadJson: true } });
  if (!event?.payloadJson) return [];
  try {
    const payload = JSON.parse(event.payloadJson) as Record<string, unknown>;
    const rows = payload[field];
    return Array.isArray(rows) ? rows.map((row) => (typeof row === "string" ? row : (row as { id?: string }).id)).filter((id): id is string => Boolean(id)) : [];
  } catch {
    return [];
  }
}

/** Whole payments, oldest first, while they fit what is owed. */
function fitting<T extends { id: string; amount: number }>(rows: T[], owed: number): T[] {
  const out: T[] = [];
  let left = round(owed);
  for (const row of rows) {
    if (row.amount > left + 0.005) continue;
    out.push(row);
    left = round(left - row.amount);
  }
  return out;
}

/** Moves the superseded invoice's payments onto the revision just issued. Returns the receipts moved. */
export async function moveReceiptsToRevision(companyId: string, invoiceId: string, actorId: string | null): Promise<string[]> {
  const invoice = await prisma.salesInvoice.findFirst({ where: { id: invoiceId, companyId }, select: { id: true, invoiceNumber: true, supersedesId: true, customerId: true, total: true, amountPaid: true, creditTotal: true, writeOffTotal: true } });
  if (!invoice?.supersedesId) return [];
  const ids = await leftOnAccount(companyId, "books.invoice.voided", invoice.supersedesId, "receiptsOnAccount");
  if (!ids.length) return [];
  const receipts = await prisma.salesReceipt.findMany({
    where: { companyId, id: { in: ids }, invoiceId: null, voidedAt: null, OR: [{ customerId: invoice.customerId }, { customerId: null }] },
    orderBy: { receivedAt: "asc" },
    select: { id: true, receiptNumber: true, amount: true },
  });
  const moving = fitting(receipts, invoice.total - invoice.amountPaid - invoice.creditTotal - invoice.writeOffTotal);
  if (!moving.length) return [];
  await prisma.$transaction(async (tx) => {
    await tx.salesReceipt.updateMany({ where: { id: { in: moving.map((row) => row.id) } }, data: { invoiceId: invoice.id, customerId: invoice.customerId } });
    await tx.paymentLedgerEntry.updateMany({ where: { companyId, sourceType: "SALES_RECEIPT", sourceId: { in: moving.map((row) => row.id) } }, data: { invoiceId: invoice.id, partyId: invoice.customerId } });
    await writePlatformAuditEvent(
      {
        companyId,
        actorId,
        eventType: "books.invoice.payments-moved",
        entityType: "SalesInvoice",
        entityId: invoice.id,
        payload: { number: invoice.invoiceNumber, from: invoice.supersedesId, receipts: moving.map((row) => ({ id: row.id, number: row.receiptNumber, amount: row.amount })) },
      },
      tx,
    );
  });
  await recalcSalesInvoiceBalance(invoice.id);
  return moving.map((row) => row.id);
}

/** Moves the superseded bill's payments onto the revision just recorded. Returns the payments moved. */
export async function movePaymentsToRevision(companyId: string, billId: string, actorId: string | null): Promise<string[]> {
  const bill = await prisma.purchaseBill.findFirst({ where: { id: billId, companyId }, select: { id: true, billNumber: true, supersedesId: true, vendorId: true, total: true, amountPaid: true, debitNoteTotal: true, writeOffTotal: true } });
  if (!bill?.supersedesId) return [];
  const ids = await leftOnAccount(companyId, "books.bill.payments-on-account", bill.supersedesId, "payments");
  if (!ids.length) return [];
  const payments = await prisma.purchasePayment.findMany({
    where: { companyId, id: { in: ids }, billId: null, status: "PAID", vendorId: bill.vendorId },
    orderBy: { paidAt: "asc" },
    select: { id: true, paymentNumber: true, amount: true },
  });
  const moving = fitting(payments, bill.total - bill.amountPaid - bill.debitNoteTotal - bill.writeOffTotal);
  if (!moving.length) return [];
  await prisma.$transaction(async (tx) => {
    await tx.purchasePayment.updateMany({ where: { id: { in: moving.map((row) => row.id) } }, data: { billId: bill.id } });
    await tx.paymentLedgerEntry.updateMany({ where: { companyId, sourceType: "PURCHASE_PAYMENT", sourceId: { in: moving.map((row) => row.id) } }, data: { billId: bill.id, partyId: bill.vendorId } });
    await writePlatformAuditEvent(
      {
        companyId,
        actorId,
        eventType: "books.bill.payments-moved",
        entityType: "PurchaseBill",
        entityId: bill.id,
        payload: { number: bill.billNumber, from: bill.supersedesId, payments: moving.map((row) => ({ id: row.id, number: row.paymentNumber, amount: row.amount })) },
      },
      tx,
    );
  });
  await recalcPurchaseBillBalance(bill.id);
  return moving.map((row) => row.id);
}
