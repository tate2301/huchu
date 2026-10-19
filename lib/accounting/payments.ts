import type { AccountingSourceType } from "@prisma/client";

import { recalcPurchaseBillBalance, recalcSalesInvoiceBalance } from "@/lib/accounting/balances";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { nextNumber } from "@/lib/books/core/numbering";
import { postMoney } from "@/lib/books/core/post-money";
import { ReceiptRefused, receiptFacts } from "@/lib/books/core/receipt-facts";
import { onAccountingReceiptCreated } from "@/lib/crm/accounting-hooks";
import { prisma } from "@/lib/prisma";

export { ReceiptRefused };

/**
 * Recording money in, money out and bank transactions: one way each, whether a
 * person types it into Receivables, Payables or Banking, or accepts a bank
 * line's match in Books → Bank. Each one recalculates what is still owed,
 * posts its journal and tells the CRM.
 */

export type SalesReceiptInput = {
  companyId: string;
  userId: string;
  role?: string | null;
  invoiceId?: string | null;
  /** Whose money it is: the invoice's customer when it pays one, else this (D2). One of the two is required. */
  customerId?: string | null;
  /** The currency it came in, when it pays no invoice; else the invoice's. */
  currency?: string | null;
  receivedAt: Date;
  amount: number;
  method: string;
  reference?: string | null;
  bankAccountId?: string | null;
};

/**
 * Records money received: numbered from the receipt series, its customer,
 * currency and rate frozen (D2), posted through the core to the money account
 * it came into, with that account's bank transaction, in one transaction.
 */
export async function recordSalesReceipt(input: SalesReceiptInput) {
  const facts = await receiptFacts(prisma, {
    companyId: input.companyId,
    invoiceId: input.invoiceId,
    customerId: input.customerId,
    bankAccountId: input.bankAccountId,
    currency: input.currency,
    date: input.receivedAt,
    amount: input.amount,
  });
  if (!facts.customerId) throw new ReceiptRefused("Say whose money this is: pick the customer, or the invoice it pays.");
  if (input.bankAccountId) {
    const bank = await prisma.bankAccount.findFirst({ where: { id: input.bankAccountId, companyId: input.companyId }, select: { id: true } });
    if (!bank) throw new ReceiptRefused("That money account is not here any more.", 404);
  }

  const { receipt, bankTransactionId } = await prisma.$transaction(async (tx) => {
    const receiptNumber = await nextNumber(tx, input.companyId, "receipt");
    const receipt = await tx.salesReceipt.create({
      data: {
        companyId: input.companyId,
        invoiceId: input.invoiceId ?? undefined,
        customerId: facts.customerId,
        receiptNumber,
        receivedAt: input.receivedAt,
        amount: input.amount,
        currency: facts.currency,
        exchangeRate: facts.exchangeRate,
        baseAmount: facts.baseAmount,
        method: input.method,
        reference: input.reference ?? undefined,
        bankAccountId: input.bankAccountId ?? undefined,
        createdById: input.userId,
      },
      include: { invoice: true },
    });
    const posting = await postMoney(tx, {
      companyId: input.companyId,
      sourceType: "SALES_RECEIPT",
      sourceId: receipt.id,
      date: receipt.receivedAt,
      description: `Sales receipt ${receipt.receiptNumber}`,
      amount: receipt.amount,
      currency: facts.currency,
      rate: facts.exchangeRate ?? undefined,
      money: input.bankAccountId ? { bankAccountId: input.bankAccountId, direction: "IN", reference: input.reference ?? receipt.receiptNumber } : undefined,
      actor: { userId: input.userId, role: input.role ?? null },
    });
    if (posting.error) console.error(`[Accounting] Sales receipt ${receipt.receiptNumber} waits to post: ${posting.error}`);
    return { receipt, bankTransactionId: posting.bankTransactionId ?? null };
  });

  if (receipt.invoiceId) await recalcSalesInvoiceBalance(receipt.invoiceId);

  await onAccountingReceiptCreated({
    companyId: input.companyId,
    receiptId: receipt.id,
    invoiceId: receipt.invoiceId,
    userId: input.userId,
  });

  return { ...receipt, bankTransactionId };
}

export type PurchasePaymentInput = {
  companyId: string;
  userId: string;
  role?: string | null;
  billId?: string | null;
  paidAt: Date;
  amount: number;
  method: string;
  reference?: string | null;
  bankAccountId?: string | null;
};

/**
 * Records money paid to a supplier: posted through the core out of the money
 * account it left, with that account's bank transaction, in one transaction.
 */
export async function recordPurchasePayment(input: PurchasePaymentInput) {
  if (input.bankAccountId) {
    const bank = await prisma.bankAccount.findFirst({ where: { id: input.bankAccountId, companyId: input.companyId }, select: { id: true } });
    if (!bank) throw new ReceiptRefused("That money account is not here any more.", 404);
  }
  const bill = input.billId
    ? await prisma.purchaseBill.findFirst({ where: { id: input.billId, companyId: input.companyId }, select: { vendorId: true, currency: true } })
    : null;

  const { payment, bankTransactionId } = await prisma.$transaction(async (tx) => {
    const paymentNumber = await nextNumber(tx, input.companyId, "payment");
    const payment = await tx.purchasePayment.create({
      data: {
        companyId: input.companyId,
        billId: input.billId ?? undefined,
        vendorId: bill?.vendorId ?? undefined,
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
    const posting = await postMoney(tx, {
      companyId: input.companyId,
      sourceType: "PURCHASE_PAYMENT",
      sourceId: payment.id,
      date: payment.paidAt,
      description: `Purchase payment ${payment.paymentNumber}`,
      amount: payment.amount,
      currency: bill?.currency ?? null,
      money: input.bankAccountId ? { bankAccountId: input.bankAccountId, direction: "OUT", reference: input.reference ?? payment.paymentNumber } : undefined,
      actor: { userId: input.userId, role: input.role ?? null },
    });
    if (posting.error) console.error(`[Accounting] Purchase payment ${payment.paymentNumber} waits to post: ${posting.error}`);
    return { payment, bankTransactionId: posting.bankTransactionId ?? null };
  });

  if (payment.billId) await recalcPurchaseBillBalance(payment.billId);

  return { ...payment, bankTransactionId };
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
