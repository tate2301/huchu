/**
 * The edit route for a lead's quote or invoice, through the real handler and
 * a real database.
 *
 * The bridge's own tests pin what an edit does to the books. What is pinned
 * here is what the rep's screen is told: the builder opens on the document as
 * it stands, a quote is sent to the revision path rather than edited in
 * place, a locked invoice answers 409 with the reason written for a person,
 * and somebody without the permission to bill is refused before anything is
 * read into the ledger.
 *
 * Only the session is mocked, and the capability check where a test says so.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { createInvoiceForLead, createQuotationForLead } from "@/lib/crm/accounting-bridge";

const { validateSessionMock, canUserMock } = vi.hoisted(() => ({
  validateSessionMock: vi.fn(),
  canUserMock: vi.fn(),
}));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});
vi.mock("@/lib/crm/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crm/permissions")>();
  return { ...actual, canEditRecord: vi.fn().mockResolvedValue(true), canUser: canUserMock };
});

const { GET, PATCH } = await import("./route");

const SLUG = "crm-document-route-test";
const EMAIL = "crm-document-route-test@example.invalid";

let companyId: string;
let userId: string;
let leadId: string;

const LINES = [{ description: "Epoxy floor, per m²", quantity: 100, unitPrice: 20, taxRate: 15 }];

function context(docId: string) {
  return { params: Promise.resolve({ id: leadId, docId }) };
}

async function read(docId: string) {
  const response = await GET(
    new NextRequest(`http://crm.test/api/v2/crm/leads/${leadId}/documents/${docId}`),
    context(docId),
  );
  return { status: response.status, body: await response.json() };
}

async function patch(docId: string, body: unknown) {
  const response = await PATCH(
    new NextRequest(`http://crm.test/api/v2/crm/leads/${leadId}/documents/${docId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    context(docId),
  );
  return { status: response.status, body: await response.json() };
}

async function clear() {
  await prisma.crmActivity.deleteMany({ where: { companyId } });
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
    create: { name: "Document Route Test", slug: SLUG },
  });
  companyId = company.id;
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: { email: EMAIL, name: "Rudo Sales", companyId, role: "MANAGER" },
  });
  userId = user.id;
  await clear();
  await prisma.crmLead.deleteMany({ where: { companyId } });
  const lead = await prisma.crmLead.create({
    data: { companyId, leadNo: "LEAD-ROUTE-1", title: "Office floor", contactName: "Tendai Moyo" },
  });
  leadId = lead.id;
});

beforeEach(async () => {
  await clear();
  validateSessionMock.mockResolvedValue({
    session: { user: { id: userId, companyId, role: "MANAGER" } },
  });
  canUserMock.mockResolvedValue(true);
});

afterAll(async () => {
  await clear();
  await prisma.crmLead.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
});

describe("opening a document for an edit", () => {
  it("hands the builder the lines and terms as they stand, and whether it may be edited", async () => {
    const invoice = await createInvoiceForLead({ companyId, userId, leadId, lines: LINES, notes: "Net 14" });
    const { status, body } = await read(invoice.leadDocumentId);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      id: invoice.leadDocumentId,
      type: "INVOICE",
      number: invoice.invoiceNumber,
      notes: "Net 14",
      lines: [{ description: "Epoxy floor, per m²", quantity: 100, unitPrice: 20, taxRate: 15 }],
      editLock: null,
    });
  });

  it("is a 404 for a document on another record", async () => {
    const { status } = await read("5f0c8a2e-9d1b-4c3a-8e7f-6a5b4c3d2e1f");
    expect(status).toBe(404);
  });
});

describe("editing an invoice through the route", () => {
  it("saves the edit and answers with the new total and revision", async () => {
    const invoice = await createInvoiceForLead({ companyId, userId, leadId, lines: LINES });
    const { status, body } = await patch(invoice.leadDocumentId, {
      lines: [{ description: "Epoxy floor, per m²", quantity: 120, unitPrice: 20, taxRate: 15 }],
    });
    expect(status).toBe(200);
    expect(body.total).toBeCloseTo(2760, 2);
    expect(body.revision).toBe(1);
  });

  it("answers 409 with the reason when the invoice is locked", async () => {
    const invoice = await createInvoiceForLead({ companyId, userId, leadId, lines: LINES });
    await prisma.salesInvoice.update({ where: { id: invoice.invoiceId }, data: { status: "VOIDED" } });
    const { status, body } = await patch(invoice.leadDocumentId, { lines: LINES });
    expect(status).toBe(409);
    expect(body.error).toBe(`${invoice.invoiceNumber} cannot be edited. Voided — raise a new invoice instead.`);
  });

  it("sends a quote to the revision path instead of editing it in place", async () => {
    const quote = await createQuotationForLead({ companyId, userId, leadId, lines: LINES });
    const { status, body } = await patch(quote.leadDocumentId, { lines: LINES });
    expect(status).toBe(400);
    expect(body.error).toMatch(/next version/);
  });

  it("refuses somebody who may not bill, and posts nothing", async () => {
    const invoice = await createInvoiceForLead({ companyId, userId, leadId, lines: LINES });
    const entries = await prisma.journalEntry.count({ where: { companyId } });
    canUserMock.mockResolvedValue(false);
    const { status } = await patch(invoice.leadDocumentId, { lines: LINES });
    expect(status).toBe(403);
    expect(await prisma.journalEntry.count({ where: { companyId } })).toBe(entries);
  });
});
