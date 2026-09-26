/**
 * One document, read whole for its own page, through the real handler and a
 * real database.
 *
 * What is pinned is what the page is built from: the lines and totals from
 * the accounting row, the chain both ways — the quote an invoice was raised
 * from and the invoices a quote became — the chasing, and the record the
 * document's verbs live under. And that another company's document is not
 * found rather than read.
 *
 * Only the session is mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { createInvoiceForLead, createQuotationForLead } from "@/lib/crm/accounting-bridge";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});

const { GET } = await import("./route");

const SLUG = "crm-document-record-test";
const OTHER_SLUG = "crm-document-record-other";
const EMAIL = "crm-document-record-test@example.invalid";

let companyId: string;
let otherCompanyId: string;
let userId: string;
let leadId: string;

const LINES = [
  { description: "Epoxy floor, per m²", quantity: 100, unitPrice: 20, taxRate: 15 },
  { description: "Skirting", quantity: 40, unitPrice: 5 },
];

async function read(id: string, company = companyId) {
  validateSessionMock.mockResolvedValue({
    session: { user: { id: userId, companyId: company, role: "MANAGER" } },
  });
  const response = await GET(new NextRequest(`http://crm.test/api/v2/crm/documents/${id}`), {
    params: Promise.resolve({ id }),
  });
  return { status: response.status, body: await response.json() };
}

async function clear() {
  await prisma.crmCollectionNote.deleteMany({ where: { companyId } });
  await prisma.crmActivity.deleteMany({ where: { companyId } });
  await prisma.crmTask.deleteMany({ where: { companyId } });
  await prisma.crmLeadDocument.deleteMany({ where: { companyId } });
  await prisma.salesReceipt.deleteMany({ where: { companyId } });
  await prisma.salesInvoice.deleteMany({ where: { companyId } });
  await prisma.salesQuotation.deleteMany({ where: { companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
}

beforeAll(async () => {
  const company = await prisma.company.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: "Document Record Test", slug: SLUG },
  });
  companyId = company.id;
  const other = await prisma.company.upsert({
    where: { slug: OTHER_SLUG },
    update: {},
    create: { name: "Somebody Else", slug: OTHER_SLUG },
  });
  otherCompanyId = other.id;
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: { email: EMAIL, name: "Rudo Sales", companyId, role: "MANAGER" },
  });
  userId = user.id;
  await clear();
  await prisma.crmLead.deleteMany({ where: { companyId } });
  const lead = await prisma.crmLead.create({
    data: { companyId, leadNo: "LEAD-DOC-1", title: "Office floor", contactName: "Tendai Moyo" },
  });
  leadId = lead.id;
});

beforeEach(clear);

afterAll(async () => {
  await clear();
  await prisma.crmLead.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.company.delete({ where: { id: otherCompanyId } }).catch(() => {});
});

describe("a quote on its own page", () => {
  it("carries its lines and totals, the invoice it became, and where its verbs live", async () => {
    const quote = await createQuotationForLead({ companyId, userId, leadId, lines: LINES });
    const invoice = await createInvoiceForLead({
      companyId,
      userId,
      leadId,
      fromQuotationId: quote.quotationId,
    });

    const { status, body } = await read(quote.leadDocumentId);
    expect(status).toBe(200);
    expect(body.document).toMatchObject({ id: quote.leadDocumentId, type: "QUOTATION" });
    expect(body.basePath).toBe(`/api/v2/crm/leads/${leadId}`);
    expect(body.detail.lead).toMatchObject({ id: leadId, leadNo: "LEAD-DOC-1" });
    expect(body.detail.lines.map((line: { description: string }) => line.description)).toEqual([
      "Epoxy floor, per m²",
      "Skirting",
    ]);
    expect(body.detail.subTotal).toBeCloseTo(2200, 2);
    expect(body.detail.taxTotal).toBeCloseTo(300, 2);
    expect(body.detail.total).toBeCloseTo(2500, 2);
    expect(body.detail.invoicedAs).toEqual([
      expect.objectContaining({ id: invoice.leadDocumentId, type: "INVOICE", number: invoice.invoiceNumber }),
    ]);
  });
});

describe("an invoice on its own page", () => {
  it("names the quote it was raised from, and the chases against it", async () => {
    const quote = await createQuotationForLead({ companyId, userId, leadId, lines: LINES });
    const invoice = await createInvoiceForLead({
      companyId,
      userId,
      leadId,
      fromQuotationId: quote.quotationId,
    });
    await prisma.crmCollectionNote.create({
      data: {
        companyId,
        documentId: invoice.leadDocumentId,
        invoiceId: invoice.invoiceId,
        outcome: "PROMISED_TO_PAY",
        promisedAt: new Date("2026-10-02T00:00:00.000Z"),
        notes: "Friday, by transfer",
        createdById: userId,
      },
    });

    const { status, body } = await read(invoice.leadDocumentId);
    expect(status).toBe(200);
    expect(body.document.invoice).toMatchObject({ invoiceNumber: invoice.invoiceNumber, amountPaid: 0 });
    expect(body.detail.raisedFrom).toMatchObject({ id: quote.leadDocumentId, type: "QUOTATION" });
    expect(body.detail.payments).toEqual([]);
    expect(body.detail.chases).toEqual([
      expect.objectContaining({
        outcome: "PROMISED_TO_PAY",
        notes: "Friday, by transfer",
        createdBy: { id: userId, name: "Rudo Sales" },
      }),
    ]);
  });
});

describe("somebody else's document", () => {
  it("is not found rather than read", async () => {
    const invoice = await createInvoiceForLead({ companyId, userId, leadId, lines: LINES });
    const { status } = await read(invoice.leadDocumentId, otherCompanyId);
    expect(status).toBe(404);
  });
});
