/**
 * A CRM document's builder, against the test database: the layouts offered
 * are this kind of document's own (not a school's fee invoice's), a layout
 * saved from the builder is the company's with its first version published,
 * the preview renders the real record in a layout's settings without
 * Chromium, and the details that can change once the figures cannot do:
 * an invoice's due date while it is owed, a receipt's method and reference.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { createInvoiceForLead, createQuotationForLead, recordReceiptForLead } from "@/lib/crm/accounting-bridge";
import { CRM_DOCUMENT_SOURCE_KEYS } from "@/lib/crm/document-sources";
import { createCompanyLayout, isLayoutFor, layoutSchema, layoutsFor } from "@/lib/documents/layouts";
import { renderDocumentPreview } from "@/lib/documents/service";
import { defaultTemplateSchema } from "@/lib/documents/template-schema";
import { prisma } from "@/lib/prisma";

import { changeDocumentDetails, DocumentDetailsRefused } from "./document-details";

const SLUG = "crm-document-builder-test";
const ids = { company: "", user: "", lead: "", quote: "", quotation: "", invoiceDoc: "", invoice: "", receiptDoc: "", receipt: "", schools: "" };

const session = () => ({ user: { id: ids.user, companyId: ids.company, role: "MANAGER", name: "Tendai" } }) as unknown as AuthenticatedSession;

async function clear() {
  if (!ids.company) return;
  const companyId = ids.company;
  await prisma.crmActivity.deleteMany({ where: { companyId } });
  await prisma.crmLeadDocument.deleteMany({ where: { companyId } });
  await prisma.salesReceipt.deleteMany({ where: { companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.salesInvoice.deleteMany({ where: { companyId } });
  await prisma.salesQuotation.deleteMany({ where: { companyId } });
  await prisma.crmLead.deleteMany({ where: { companyId } });
  await prisma.documentTemplate.deleteMany({ where: { companyId } });
}

beforeAll(async () => {
  const company = await prisma.company.upsert({ where: { slug: SLUG }, update: {}, create: { name: "Builder test", slug: SLUG } });
  ids.company = company.id;
  await clear();
  ids.user = (
    await prisma.user.upsert({
      where: { email: `builder-${SLUG}@crm.test` },
      update: {},
      create: { email: `builder-${SLUG}@crm.test`, name: "Tendai", companyId: company.id, role: "MANAGER" },
    })
  ).id;
  const lead = await prisma.crmLead.create({ data: { companyId: company.id, leadNo: "LEAD-BLD-1", title: "Warehouse floor", contactName: "Rudo", assignedToId: ids.user } });
  ids.lead = lead.id;
  const lines = [{ description: "Resin floor", quantity: 10, unitPrice: 50 }];
  const quote = await createQuotationForLead({ companyId: company.id, userId: ids.user, leadId: lead.id, lines });
  Object.assign(ids, { quote: quote.leadDocumentId, quotation: quote.quotationNumber });
  const invoice = await createInvoiceForLead({ companyId: company.id, userId: ids.user, leadId: lead.id, lines, dueDate: new Date("2026-11-01") });
  ids.invoiceDoc = invoice.leadDocumentId;
  ids.invoice = (await prisma.crmLeadDocument.findUniqueOrThrow({ where: { id: invoice.leadDocumentId }, select: { invoiceId: true } })).invoiceId!;
  const receipt = await recordReceiptForLead({ companyId: company.id, userId: ids.user, leadId: lead.id, invoiceDocumentId: invoice.leadDocumentId, amount: 100, method: "Cash" });
  Object.assign(ids, { receiptDoc: receipt.leadDocumentId, receipt: receipt.receiptId });
  // A school's fee invoice layout in the same company, which a CRM invoice must not be offered.
  ids.schools = (
    await prisma.documentTemplate.create({
      data: { companyId: company.id, scope: "COMPANY", name: "Fee invoice", sourceKey: "schools.fees.invoice", documentType: "SALES_INVOICE", targetType: "RECORD" },
    })
  ).id;
});

afterAll(async () => {
  await clear();
  await prisma.user.deleteMany({ where: { companyId: ids.company } });
  await prisma.company.delete({ where: { id: ids.company } }).catch(() => {});
});

describe("layouts", () => {
  it("are offered for exactly this kind of document, and a saved one is the company's, published", async () => {
    const saved = await createCompanyLayout({
      companyId: ids.company,
      userId: ids.user,
      kind: "INVOICE",
      name: "Invoice, no stamp",
      schema: { ...defaultTemplateSchema, footer: { ...defaultTemplateSchema.footer, showStamp: false }, labels: { ...defaultTemplateSchema.labels, documentTitle: "Tax invoice" } },
    });
    const offered = await layoutsFor(ids.company, "INVOICE");
    expect(offered.map((layout) => layout.name)).toContain("Invoice, no stamp");
    expect(offered.map((layout) => layout.id)).not.toContain(ids.schools);
    expect(await isLayoutFor(ids.company, "INVOICE", ids.schools)).toBe(false);
    expect(await isLayoutFor(ids.company, "QUOTATION", saved.id)).toBe(false);
    expect(await isLayoutFor(ids.company, "INVOICE", saved.id)).toBe(true);
    expect((await layoutSchema(ids.company, "INVOICE", saved.id)).labels.documentTitle).toBe("Tax invoice");
  });

  it("preview the real record as HTML, in a layout's settings, without starting Chromium", async () => {
    const quotationId = (await prisma.crmLeadDocument.findUniqueOrThrow({ where: { id: ids.quote }, select: { quotationId: true } })).quotationId!;
    const html = await renderDocumentPreview(ids.company, {
      target: "RECORD",
      sourceKey: CRM_DOCUMENT_SOURCE_KEYS.QUOTATION,
      recordId: quotationId,
      schema: { ...defaultTemplateSchema, labels: { ...defaultTemplateSchema.labels, documentTitle: "Quote for the floor" } },
    });
    expect(html.startsWith("<!doctype html>") || html.toLowerCase().startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain(ids.quotation);
    expect(html).toContain("Quote for the floor");
    expect(html).toContain("Resin floor");
  });
});

describe("what changes once the figures cannot", () => {
  it("moves an invoice's due date, and says so in the record's history", async () => {
    const changed = await changeDocumentDetails(session(), ids.invoiceDoc, { dueDate: "2026-11-15" });
    expect(changed.subject).toMatch(/is now due on 15 November 2026$/);
    expect((await prisma.salesInvoice.findUniqueOrThrow({ where: { id: ids.invoice } })).dueDate?.toISOString().slice(0, 10)).toBe("2026-11-15");
    expect(await prisma.crmActivity.count({ where: { leadId: ids.lead, type: "SYSTEM", subject: changed.subject } })).toBe(1);
  });

  it("changes a receipt's method and reference, and nothing else on it", async () => {
    const before = await prisma.salesReceipt.findUniqueOrThrow({ where: { id: ids.receipt } });
    await changeDocumentDetails(session(), ids.receiptDoc, { method: "Mobile money", reference: "EcoCash 7H2K9" });
    const after = await prisma.salesReceipt.findUniqueOrThrow({ where: { id: ids.receipt } });
    expect(after).toMatchObject({ method: "Mobile money", reference: "EcoCash 7H2K9", amount: before.amount, receivedAt: before.receivedAt });
  });

  it("refuses a due date on a quote, and a method on an invoice", async () => {
    await expect(changeDocumentDetails(session(), ids.quote, { dueDate: "2026-11-15" })).rejects.toBeInstanceOf(DocumentDetailsRefused);
    await expect(changeDocumentDetails(session(), ids.invoiceDoc, { method: "Cash", reference: null })).rejects.toThrow("Only a receipt");
  });
});
