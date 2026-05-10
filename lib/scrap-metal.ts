import type { Prisma, ScrapMetalBalanceEntryType } from "@prisma/client";
import { createPurchaseBill, createSalesInvoice } from "@/lib/commodity-billing";

type TransactionClient = Prisma.TransactionClient;

export const SCRAP_METAL_CATEGORIES = [
  "BATTERIES",
  "COPPER",
  "ALUMINUM",
  "STEEL",
  "BRASS",
  "MIXED",
  "OTHER",
] as const;

export async function applyScrapBalanceDelta(
  tx: TransactionClient,
  input: {
    companyId: string;
    employeeId: string;
    amountDelta: number;
    entryType: ScrapMetalBalanceEntryType;
    sourceId?: string | null;
    note?: string | null;
    createdById?: string | null;
  },
) {
  const balance = await tx.scrapMetalEmployeeBalance.upsert({
    where: {
      companyId_employeeId: {
        companyId: input.companyId,
        employeeId: input.employeeId,
      },
    },
    create: {
      companyId: input.companyId,
      employeeId: input.employeeId,
      balance: input.amountDelta,
    },
    update: {
      balance: {
        increment: input.amountDelta,
      },
    },
  });

  const refreshedBalance = await tx.scrapMetalEmployeeBalance.findUniqueOrThrow({
    where: { id: balance.id },
    select: { id: true, balance: true },
  });

  await tx.scrapMetalBalanceEntry.create({
    data: {
      companyId: input.companyId,
      balanceId: refreshedBalance.id,
      employeeId: input.employeeId,
      entryType: input.entryType,
      amountDelta: input.amountDelta,
      balanceAfter: refreshedBalance.balance,
      sourceId: input.sourceId ?? undefined,
      note: input.note ?? undefined,
      createdById: input.createdById ?? undefined,
    },
  });

  return refreshedBalance;
}

/**
 * Create AP subledger documents for a scrap-metal purchase.
 *
 * Delegates to the shared createPurchaseBill helper in lib/commodity-billing.
 * The vendorId must resolve to an existing Vendor record — scrap-metal
 * purchases always go through a vendor-selection flow, so the FK is available.
 */
export async function createScrapPurchaseAccountingDocs(
  tx: TransactionClient,
  input: {
    companyId: string;
    vendorId: string;
    description: string;
    amount: number;
    currency: string;
    billDate: Date;
    paymentMethod?: string | null;
    paymentReference?: string | null;
    createdById: string;
  },
) {
  const { purchaseBillId, paymentIds } = await createPurchaseBill(tx, {
    companyId: input.companyId,
    vendorId: input.vendorId,
    billDate: input.billDate,
    currency: input.currency,
    lineItems: [
      {
        description: input.description,
        quantity: 1,
        unitPrice: input.amount,
        totalAmount: input.amount,
      },
    ],
    payments: input.paymentMethod
      ? [
          {
            amount: input.amount,
            method: input.paymentMethod,
            paidAt: input.billDate,
            reference: input.paymentReference ?? undefined,
          },
        ]
      : [],
    notes: input.description,
    createdById: input.createdById,
  });

  // Return shape-compatible with historical callers that expected { bill, payment }.
  const bill = await tx.purchaseBill.findUniqueOrThrow({
    where: { id: purchaseBillId },
    select: { id: true },
  });
  const payment =
    paymentIds.length > 0
      ? await tx.purchasePayment.findUniqueOrThrow({
          where: { id: paymentIds[0] },
          select: { id: true, paidAt: true },
        })
      : null;

  return { bill, payment };
}

/**
 * Create AR subledger documents for a scrap-metal sale.
 *
 * Delegates to the shared createSalesInvoice helper in lib/commodity-billing.
 */
export async function createScrapSaleAccountingDocs(
  tx: TransactionClient,
  input: {
    companyId: string;
    customerId: string;
    description: string;
    amount: number;
    currency: string;
    invoiceDate: Date;
    paymentMethod?: string | null;
    paymentReference?: string | null;
    createdById: string;
  },
) {
  const { salesInvoiceId, receiptIds } = await createSalesInvoice(tx, {
    companyId: input.companyId,
    customerId: input.customerId,
    invoiceDate: input.invoiceDate,
    currency: input.currency,
    lineItems: [
      {
        description: input.description,
        quantity: 1,
        unitPrice: input.amount,
        totalAmount: input.amount,
      },
    ],
    receipts: input.paymentMethod
      ? [
          {
            amount: input.amount,
            method: input.paymentMethod,
            receivedAt: input.invoiceDate,
            reference: input.paymentReference ?? undefined,
          },
        ]
      : [],
    notes: input.description,
    createdById: input.createdById,
  });

  // Return shape-compatible with historical callers that expected { invoice, receipt }.
  const invoice = await tx.salesInvoice.findUniqueOrThrow({
    where: { id: salesInvoiceId },
    select: { id: true },
  });
  const receipt =
    receiptIds.length > 0
      ? await tx.salesReceipt.findUniqueOrThrow({
          where: { id: receiptIds[0] },
          select: { id: true, receivedAt: true },
        })
      : null;

  return { invoice, receipt };
}
