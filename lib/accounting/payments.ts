import type { AccountingSourceType } from "@prisma/client";

import { recalcPurchaseBillBalance, recalcSalesInvoiceBalance } from "@/lib/accounting/balances";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { onAccountingReceiptCreated } from "@/lib/crm/accounting-hooks";
import { prisma } from "@/lib/prisma";

/**
 * Recording money in, money out and bank transactions: one way each, whether a
 * person types it into Receivables, Payables or Banking, or accepts a bank
 * line's match in Books → Bank. Each one recalculates what is still owed,
 * posts its journal and tells the CRM.
 */

const two = (value: number) => String(value).padStart(2, "0");

function numberCandidate(prefix: string) {
  const now = new Date();
  const datePart = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  const timePart = `${two(now.getHours())}${two(now.getMinutes())}`;
  return `${prefix}-${datePart}-${timePart}-${Math.floor(100 + Math.random() * 900)}`;
}

async function uniqueNumber(prefix: string, taken: (candidate: string) => Promise<boolean>) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = numberCandidate(prefix);
    if (!(await taken(candidate))) return candidate;
  }
  return `${prefix}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export type SalesReceiptInput = {
  companyId: string;
  userId: string;
  invoiceId?: string | null;
  receivedAt: Date;
  amount: number;
  method: string;
  reference?: string | null;
  bankAccountId?: string | null;
};

export async function recordSalesReceipt(input: SalesReceiptInput) {
  const receiptNumber = await uniqueNumber("REC", async (candidate) =>
    Boolean(await prisma.salesReceipt.findFirst({ where: { receiptNumber: candidate }, select: { id: true } })),
  );
  const receipt = await prisma.salesReceipt.create({
    data: {
      companyId: input.companyId,
      invoiceId: input.invoiceId ?? undefined,
      receiptNumber,
      receivedAt: input.receivedAt,
      amount: input.amount,
      method: input.method,
      reference: input.reference ?? undefined,
      bankAccountId: input.bankAccountId ?? undefined,
      createdById: input.userId,
    },
    include: { invoice: true },
  });

  if (receipt.invoiceId) await recalcSalesInvoiceBalance(receipt.invoiceId);

  try {
    await createJournalEntryFromSource({
      companyId: input.companyId,
      sourceType: "SALES_RECEIPT",
      sourceId: receipt.id,
      entryDate: receipt.receivedAt,
      description: `Sales receipt ${receipt.receiptNumber}`,
      createdById: input.userId,
      amount: receipt.amount,
      netAmount: receipt.amount,
      taxAmount: 0,
      grossAmount: receipt.amount,
    });
  } catch (error) {
    console.error("[Accounting] Sales receipt auto-post failed:", error);
  }

  await onAccountingReceiptCreated({
    companyId: input.companyId,
    receiptId: receipt.id,
    invoiceId: receipt.invoiceId,
    userId: input.userId,
  });

  return receipt;
}

export type PurchasePaymentInput = {
  companyId: string;
  userId: string;
  billId?: string | null;
  paidAt: Date;
  amount: number;
  method: string;
  reference?: string | null;
  bankAccountId?: string | null;
};

export async function recordPurchasePayment(input: PurchasePaymentInput) {
  const paymentNumber = await uniqueNumber("PAY", async (candidate) =>
    Boolean(await prisma.purchasePayment.findFirst({ where: { paymentNumber: candidate }, select: { id: true } })),
  );
  const payment = await prisma.purchasePayment.create({
    data: {
      companyId: input.companyId,
      billId: input.billId ?? undefined,
      paymentNumber,
      paidAt: input.paidAt,
      amount: input.amount,
      method: input.method,
      reference: input.reference ?? undefined,
      bankAccountId: input.bankAccountId ?? undefined,
      createdById: input.userId,
    },
    include: { bill: true },
  });

  if (payment.billId) await recalcPurchaseBillBalance(payment.billId);

  try {
    await createJournalEntryFromSource({
      companyId: input.companyId,
      sourceType: "PURCHASE_PAYMENT",
      sourceId: payment.id,
      entryDate: payment.paidAt,
      description: `Purchase payment ${payment.paymentNumber}`,
      createdById: input.userId,
      amount: payment.amount,
      netAmount: payment.amount,
      taxAmount: 0,
      grossAmount: payment.amount,
    });
  } catch (error) {
    console.error("[Accounting] Purchase payment auto-post failed:", error);
  }

  return payment;
}

export type BankTransactionInput = {
  companyId: string;
  userId: string;
  role?: string | null;
  bankAccountId: string;
  txnDate: Date;
  description: string;
  reference?: string | null;
  amount: number;
  direction: "DEBIT" | "CREDIT";
  /**
   * What the money was. A transaction that stands on its own posts its own
   * journal (`BANK_TRANSACTION`); one that records the bank side of a receipt or
   * payment names it, and posts nothing, because the receipt's journal already
   * moved the money.
   */
  source?: { type: AccountingSourceType; id: string } | null;
  /** On a transaction that stands on its own: whatever id the caller tags it with. */
  tag?: string | null;
  reconciliationId?: string | null;
};

export async function recordBankTransaction(input: BankTransactionInput) {
  const reconciled = input.reconciliationId ? { reconciliationId: input.reconciliationId, reconciledAt: new Date() } : {};
  const transaction = await prisma.bankTransaction.create({
    data: {
      companyId: input.companyId,
      bankAccountId: input.bankAccountId,
      txnDate: input.txnDate,
      description: input.description,
      reference: input.reference ?? undefined,
      amount: input.amount,
      direction: input.direction,
      sourceType: input.source?.type ?? "BANK_TRANSACTION",
      sourceId: input.source?.id ?? input.tag ?? undefined,
      ...reconciled,
    },
  });

  if (!input.source) {
    try {
      await createJournalEntryFromSource({
        companyId: input.companyId,
        sourceType: "BANK_TRANSACTION",
        sourceId: transaction.id,
        entryDate: transaction.txnDate,
        description: `Bank transaction ${transaction.direction.toLowerCase()} ${transaction.description}`,
        createdById: input.userId,
        amount: transaction.amount,
        netAmount: transaction.amount,
        taxAmount: 0,
        grossAmount: transaction.amount,
        actorRole: input.role ?? undefined,
        invertDirection: transaction.direction === "CREDIT",
      });
    } catch (error) {
      console.error("[Accounting] Bank transaction auto-post failed:", error);
    }
  }

  return transaction;
}
