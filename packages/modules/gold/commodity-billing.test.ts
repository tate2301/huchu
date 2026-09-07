/**
 * lib/commodity-billing.test.ts
 *
 * Integration tests for createPurchaseBill and createSalesInvoice.
 *
 * Requires a real Postgres test DB pointed at by DATABASE_URL_TEST.
 * Apply `prisma db push` against the test DB before running.
 *
 * Test coverage:
 *   1. createPurchaseBill writes a PurchaseBill + lines + payment, FK-linked.
 *   2. createSalesInvoice writes a SalesInvoice + lines + sales receipt, FK-linked.
 *   3. Transaction rollback: bill / invoice rows are absent after caller tx rolls back.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@corelithzw/db/client";
import { factories } from "./gold/test-factories";
import {
  createPurchaseBill,
  createSalesInvoice,
  upsertGoldVendor,
  upsertGoldCustomer,
} from "./commodity-billing";

// Sentinel error used to force a transaction rollback in rollback tests.
const ROLLBACK = new Error("__test_rollback__");

let companyId: string;
let userId: string;

beforeAll(async () => {
  await prisma.$connect();

  const co = await prisma.company.create({ data: factories.company() });
  companyId = co.id;

  // A real user record so createdById FK checks pass.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = await prisma.user.create({ data: factories.user(companyId) as any });
  userId = u.id;
});

afterAll(async () => {
  // Cascade-delete everything under the company.
  await prisma.salesReceipt.deleteMany({ where: { companyId } });
  await prisma.salesInvoiceLine.deleteMany({
    where: { invoice: { companyId } },
  });
  await prisma.salesInvoice.deleteMany({ where: { companyId } });
  await prisma.purchasePayment.deleteMany({ where: { companyId } });
  await prisma.purchaseBillLine.deleteMany({
    where: { bill: { companyId } },
  });
  await prisma.purchaseBill.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.vendor.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// 1. createPurchaseBill
// ---------------------------------------------------------------------------

describe("createPurchaseBill", () => {
  it("writes a PurchaseBill with line items and a linked payment", async () => {
    const billDate = new Date("2026-05-10T08:00:00.000Z");

    let purchaseBillId: string;
    let paymentIds: string[];

    await prisma.$transaction(async (tx) => {
      const gvId = await upsertGoldVendor(tx, {
        companyId,
        name: "Street Seller Alice",
        phone: "+263771000001",
      });
      const result = await createPurchaseBill(tx, {
        companyId,
        vendorId: gvId,
        billDate,
        reference: "GP-20260510-001",
        currency: "USD",
        lineItems: [
          {
            description: "Gold purchase: 12.500g @ $80.00/g",
            quantity: 12.5,
            unitPrice: 80,
            totalAmount: 1000,
          },
        ],
        payments: [
          {
            amount: 1000,
            method: "CASH",
            paidAt: billDate,
          },
        ],
        notes: "Gold purchase GP-20260510-001",
        createdById: null,
      });
      purchaseBillId = result.purchaseBillId;
      paymentIds = result.paymentIds;
    });

    // Assert the PurchaseBill row.
    const bill = await prisma.purchaseBill.findUniqueOrThrow({
      where: { id: purchaseBillId! },
      include: { lines: true, payments: true },
    });

    expect(bill.companyId).toBe(companyId);
    expect(bill.currency).toBe("USD");
    expect(bill.subTotal).toBe(1000);
    expect(bill.total).toBe(1000);
    expect(bill.amountPaid).toBe(1000);
    expect(bill.status).toBe("PAID");

    // Lines
    expect(bill.lines).toHaveLength(1);
    expect(bill.lines[0].description).toContain("12.500g");
    expect(bill.lines[0].quantity).toBe(12.5);
    expect(bill.lines[0].lineTotal).toBe(1000);

    // Payments
    expect(paymentIds!).toHaveLength(1);
    expect(bill.payments).toHaveLength(1);
    expect(bill.payments[0].amount).toBe(1000);
    expect(bill.payments[0].method).toBe("CASH");
    expect(bill.payments[0].billId).toBe(purchaseBillId!);
  });

  it("creates a RECEIVED bill when no payments are provided", async () => {
    const billDate = new Date("2026-05-10T09:00:00.000Z");

    const { purchaseBillId } = await prisma.$transaction(async (tx) => {
      const gvId = await upsertGoldVendor(tx, {
        companyId,
        name: "Street Seller Bob",
      });
      return createPurchaseBill(tx, {
        companyId,
        vendorId: gvId,
        billDate,
        currency: "USD",
        lineItems: [{ description: "Test line", quantity: 1, unitPrice: 500, totalAmount: 500 }],
      });
    });

    const bill = await prisma.purchaseBill.findUniqueOrThrow({
      where: { id: purchaseBillId },
    });
    expect(bill.status).toBe("RECEIVED");
    expect(bill.amountPaid).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. createSalesInvoice
// ---------------------------------------------------------------------------

describe("createSalesInvoice", () => {
  it("writes a SalesInvoice with line items and a linked sales receipt", async () => {
    const invoiceDate = new Date("2026-05-10T10:00:00.000Z");

    let salesInvoiceId: string;
    let receiptIds: string[];

    await prisma.$transaction(async (tx) => {
      const gcId = await upsertGoldCustomer(tx, {
        companyId,
        name: "Buyer HQ",
      });
      const result = await createSalesInvoice(tx, {
        companyId,
        customerId: gcId,
        invoiceDate,
        reference: "RCP-20260510-001",
        currency: "USD",
        lineItems: [
          {
            description: "Gold delivered: 50.000g",
            quantity: 50,
            unitPrice: 80,
            totalAmount: 4000,
          },
        ],
        receipts: [
          {
            amount: 4000,
            method: "BANK_TRANSFER",
            receivedAt: invoiceDate,
          },
        ],
        notes: "Gold receipt RCP-20260510-001",
        createdById: null,
      });
      salesInvoiceId = result.salesInvoiceId;
      receiptIds = result.receiptIds;
    });

    // Assert the SalesInvoice row.
    const invoice = await prisma.salesInvoice.findUniqueOrThrow({
      where: { id: salesInvoiceId! },
      include: { lines: true, receipts: true },
    });

    expect(invoice.companyId).toBe(companyId);
    expect(invoice.currency).toBe("USD");
    expect(invoice.subTotal).toBe(4000);
    expect(invoice.total).toBe(4000);
    expect(invoice.amountPaid).toBe(4000);
    expect(invoice.status).toBe("PAID");

    // Lines
    expect(invoice.lines).toHaveLength(1);
    expect(invoice.lines[0].description).toContain("50.000g");
    expect(invoice.lines[0].quantity).toBe(50);
    expect(invoice.lines[0].lineTotal).toBe(4000);

    // Receipts
    expect(receiptIds!).toHaveLength(1);
    expect(invoice.receipts).toHaveLength(1);
    expect(invoice.receipts[0].amount).toBe(4000);
    expect(invoice.receipts[0].method).toBe("BANK_TRANSFER");
    expect(invoice.receipts[0].invoiceId).toBe(salesInvoiceId!);
  });

  it("creates an ISSUED invoice when no receipts are provided", async () => {
    const invoiceDate = new Date("2026-05-10T11:00:00.000Z");

    const { salesInvoiceId } = await prisma.$transaction(async (tx) => {
      const gcId = await upsertGoldCustomer(tx, {
        companyId,
        name: "Buyer Direct",
      });
      return createSalesInvoice(tx, {
        companyId,
        customerId: gcId,
        invoiceDate,
        currency: "USD",
        lineItems: [{ description: "Test delivery", quantity: 10, unitPrice: 80, totalAmount: 800 }],
      });
    });

    const invoice = await prisma.salesInvoice.findUniqueOrThrow({
      where: { id: salesInvoiceId },
    });
    expect(invoice.status).toBe("ISSUED");
    expect(invoice.amountPaid).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Transaction rollback — rows must not persist after the outer tx aborts
// ---------------------------------------------------------------------------

describe("transaction rollback behaviour", () => {
  it("createPurchaseBill rows are absent when the outer transaction rolls back", async () => {
    let capturedBillId: string | undefined;

    try {
      await prisma.$transaction(async (tx) => {
        const gvId = await upsertGoldVendor(tx, {
          companyId,
          name: "Rollback Test Vendor",
        });
        const { purchaseBillId } = await createPurchaseBill(tx, {
          companyId,
          vendorId: gvId,
          billDate: new Date(),
          currency: "USD",
          lineItems: [{ description: "Rollback line", quantity: 1, unitPrice: 100, totalAmount: 100 }],
        });
        capturedBillId = purchaseBillId;
        throw ROLLBACK;
      });
    } catch (err) {
      if (err !== ROLLBACK) throw err;
    }

    expect(capturedBillId).toBeDefined();
    const bill = await prisma.purchaseBill.findUnique({
      where: { id: capturedBillId! },
    });
    expect(bill).toBeNull();
  });

  it("createSalesInvoice rows are absent when the outer transaction rolls back", async () => {
    let capturedInvoiceId: string | undefined;

    try {
      await prisma.$transaction(async (tx) => {
        const gcId = await upsertGoldCustomer(tx, {
          companyId,
          name: "Rollback Test Customer",
        });
        const { salesInvoiceId } = await createSalesInvoice(tx, {
          companyId,
          customerId: gcId,
          invoiceDate: new Date(),
          currency: "USD",
          lineItems: [{ description: "Rollback line", quantity: 1, unitPrice: 200, totalAmount: 200 }],
        });
        capturedInvoiceId = salesInvoiceId;
        throw ROLLBACK;
      });
    } catch (err) {
      if (err !== ROLLBACK) throw err;
    }

    expect(capturedInvoiceId).toBeDefined();
    const invoice = await prisma.salesInvoice.findUnique({
      where: { id: capturedInvoiceId! },
    });
    expect(invoice).toBeNull();
  });
});
