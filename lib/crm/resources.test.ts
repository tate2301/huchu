/**
 * Resources the client reviews alongside a quote or an invoice.
 *
 * Two kinds of failure are worth pinning. The quiet one: a rep ticks the
 * brochure, the quote saves without it, and they believe the client has it —
 * so an id the library cannot honour is refused, never skipped. And the one
 * that surfaces weeks later: archiving a resource must take it off new
 * documents without reaching into a quote already sent and taking its link
 * back.
 *
 * The pure rules are tested directly; the rest drives the real bridge and the
 * real PDF source against the test database.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { createInvoiceForLead, createQuotationForLead } from "@/lib/crm/accounting-bridge";
import {
  ResourceNotAvailableError,
  documentResourceLinks,
  preselectedResourceIds,
  resourcesHeading,
  type LibraryResource,
} from "@/lib/crm/resources";
import { resolveSourcePayload } from "@/lib/documents/source-registry";

function libraryEntry(overrides: Partial<LibraryResource> & { id: string }): LibraryResource {
  return {
    title: overrides.id,
    description: null,
    kind: "LINK",
    url: `https://example.invalid/${overrides.id}`,
    isDefault: false,
    archivedAt: null,
    sortOrder: 0,
    ...overrides,
  };
}

describe("which resources a new document starts with", () => {
  const library = [
    libraryEntry({ id: "terms", sortOrder: 2, isDefault: true }),
    libraryEntry({ id: "brochure", sortOrder: 0, isDefault: true }),
    libraryEntry({ id: "resin-sheet", sortOrder: 1 }),
    libraryEntry({ id: "old-brochure", sortOrder: 3, isDefault: true, archivedAt: "2026-09-01T00:00:00.000Z" }),
  ];

  it("ticks the defaults on a new document, in library order", () => {
    expect(preselectedResourceIds(library)).toEqual(["brochure", "terms"]);
  });

  it("never ticks a retired resource, even one still marked default", () => {
    expect(preselectedResourceIds(library)).not.toContain("old-brochure");
  });

  it("carries over what the version being replaced offered, not the defaults", () => {
    // The client already has the data sheet; a second version quietly dropping
    // it reads as the business withdrawing it.
    expect(preselectedResourceIds(library, ["resin-sheet", "brochure"])).toEqual([
      "brochure",
      "resin-sheet",
    ]);
  });

  it("drops a resource retired since the version being replaced", () => {
    expect(preselectedResourceIds(library, ["old-brochure", "terms"])).toEqual(["terms"]);
  });

  it("ticks nothing when the library is empty", () => {
    expect(preselectedResourceIds([])).toEqual([]);
  });
});

describe("what the client is shown", () => {
  it("lists a document's resources in library order, with blank descriptions dropped", () => {
    const links = documentResourceLinks([
      { resource: { title: "Terms", description: "  ", url: "https://example.invalid/t", sortOrder: 5 } },
      { resource: { title: "Brochure", description: "Our finishes", url: "https://example.invalid/b", sortOrder: 1 } },
    ]);
    expect(links).toEqual([
      { title: "Brochure", description: "Our finishes", url: "https://example.invalid/b" },
      { title: "Terms", description: null, url: "https://example.invalid/t" },
    ]);
  });

  it("asks for a review before accepting a quote, and offers the rest for reference", () => {
    expect(resourcesHeading("QUOTATION")).toBe("Review before you accept");
    expect(resourcesHeading("INVOICE")).toBe("For your reference");
  });
});

describe("resources on a real document", () => {
  const SLUG = "crm-resources-test";
  const EMAIL = "crm-resources-test@example.invalid";

  let companyId: string;
  let userId: string;
  let leadId: string;
  let brochureId: string;
  let sheetId: string;
  let retiredId: string;

  const lines = [{ description: "Epoxy floor, 120 m²", quantity: 120, unitPrice: 18 }];

  async function clear() {
    await prisma.crmDocumentResource.deleteMany({ where: { companyId } });
    await prisma.crmActivity.deleteMany({ where: { companyId } });
    await prisma.crmLeadDocument.deleteMany({ where: { companyId } });
    await prisma.salesQuotation.deleteMany({ where: { companyId } });
    await prisma.journalEntry.deleteMany({ where: { companyId } });
    await prisma.salesInvoice.deleteMany({ where: { companyId } });
  }

  beforeAll(async () => {
    const company = await prisma.company.upsert({
      where: { slug: SLUG },
      update: {},
      create: { name: "Resources Test", slug: SLUG },
    });
    companyId = company.id;
    const user = await prisma.user.upsert({
      where: { email: EMAIL },
      update: {},
      create: { email: EMAIL, name: "Tendai Sales", companyId, role: "MANAGER" },
    });
    userId = user.id;

    await clear();
    await prisma.crmResource.deleteMany({ where: { companyId } });
    await prisma.crmLead.deleteMany({ where: { companyId } });

    const lead = await prisma.crmLead.create({
      data: { companyId, leadNo: "LEAD-RES-1", title: "Warehouse floor", contactName: "Tariro Moyo" },
    });
    leadId = lead.id;

    const [brochure, sheet, retired] = await Promise.all([
      prisma.crmResource.create({
        data: {
          companyId,
          kind: "LINK",
          title: "Floorcode brochure",
          url: "https://example.invalid/brochure.pdf",
          isDefault: true,
          sortOrder: 0,
        },
      }),
      prisma.crmResource.create({
        data: {
          companyId,
          kind: "FILE",
          title: "Resin data sheet",
          description: "Cure times and chemical resistance",
          url: "https://store.example.invalid/companies/co/crm-attachments/resin.pdf",
          pathname: "companies/co/crm-attachments/resin.pdf",
          contentType: "application/pdf",
          sortOrder: 1,
        },
      }),
      prisma.crmResource.create({
        data: {
          companyId,
          kind: "LINK",
          title: "Last year's brochure",
          url: "https://example.invalid/old.pdf",
          archivedAt: new Date("2026-09-01T00:00:00.000Z"),
          sortOrder: 2,
        },
      }),
    ]);
    brochureId = brochure.id;
    sheetId = sheet.id;
    retiredId = retired.id;
  });

  beforeEach(clear);

  afterAll(async () => {
    await clear();
    await prisma.crmResource.deleteMany({ where: { companyId } });
    await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
    await prisma.crmLead.deleteMany({ where: { companyId } });
    // Users do not cascade from their company; everything they created is gone by now.
    await prisma.user.deleteMany({ where: { companyId } });
    // Raising the invoice seeded the tenant's chart and tax codes, whose own
    // foreign keys refuse a cascading delete. The slug is fixed, so a company
    // left behind is reused by the next run rather than piling up.
    await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  });

  async function quotationPdfLinks(quotationId: string) {
    const source = await resolveSourcePayload(companyId, {
      target: "RECORD",
      sourceKey: "accounting.sales.quotation",
      recordId: quotationId,
    });
    return source.payload.links;
  }

  it("records what a quote offered, and its PDF prints them in library order", async () => {
    const quote = await createQuotationForLead({
      companyId,
      userId,
      leadId,
      lines,
      resourceIds: [sheetId, brochureId],
    });

    expect(
      await prisma.crmDocumentResource.count({ where: { documentId: quote.leadDocumentId } }),
    ).toBe(2);

    expect(await quotationPdfLinks(quote.quotationId)).toEqual({
      heading: "Review before you accept",
      items: [
        { title: "Floorcode brochure", description: null, url: "https://example.invalid/brochure.pdf" },
        {
          title: "Resin data sheet",
          description: "Cure times and chemical resistance",
          url: "https://store.example.invalid/companies/co/crm-attachments/resin.pdf",
        },
      ],
    });
  });

  it("prints no block for a quote that offered nothing", async () => {
    const quote = await createQuotationForLead({ companyId, userId, leadId, lines });
    expect(await quotationPdfLinks(quote.quotationId)).toBeUndefined();
  });

  it("refuses a retired resource rather than saving the quote without it", async () => {
    await expect(
      createQuotationForLead({ companyId, userId, leadId, lines, resourceIds: [brochureId, retiredId] }),
    ).rejects.toBeInstanceOf(ResourceNotAvailableError);
    // Nothing half-saved: the quote went with the refusal.
    expect(await prisma.crmLeadDocument.count({ where: { companyId } })).toBe(0);
  });

  it("refuses an id that is not in this tenant's library", async () => {
    await expect(
      createQuotationForLead({
        companyId,
        userId,
        leadId,
        lines,
        resourceIds: ["5f0c8a2e-9d1b-4c3a-8e7f-6a5b4c3d2e1f"],
      }),
    ).rejects.toBeInstanceOf(ResourceNotAvailableError);
  });

  it("keeps a sent quote's link after the resource is archived", async () => {
    const quote = await createQuotationForLead({ companyId, userId, leadId, lines, resourceIds: [sheetId] });
    await prisma.crmResource.update({ where: { id: sheetId }, data: { archivedAt: new Date() } });
    try {
      const links = await quotationPdfLinks(quote.quotationId);
      expect(links?.items.map((item) => item.title)).toEqual(["Resin data sheet"]);
    } finally {
      await prisma.crmResource.update({ where: { id: sheetId }, data: { archivedAt: null } });
    }
  });

  it("lists them on an invoice for reference", async () => {
    const invoice = await createInvoiceForLead({
      companyId,
      userId,
      leadId,
      lines,
      resourceIds: [brochureId],
    });
    const source = await resolveSourcePayload(companyId, {
      target: "RECORD",
      sourceKey: "accounting.sales.invoice",
      recordId: invoice.invoiceId,
    });
    expect(source.payload.links?.heading).toBe("For your reference");
    expect(source.payload.links?.items.map((item) => item.title)).toEqual(["Floorcode brochure"]);
  });
});
