/**
 * The not-receipted rule: cash the field logged against an invoice, compared
 * with what accounting has receipted on it.
 *
 * The arithmetic is pinned without a database — totals rather than payments,
 * and half a cent of rounding is not money anybody is holding. Then the query
 * is pinned against a real one, because the rule is only as good as the lines
 * it reads: income against an invoice, in this company, and nothing else.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { addCostEntry } from "@/lib/crm/daily-log";
import { isNotReceipted, receiptGap, receiptGaps, type ReceiptGap } from "@/lib/crm/finance";

describe("the gap on one invoice", () => {
  it("is what was logged less what was receipted", () => {
    expect(receiptGap(200, 150)?.toString()).toBe("50");
  });

  it("is nothing once accounting has receipted all of it", () => {
    expect(receiptGap(200, 200)).toBeNull();
  });

  it("is nothing when the office receipted more than the field logged", () => {
    // Part of it came by bank transfer. Nobody is holding cash.
    expect(receiptGap(200, 350)).toBeNull();
  });

  it("does not flag the rounding in a float amountPaid", () => {
    expect(receiptGap("99.99", 99.98999999999)).toBeNull();
    expect(receiptGap("0.004", 0)).toBeNull();
  });
});

describe("which lines carry the flag", () => {
  const gaps = new Map<string, ReceiptGap>([
    ["invoice-1", { invoiceDocumentId: "invoice-1" } as ReceiptGap],
  ]);

  it("flags income against an invoice with a gap", () => {
    expect(isNotReceipted({ direction: "RECEIVED", invoiceDocumentId: "invoice-1" }, gaps)).toBe(true);
  });

  it("leaves income against a settled invoice alone", () => {
    expect(isNotReceipted({ direction: "RECEIVED", invoiceDocumentId: "invoice-2" }, gaps)).toBe(false);
  });

  it("leaves income against no invoice, and every expense, alone", () => {
    expect(isNotReceipted({ direction: "RECEIVED", invoiceDocumentId: null }, gaps)).toBe(false);
    expect(isNotReceipted({ direction: "SPENT", invoiceDocumentId: "invoice-1" }, gaps)).toBe(false);
  });
});

const SLUG = "finance-test";
const OTHER_SLUG = "finance-test-other";
const NOW = new Date("2026-09-24T14:00:00.000Z");

let companyId: string;
let otherCompanyId: string;
let repId: string;
let secondRepId: string;
let invoiceId: string;
let documentId: string;

async function clear() {
  for (const id of [companyId, otherCompanyId]) {
    await prisma.crmDailyCostEntry.deleteMany({ where: { companyId: id } });
    await prisma.crmDailyLog.deleteMany({ where: { companyId: id } });
  }
  await prisma.salesInvoice.update({ where: { id: invoiceId }, data: { amountPaid: 0 } });
}

function collect(userId: string, amount: number, extra: { invoiceDocumentId?: string | null } = {}) {
  return prisma.$transaction((tx) =>
    addCostEntry(tx, {
      direction: "RECEIVED",
      category: "OTHER",
      amount,
      currency: "USD",
      description: "Deposit, cash",
      invoiceDocumentId: documentId,
      ...extra,
      companyId,
      userId,
      now: NOW,
    }),
  );
}

beforeAll(async () => {
  const company = await prisma.company.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: "Finance Test", slug: SLUG },
  });
  companyId = company.id;
  const other = await prisma.company.upsert({
    where: { slug: OTHER_SLUG },
    update: {},
    create: { name: "Finance Test Other", slug: OTHER_SLUG },
  });
  otherCompanyId = other.id;

  const rep = await prisma.user.upsert({
    where: { email: "finance-test-rep@example.invalid" },
    update: {},
    create: { email: "finance-test-rep@example.invalid", name: "Tendai", companyId, role: "SALES_REP" },
  });
  repId = rep.id;
  const second = await prisma.user.upsert({
    where: { email: "finance-test-rep2@example.invalid" },
    update: {},
    create: { email: "finance-test-rep2@example.invalid", name: "Rudo", companyId, role: "SALES_REP" },
  });
  secondRepId = second.id;

  // Whatever an interrupted run left behind, so the invoice number is free.
  await prisma.crmDailyCostEntry.deleteMany({ where: { companyId } });
  await prisma.crmLeadDocument.deleteMany({ where: { companyId } });
  await prisma.salesInvoice.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });

  const customer = await prisma.customer.create({ data: { companyId, name: "Mrs Moyo" } });
  const invoice = await prisma.salesInvoice.create({
    data: {
      companyId,
      customerId: customer.id,
      invoiceNumber: "FIN-TEST-0001",
      invoiceDate: NOW,
      status: "ISSUED",
      total: 500,
    },
  });
  invoiceId = invoice.id;
  const document = await prisma.crmLeadDocument.create({
    data: { companyId, type: "INVOICE", invoiceId, amount: 500 },
  });
  documentId = document.id;
});

beforeEach(clear);

afterAll(async () => {
  await clear();
  await prisma.crmLeadDocument.deleteMany({ where: { companyId } });
  await prisma.salesInvoice.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: { in: [SLUG, OTHER_SLUG] } } });
});

describe("reading the gaps from the books", () => {
  it("flags cash logged against an invoice nobody has receipted", async () => {
    await collect(repId, 200);

    const gap = (await receiptGaps(prisma, companyId)).get(documentId);
    expect(gap?.logged.toString()).toBe("200");
    expect(gap?.receipted.toString()).toBe("0");
    expect(gap?.unreceipted.toString()).toBe("200");
  });

  it("clears once accounting receipts it, however the office split it", async () => {
    // Two collections, one receipt.
    await collect(repId, 120);
    await collect(secondRepId, 80);
    await prisma.salesInvoice.update({ where: { id: invoiceId }, data: { amountPaid: 200 } });

    expect((await receiptGaps(prisma, companyId)).has(documentId)).toBe(false);
  });

  it("keeps the part the office has not caught up with", async () => {
    await collect(repId, 200);
    await prisma.salesInvoice.update({ where: { id: invoiceId }, data: { amountPaid: 150 } });

    expect((await receiptGaps(prisma, companyId)).get(documentId)?.unreceipted.toString()).toBe("50");
  });

  it("ignores cash received against no invoice", async () => {
    await collect(repId, 200, { invoiceDocumentId: null });
    expect((await receiptGaps(prisma, companyId)).size).toBe(0);
  });

  it("answers for only the invoices it is asked about", async () => {
    await collect(repId, 200);
    expect((await receiptGaps(prisma, companyId, { invoiceDocumentIds: [] })).size).toBe(0);
    expect((await receiptGaps(prisma, companyId, { invoiceDocumentIds: [documentId] })).size).toBe(1);
  });

  it("reads only this company's lines", async () => {
    await collect(repId, 200);
    expect((await receiptGaps(prisma, otherCompanyId)).size).toBe(0);
  });
});
