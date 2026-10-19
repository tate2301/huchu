import type { AccountingSourceType, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/accounting/ledger";
import { receiptAllocation } from "@/lib/books/core/currency";

type LedgerSeed = {
  companyId: string;
  sourceType: AccountingSourceType;
  sourceId: string;
  entryDate: Date;
  accountType: "RECEIVABLE" | "PAYABLE";
  partyType: "CUSTOMER" | "VENDOR";
  partyId?: string | null;
  invoiceId?: string | null;
  billId?: string | null;
  debit: number;
  credit: number;
  currency?: string | null;
  description?: string | null;
  journalEntryId?: string | null;
  /** VOIDED for a receipt voided in Books: aged debt and the customer's balance leave its line out. */
  status?: "POSTED" | "VOIDED";
};

type Db = PrismaClient | Prisma.TransactionClient;

function isVoidReference(sourceId: string) {
  return sourceId.startsWith("void:");
}

/**
 * The document a posting key names. A CRM invoice edited in place posts each
 * revision under `<id>:revision-<n>` (`salesInvoicePostingKey`); its line is
 * the invoice's own, keyed on the invoice id, so the revision finds it.
 */
export function ledgerSourceId(sourceType: AccountingSourceType, sourceId: string): string {
  if (sourceType === "SALES_INVOICE") {
    const revision = sourceId.match(/^(.+):revision-\d+$/);
    if (revision) return revision[1];
  }
  return sourceId;
}

/** A requisition's money posted again after a void takes the next round's key (`<id>:r2`); its line is the requisition's. */
const requisitionOf = (sourceId: string) => sourceId.replace(/:r\d+$/, "");

const VOIDED_SOURCE_TYPES: ReadonlySet<AccountingSourceType> = new Set([
  "SALES_INVOICE",
  "SALES_RECEIPT",
  "SALES_CREDIT_NOTE",
  "SALES_WRITE_OFF",
  "PURCHASE_BILL",
  "PURCHASE_PAYMENT",
  "PURCHASE_DEBIT_NOTE",
  "PURCHASE_WRITE_OFF",
  "RETAIL_REQUISITION_PAYOUT",
  "RETAIL_REQUISITION_CHANGE",
  "RETAIL_SUPPLIER_PAYMENT",
]);

async function buildLedgerSeed(
  db: Db,
  companyId: string,
  sourceType: AccountingSourceType,
  sourceId: string,
  journalEntryId?: string | null,
): Promise<LedgerSeed | null> {
  if (!sourceId || isVoidReference(sourceId)) return null;

  switch (sourceType) {
    case "SALES_INVOICE": {
      const invoice = await db.salesInvoice.findUnique({
        where: { id: sourceId },
        select: {
          id: true,
          companyId: true,
          customerId: true,
          invoiceDate: true,
          total: true,
          currency: true,
          invoiceNumber: true,
          status: true,
        },
      });
      if (!invoice || invoice.companyId !== companyId) return null;
      const amount = toMoney(invoice.total);
      return {
        companyId,
        sourceType,
        sourceId,
        entryDate: invoice.invoiceDate,
        accountType: "RECEIVABLE",
        partyType: "CUSTOMER",
        partyId: invoice.customerId,
        invoiceId: invoice.id,
        debit: amount,
        credit: 0,
        currency: invoice.currency,
        description: `Sales invoice ${invoice.invoiceNumber}`,
        journalEntryId,
        status: invoice.status === "VOIDED" ? "VOIDED" : "POSTED",
      };
    }
    case "SALES_RECEIPT": {
      const receipt = await db.salesReceipt.findUnique({
        where: { id: sourceId },
        include: {
          invoice: {
            select: { id: true, companyId: true, customerId: true, currency: true, exchangeRate: true, invoiceNumber: true },
          },
        },
      });
      if (!receipt || receipt.companyId !== companyId) return null;
      // On an invoice in another currency, the line is what it takes off the invoice, in the invoice's currency (§5.9.3).
      const crossCurrency = Boolean(receipt.invoice && receipt.currency && receipt.currency.toUpperCase() !== receipt.invoice.currency.toUpperCase());
      const amount = crossCurrency ? toMoney(await receiptAllocation(companyId, receipt.invoice!, receipt)) : toMoney(receipt.amount);
      // A receipt taken off a voided or deleted invoice is the customer's money on account: its line keeps the customer.
      const kept = receipt.invoice
        ? null
        : await db.paymentLedgerEntry.findUnique({
            where: { companyId_sourceType_sourceId: { companyId, sourceType, sourceId } },
            select: { partyId: true },
          });
      return {
        companyId,
        sourceType,
        sourceId,
        entryDate: receipt.receivedAt,
        accountType: "RECEIVABLE",
        partyType: "CUSTOMER",
        partyId: receipt.customerId ?? receipt.invoice?.customerId ?? kept?.partyId ?? null,
        invoiceId: receipt.invoiceId,
        debit: 0,
        credit: amount,
        currency: crossCurrency ? receipt.invoice!.currency : (receipt.currency ?? receipt.invoice?.currency ?? "USD"),
        description: `Sales receipt ${receipt.receiptNumber}`,
        journalEntryId,
        status: receipt.voidedAt ? "VOIDED" : "POSTED",
      };
    }
    case "SALES_CREDIT_NOTE": {
      const note = await db.creditNote.findUnique({
        where: { id: sourceId },
        include: {
          invoice: {
            select: { id: true, companyId: true, customerId: true, currency: true, invoiceNumber: true },
          },
        },
      });
      if (!note || note.companyId !== companyId) return null;
      const amount = toMoney(note.total);
      const invoice = note.invoice ?? null;
      return {
        companyId,
        sourceType,
        sourceId,
        entryDate: note.noteDate,
        accountType: "RECEIVABLE",
        partyType: "CUSTOMER",
        partyId: invoice?.customerId ?? null,
        invoiceId: note.invoiceId,
        debit: 0,
        credit: amount,
        currency: note.currency ?? invoice?.currency ?? "USD",
        description: `Credit note ${note.noteNumber}`,
        journalEntryId,
        status: note.status === "VOIDED" ? "VOIDED" : "POSTED",
      };
    }
    case "SALES_WRITE_OFF": {
      const writeOff = await db.salesWriteOff.findUnique({
        where: { id: sourceId },
        include: {
          invoice: {
            select: { id: true, companyId: true, customerId: true, currency: true, invoiceNumber: true },
          },
        },
      });
      if (!writeOff || writeOff.companyId !== companyId) return null;
      const amount = toMoney(writeOff.amount);
      const invoice = writeOff.invoice ?? null;
      return {
        companyId,
        sourceType,
        sourceId,
        entryDate: writeOff.createdAt,
        accountType: "RECEIVABLE",
        partyType: "CUSTOMER",
        partyId: invoice?.customerId ?? null,
        invoiceId: writeOff.invoiceId,
        debit: 0,
        credit: amount,
        currency: invoice?.currency ?? "USD",
        description: `Sales write-off ${invoice?.invoiceNumber ?? writeOff.id}`,
        journalEntryId,
        status: writeOff.status === "VOIDED" ? "VOIDED" : "POSTED",
      };
    }
    case "PURCHASE_BILL": {
      const bill = await db.purchaseBill.findUnique({
        where: { id: sourceId },
        select: {
          id: true,
          companyId: true,
          vendorId: true,
          billDate: true,
          total: true,
          currency: true,
          billNumber: true,
          status: true,
        },
      });
      if (!bill || bill.companyId !== companyId) return null;
      const amount = toMoney(bill.total);
      return {
        companyId,
        sourceType,
        sourceId,
        entryDate: bill.billDate,
        accountType: "PAYABLE",
        partyType: "VENDOR",
        partyId: bill.vendorId,
        billId: bill.id,
        debit: 0,
        credit: amount,
        currency: bill.currency,
        description: `Purchase bill ${bill.billNumber}`,
        journalEntryId,
        status: bill.status === "VOIDED" ? "VOIDED" : "POSTED",
      };
    }
    case "PURCHASE_PAYMENT": {
      const payment = await db.purchasePayment.findUnique({
        where: { id: sourceId },
        include: {
          bill: {
            select: { id: true, companyId: true, vendorId: true, currency: true, billNumber: true },
          },
        },
      });
      if (!payment || payment.companyId !== companyId) return null;
      const amount = toMoney(payment.amount);
      return {
        companyId,
        sourceType,
        sourceId,
        entryDate: payment.paidAt,
        accountType: "PAYABLE",
        partyType: "VENDOR",
        partyId: payment.bill?.vendorId ?? payment.vendorId ?? null,
        billId: payment.billId,
        debit: amount,
        credit: 0,
        currency: payment.bill?.currency ?? "USD",
        description: `Purchase payment ${payment.paymentNumber ?? ""}`.trim(),
        journalEntryId,
        status: payment.status === "VOIDED" ? "VOIDED" : "POSTED",
      };
    }
    // Retail's supplier money (books-final §5.5, fix 1): an order's cash paid out is an advance on
    // the supplier's account, the change back takes it down, and a payment group pays it.
    case "RETAIL_REQUISITION_PAYOUT":
    case "RETAIL_REQUISITION_CHANGE": {
      const requisition = await db.crmRequisition.findUnique({
        where: { id: requisitionOf(sourceId) },
        select: { companyId: true, requisitionNo: true, purchaseOrderId: true, payeeVendorId: true, paidAmount: true, changeAmount: true, disbursedAt: true, acquittedAt: true, currency: true },
      });
      if (!requisition || requisition.companyId !== companyId || !requisition.purchaseOrderId || !requisition.payeeVendorId) return null;
      const payout = sourceType === "RETAIL_REQUISITION_PAYOUT";
      const amount = toMoney(payout ? requisition.paidAmount : requisition.changeAmount);
      if (amount <= 0) return null;
      return {
        companyId,
        sourceType,
        sourceId,
        entryDate: (payout ? requisition.disbursedAt : requisition.acquittedAt) ?? new Date(),
        accountType: "PAYABLE",
        partyType: "VENDOR",
        partyId: requisition.payeeVendorId,
        debit: payout ? amount : 0,
        credit: payout ? 0 : amount,
        currency: requisition.currency,
        description: `${requisition.requisitionNo ?? "Requisition"} ${payout ? "paid out to the supplier" : "change back"}`,
        journalEntryId,
      };
    }
    case "RETAIL_SUPPLIER_PAYMENT": {
      const rows = await db.purchasePayment.findMany({
        where: { companyId, groupNo: sourceId, requisitionId: null, status: "PAID" },
        select: { amount: true, paidAt: true, vendorId: true, billId: true },
      });
      const first = rows[0];
      if (!first?.vendorId) return null;
      const bills = new Set(rows.map((row) => row.billId));
      return {
        companyId,
        sourceType,
        sourceId,
        entryDate: first.paidAt,
        accountType: "PAYABLE",
        partyType: "VENDOR",
        partyId: first.vendorId,
        billId: bills.size === 1 ? first.billId : null,
        debit: toMoney(rows.reduce((sum, row) => sum + row.amount, 0)),
        credit: 0,
        description: `Supplier payment ${sourceId}`,
        journalEntryId,
      };
    }
    case "PURCHASE_DEBIT_NOTE": {
      const note = await db.debitNote.findUnique({
        where: { id: sourceId },
        include: {
          bill: {
            select: { id: true, companyId: true, vendorId: true, currency: true, billNumber: true },
          },
        },
      });
      if (!note || note.companyId !== companyId) return null;
      const amount = toMoney(note.total);
      const bill = note.bill ?? null;
      return {
        companyId,
        sourceType,
        sourceId,
        entryDate: note.noteDate,
        accountType: "PAYABLE",
        partyType: "VENDOR",
        partyId: bill?.vendorId ?? null,
        billId: note.billId,
        debit: amount,
        credit: 0,
        currency: note.currency ?? bill?.currency ?? "USD",
        description: `Debit note ${note.noteNumber}`,
        journalEntryId,
        status: note.status === "VOIDED" ? "VOIDED" : "POSTED",
      };
    }
    case "PURCHASE_WRITE_OFF": {
      const writeOff = await db.purchaseWriteOff.findUnique({
        where: { id: sourceId },
        include: {
          bill: {
            select: { id: true, companyId: true, vendorId: true, currency: true, billNumber: true },
          },
        },
      });
      if (!writeOff || writeOff.companyId !== companyId) return null;
      const amount = toMoney(writeOff.amount);
      const bill = writeOff.bill ?? null;
      return {
        companyId,
        sourceType,
        sourceId,
        entryDate: writeOff.createdAt,
        accountType: "PAYABLE",
        partyType: "VENDOR",
        partyId: bill?.vendorId ?? null,
        billId: writeOff.billId,
        debit: amount,
        credit: 0,
        currency: bill?.currency ?? "USD",
        description: `Purchase write-off ${bill?.billNumber ?? writeOff.id}`,
        journalEntryId,
        status: writeOff.status === "VOIDED" ? "VOIDED" : "POSTED",
      };
    }
    default:
      return null;
  }
}

/**
 * Writes a posting's sub-ledger line, through `db` so it lands in the post's
 * own transaction (books-final §6.1 fix 2). A void's mirror (`void:<id>`)
 * marks the voided document's line VOIDED (fix 3), whichever route voided it;
 * a CRM invoice revision (`<id>:revision-<n>`) updates the invoice's line.
 */
export async function syncPaymentLedgerEntryForSource(input: {
  companyId: string;
  sourceType: AccountingSourceType;
  sourceId?: string | null;
  journalEntryId?: string | null;
  db?: Db;
}) {
  if (!input.sourceId) return null;
  const db = input.db ?? prisma;

  if (isVoidReference(input.sourceId)) {
    if (!VOIDED_SOURCE_TYPES.has(input.sourceType)) return null;
    const voided = ledgerSourceId(input.sourceType, input.sourceId.slice("void:".length));
    await db.paymentLedgerEntry.updateMany({
      where: { companyId: input.companyId, sourceType: input.sourceType, sourceId: voided },
      data: { status: "VOIDED" },
    });
    return null;
  }

  const seed = await buildLedgerSeed(
    db,
    input.companyId,
    input.sourceType,
    ledgerSourceId(input.sourceType, input.sourceId),
    input.journalEntryId ?? null,
  );
  if (!seed) return null;

  const amount = toMoney(seed.debit + seed.credit);

  return db.paymentLedgerEntry.upsert({
    where: {
      companyId_sourceType_sourceId: {
        companyId: seed.companyId,
        sourceType: seed.sourceType,
        sourceId: seed.sourceId,
      },
    },
    update: {
      entryDate: seed.entryDate,
      accountType: seed.accountType,
      partyType: seed.partyType,
      partyId: seed.partyId ?? null,
      invoiceId: seed.invoiceId ?? null,
      billId: seed.billId ?? null,
      debit: toMoney(seed.debit),
      credit: toMoney(seed.credit),
      amount,
      currency: seed.currency ?? "USD",
      description: seed.description ?? null,
      journalEntryId: seed.journalEntryId ?? null,
      status: seed.status ?? "POSTED",
    },
    create: {
      companyId: seed.companyId,
      sourceType: seed.sourceType,
      sourceId: seed.sourceId,
      entryDate: seed.entryDate,
      accountType: seed.accountType,
      partyType: seed.partyType,
      partyId: seed.partyId ?? null,
      invoiceId: seed.invoiceId ?? null,
      billId: seed.billId ?? null,
      debit: toMoney(seed.debit),
      credit: toMoney(seed.credit),
      amount,
      currency: seed.currency ?? "USD",
      description: seed.description ?? null,
      journalEntryId: seed.journalEntryId ?? null,
      status: seed.status ?? "POSTED",
    },
  });
}
