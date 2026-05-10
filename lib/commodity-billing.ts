/**
 * lib/commodity-billing.ts
 *
 * Shared AP/AR subledger helpers used by both the Gold module and the
 * Scrap-Metal module.  Both modules create purchase bills (payables) and
 * sales invoices (receivables) using identical DB shapes — this file owns
 * that logic so neither module duplicates it.
 *
 * Design constraints
 * ------------------
 * - Every function accepts a `tx` first parameter so the caller can include
 *   the write inside an existing Prisma $transaction.  If the outer
 *   transaction rolls back the bill / invoice rows are never committed.
 * - `PurchaseBill` requires a `vendorId` FK (Vendor table).
 *   `SalesInvoice`  requires a `customerId` FK (Customer table).
 *   Neither model has a sourceType / sourceId column — the source reference
 *   is carried in the `notes` field and is surfaced via the relation chains
 *   on ScrapMetalPurchase / ScrapMetalSale (for scrap) and via the calling
 *   route's own state (for gold).
 * - For gold flows the seller / buyer is often a one-time street contact with
 *   no pre-existing Vendor / Customer record.  Use `upsertGoldVendor` /
 *   `upsertGoldCustomer` to find-or-create a lightweight record keyed on
 *   (companyId, name) before calling `createPurchaseBill` / `createSalesInvoice`.
 */

import type { Prisma } from "@prisma/client";

/** Union of the full PrismaClient and a transaction-scoped client. */
export type Db = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatTwoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

async function generateUniqueNumber(
  tx: Db,
  prefix: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const now = new Date();
    const datePart = `${now.getFullYear()}${formatTwoDigits(now.getMonth() + 1)}${formatTwoDigits(now.getDate())}`;
    const timePart = `${formatTwoDigits(now.getHours())}${formatTwoDigits(now.getMinutes())}`;
    const randomPart = Math.floor(100 + Math.random() * 900);
    const candidate = `${prefix}-${datePart}-${timePart}-${randomPart}`;
    if (!(await exists(candidate))) {
      return candidate;
    }
  }
  return `${prefix}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// ---------------------------------------------------------------------------
// Vendor / Customer upsert helpers (gold-specific convenience wrappers)
// ---------------------------------------------------------------------------

/**
 * Find-or-create a Vendor record keyed on (companyId, name).
 * Safe to call inside a $transaction.
 */
export async function upsertGoldVendor(
  tx: Db,
  params: {
    companyId: string;
    name: string;
    phone?: string | null;
  },
): Promise<string> {
  const existing = await tx.vendor.findFirst({
    where: { companyId: params.companyId, name: params.name },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await tx.vendor.create({
    data: {
      companyId: params.companyId,
      name: params.name,
      phone: params.phone ?? undefined,
      isActive: true,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Find-or-create a Customer record keyed on (companyId, name).
 * Safe to call inside a $transaction.
 */
export async function upsertGoldCustomer(
  tx: Db,
  params: {
    companyId: string;
    name: string;
    phone?: string | null;
  },
): Promise<string> {
  const existing = await tx.customer.findFirst({
    where: { companyId: params.companyId, name: params.name },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await tx.customer.create({
    data: {
      companyId: params.companyId,
      name: params.name,
      phone: params.phone ?? undefined,
      isActive: true,
    },
    select: { id: true },
  });
  return created.id;
}

// ---------------------------------------------------------------------------
// createPurchaseBill
// ---------------------------------------------------------------------------

export interface PurchaseBillLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
}

export interface PurchaseBillPayment {
  amount: number;
  method: string;
  paidAt?: Date;
  reference?: string;
}

export interface CreatePurchaseBillParams {
  companyId: string;
  /** Resolved FK — use upsertGoldVendor() for gold flows. */
  vendorId: string;
  billDate: Date;
  reference?: string | null;
  currency: string;
  lineItems: PurchaseBillLineItem[];
  payments?: PurchaseBillPayment[];
  /**
   * Free-text note attached to the bill.  Callers may embed source
   * information here (e.g. "Gold purchase GP-20260510-001") because the
   * PurchaseBill model has no sourceType / sourceId columns.
   */
  notes?: string | null;
  createdById?: string | null;
}

export interface CreatePurchaseBillResult {
  purchaseBillId: string;
  paymentIds: string[];
}

/**
 * Create a PurchaseBill (AP subledger) with one or more line items and
 * optional immediate payments, all within the caller's transaction.
 */
export async function createPurchaseBill(
  tx: Db,
  params: CreatePurchaseBillParams,
): Promise<CreatePurchaseBillResult> {
  const subTotal = params.lineItems.reduce((s, l) => s + l.totalAmount, 0);
  const totalPaid = (params.payments ?? []).reduce((s, p) => s + p.amount, 0);

  const billNumber = await generateUniqueNumber(
    tx,
    "BILL",
    async (candidate) => {
      const existing = await tx.purchaseBill.findFirst({
        where: { billNumber: candidate },
        select: { id: true },
      });
      return Boolean(existing);
    },
  );

  const bill = await tx.purchaseBill.create({
    data: {
      companyId: params.companyId,
      vendorId: params.vendorId,
      billNumber,
      billDate: params.billDate,
      dueDate: params.billDate,
      status: totalPaid >= subTotal && subTotal > 0 ? "PAID" : "RECEIVED",
      currency: params.currency,
      subTotal,
      taxTotal: 0,
      total: subTotal,
      amountPaid: totalPaid,
      notes: params.notes ?? params.reference ?? undefined,
      createdById: params.createdById ?? undefined,
      issuedById: params.createdById ?? undefined,
      issuedAt: params.billDate,
      lines: {
        create: params.lineItems.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxRate: 0,
          taxAmount: 0,
          lineTotal: line.totalAmount,
        })),
      },
    },
    select: { id: true },
  });

  const paymentIds: string[] = [];
  for (const payment of params.payments ?? []) {
    const paymentNumber = await generateUniqueNumber(
      tx,
      "PAY",
      async (candidate) => {
        const existing = await tx.purchasePayment.findFirst({
          where: { paymentNumber: candidate },
          select: { id: true },
        });
        return Boolean(existing);
      },
    );

    const created = await tx.purchasePayment.create({
      data: {
        companyId: params.companyId,
        billId: bill.id,
        paymentNumber,
        paidAt: payment.paidAt ?? params.billDate,
        amount: payment.amount,
        method: payment.method,
        reference: payment.reference ?? undefined,
        createdById: params.createdById ?? undefined,
      },
      select: { id: true },
    });
    paymentIds.push(created.id);
  }

  return { purchaseBillId: bill.id, paymentIds };
}

// ---------------------------------------------------------------------------
// createSalesInvoice
// ---------------------------------------------------------------------------

export interface SalesInvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
}

export interface SalesInvoiceReceipt {
  amount: number;
  method: string;
  receivedAt?: Date;
  reference?: string;
}

export interface CreateSalesInvoiceParams {
  companyId: string;
  /** Resolved FK — use upsertGoldCustomer() for gold flows. */
  customerId: string;
  invoiceDate: Date;
  reference?: string | null;
  currency: string;
  lineItems: SalesInvoiceLineItem[];
  receipts?: SalesInvoiceReceipt[];
  /**
   * Free-text note.  Callers may embed source information here because the
   * SalesInvoice model has no sourceType / sourceId columns.
   */
  notes?: string | null;
  createdById?: string | null;
}

export interface CreateSalesInvoiceResult {
  salesInvoiceId: string;
  receiptIds: string[];
}

/**
 * Create a SalesInvoice (AR subledger) with one or more line items and
 * optional sales receipts, all within the caller's transaction.
 */
export async function createSalesInvoice(
  tx: Db,
  params: CreateSalesInvoiceParams,
): Promise<CreateSalesInvoiceResult> {
  const subTotal = params.lineItems.reduce((s, l) => s + l.totalAmount, 0);
  const totalReceived = (params.receipts ?? []).reduce((s, r) => s + r.amount, 0);

  const invoiceNumber = await generateUniqueNumber(
    tx,
    "INV",
    async (candidate) => {
      const existing = await tx.salesInvoice.findFirst({
        where: { invoiceNumber: candidate },
        select: { id: true },
      });
      return Boolean(existing);
    },
  );

  const invoice = await tx.salesInvoice.create({
    data: {
      companyId: params.companyId,
      customerId: params.customerId,
      invoiceNumber,
      invoiceDate: params.invoiceDate,
      dueDate: params.invoiceDate,
      status: totalReceived >= subTotal && subTotal > 0 ? "PAID" : "ISSUED",
      currency: params.currency,
      subTotal,
      taxTotal: 0,
      total: subTotal,
      amountPaid: totalReceived,
      notes: params.notes ?? params.reference ?? undefined,
      createdById: params.createdById ?? undefined,
      issuedById: params.createdById ?? undefined,
      issuedAt: params.invoiceDate,
      lines: {
        create: params.lineItems.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxRate: 0,
          taxAmount: 0,
          lineTotal: line.totalAmount,
        })),
      },
    },
    select: { id: true },
  });

  const receiptIds: string[] = [];
  for (const receipt of params.receipts ?? []) {
    const receiptNumber = await generateUniqueNumber(
      tx,
      "REC",
      async (candidate) => {
        const existing = await tx.salesReceipt.findFirst({
          where: { receiptNumber: candidate },
          select: { id: true },
        });
        return Boolean(existing);
      },
    );

    const created = await tx.salesReceipt.create({
      data: {
        companyId: params.companyId,
        invoiceId: invoice.id,
        receiptNumber,
        receivedAt: receipt.receivedAt ?? params.invoiceDate,
        amount: receipt.amount,
        method: receipt.method,
        reference: receipt.reference ?? undefined,
        createdById: params.createdById ?? undefined,
      },
      select: { id: true },
    });
    receiptIds.push(created.id);
  }

  return { salesInvoiceId: invoice.id, receiptIds };
}
