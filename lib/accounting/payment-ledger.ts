import type { AccountingSourceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/accounting/ledger";

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
};

function isVoidReference(sourceId: string) {
  return sourceId.startsWith("void:");
}

async function buildLedgerSeed(
  companyId: string,
  sourceType: AccountingSourceType,
  sourceId: string,
  journalEntryId?: string | null,
): Promise<LedgerSeed | null> {
  if (!sourceId || isVoidReference(sourceId)) return null;

  switch (sourceType) {
    case "SALES_INVOICE": {
      const invoice = await prisma.salesInvoice.findUnique({
        where: { id: sourceId },
        select: {
          id: true,
          companyId: true,
          customerId: true,
          invoiceDate: true,
          total: true,
          currency: true,
          invoiceNumber: true,
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
      };
    }
    case "SALES_RECEIPT": {
      const receipt = await prisma.salesReceipt.findUnique({
        where: { id: sourceId },
        include: {
          invoice: {
            select: { id: true, companyId: true, customerId: true, currency: true, invoiceNumber: true },
          },
        },
      });
      if (!receipt || receipt.companyId !== companyId) return null;
      const amount = toMoney(receipt.amount);
      return {
        companyId,
        sourceType,
        sourceId,
        entryDate: receipt.receivedAt,
        accountType: "RECEIVABLE",
        partyType: "CUSTOMER",
        partyId: receipt.invoice?.customerId ?? null,
        invoiceId: receipt.invoiceId,
        debit: 0,
        credit: amount,
        currency: receipt.invoice?.currency ?? "USD",
        description: `Sales receipt ${receipt.receiptNumber}`,
        journalEntryId,
      };
    }
    case "SALES_CREDIT_NOTE": {
      const note = await prisma.creditNote.findUnique({
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
      };
    }
    case "SALES_WRITE_OFF": {
      const writeOff = await prisma.salesWriteOff.findUnique({
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
      };
    }
    case "PURCHASE_BILL": {
      const bill = await prisma.purchaseBill.findUnique({
        where: { id: sourceId },
        select: {
          id: true,
          companyId: true,
          vendorId: true,
          billDate: true,
          total: true,
          currency: true,
          billNumber: true,
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
      };
    }
    case "PURCHASE_PAYMENT": {
      const payment = await prisma.purchasePayment.findUnique({
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
        partyId: payment.bill?.vendorId ?? null,
        billId: payment.billId,
        debit: amount,
        credit: 0,
        currency: payment.bill?.currency ?? "USD",
        description: `Purchase payment ${payment.paymentNumber}`,
        journalEntryId,
      };
    }
    case "PURCHASE_DEBIT_NOTE": {
      const note = await prisma.debitNote.findUnique({
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
      };
    }
    case "PURCHASE_WRITE_OFF": {
      const writeOff = await prisma.purchaseWriteOff.findUnique({
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
      };
    }
    default:
      return null;
  }
}

export async function syncPaymentLedgerEntryForSource(input: {
  companyId: string;
  sourceType: AccountingSourceType;
  sourceId?: string | null;
  journalEntryId?: string | null;
}) {
  if (!input.sourceId) return null;

  const seed = await buildLedgerSeed(
    input.companyId,
    input.sourceType,
    input.sourceId,
    input.journalEntryId ?? null,
  );
  if (!seed) return null;

  const amount = toMoney(seed.debit + seed.credit);

  return prisma.paymentLedgerEntry.upsert({
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
      status: "POSTED",
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
      status: "POSTED",
    },
  });
}
