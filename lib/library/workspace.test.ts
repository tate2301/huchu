import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { findBuildRecord, recordHref, recordProvisioned } from "@/lib/build/read";
import { DEFAULT_TEMPLATE_CATALOG } from "@/lib/documents/default-template-catalog";
import { isLayoutFor, layoutsFor } from "@/lib/documents/layouts";
import { resolveTemplate } from "@/lib/documents/template-resolver";
import type { SignedInOperator } from "@/lib/operators/guards";
import { prisma } from "@/lib/prisma";

import { EMPTY_LAYOUT } from "./build-kinds";
import { copyLibraryBlockTemplate, copyLibraryEnquiryForm, copyLibraryLayout, copyLibraryVisitForm, freeCopyName } from "./copy";
import { createLibraryItem, publishLibraryItem } from "./store";
import { libraryLayoutFor, readWorkspaceLibrary, workspaceLibraryItem } from "./workspace";

const run = randomUUID().slice(0, 8);
let owner: SignedInOperator;
let shop: { id: string };
let other: { id: string };
let userId: string;

const CRM = ["crm.core", "crm.intake", "core.branding.manage", "accounting.core"];
const PAYSLIP = DEFAULT_TEMPLATE_CATALOG.find((entry) => entry.sourceKey === "hr.payslip")!;

const visitForm = {
  kind: "PRODUCT" as const,
  fields: [{ key: "areas", label: "Areas to be coated", type: "areas" as const, required: true, unit: "m" }],
  quoteLines: [{ id: "system", description: "Floor system", unit: "m²", unitPrice: 30, quantity: { from: "field" as const, key: "areas", factor: 1 } }],
};
const enquiryForm = {
  headline: "Tell us about the floor",
  allowPhotos: true,
  maxPhotos: 3,
  fields: [{ key: "size", label: "How big is it?", type: "text" as const, required: false }],
  services: [{ id: "epoxy", label: "Epoxy" }],
};
const quote = { kind: "QUOTE" as const, attributes: { custom: {}, description: "A plain quote" }, blocks: [{ id: "title", type: "heading" as const, text: "Quotation", level: 1 as const }] };
const invoiceLayout = { ...EMPTY_LAYOUT, schema: { ...EMPTY_LAYOUT.schema, labels: { ...EMPTY_LAYOUT.schema.labels, documentTitle: `Library invoice ${run}` } } };

async function published(kind: "VISIT_FORM" | "ENQUIRY_FORM" | "BLOCK_TEMPLATE" | "LAYOUT", title: string, payload: unknown, to: "everyone" | "shop" = "everyone") {
  const item = await createLibraryItem(owner, { kind, title: `${title} ${run}`, payload });
  await publishLibraryItem(owner, item.id, to === "everyone" ? { audience: "EVERYONE" } : { audience: "WORKSPACES", companyIds: [shop.id] });
  return item;
}

beforeAll(async () => {
  const op = await prisma.operator.create({ data: { email: `libws-${run}@corelith.test`, name: "Rudo", role: "OWNER" } });
  owner = { sessionId: "o", id: op.id, email: op.email, name: op.name, role: op.role };
  shop = await prisma.company.create({ data: { name: `Floors ${run}`, slug: `floors-${run}` } });
  other = await prisma.company.create({ data: { name: `Other ${run}`, slug: `other-${run}` } });
  userId = (await prisma.user.create({ data: { name: "Chipo", email: `chipo-${run}@floors.test`, role: "MANAGER", companyId: shop.id } })).id;
});

afterAll(async () => {
  const items = await prisma.libraryItem.findMany({ where: { createdById: owner.id }, select: { id: true } });
  await prisma.libraryItem.deleteMany({ where: { createdById: owner.id } });
  await prisma.platformAuditEvent.deleteMany({ where: { entityType: "library_item", entityId: { in: items.map((item) => item.id) } } });
  const companyId = { in: [shop.id, other.id] };
  await prisma.crmQuestion.deleteMany({ where: { companyId } });
  await prisma.crmQuestionSet.deleteMany({ where: { companyId } });
  await prisma.crmIntakeForm.deleteMany({ where: { companyId } });
  await prisma.crmTemplate.deleteMany({ where: { companyId } });
  await prisma.documentTemplate.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.operator.deleteMany({ where: { id: owner.id } });
});

describe("the library's forms, templates and layouts in a workspace", () => {
  it("reads what reaches the workspace, kept to the modules it runs", async () => {
    const visit = await published("VISIT_FORM", "Floor survey", visitForm);
    const payslip = await published("LAYOUT", "Payslip", { sourceKey: PAYSLIP.sourceKey, documentType: PAYSLIP.documentType, targetType: PAYSLIP.targetType, schema: PAYSLIP.schema });
    const named = await published("BLOCK_TEMPLATE", "Shop quote", quote, "shop");

    const crm = await readWorkspaceLibrary(shop.id, CRM);
    expect(crm.visitForms.map((entry) => entry.key)).toContain(visit.key);
    expect(crm.blockTemplates.map((entry) => entry.key)).toContain(named.key);
    // No payroll, no payslip.
    expect(crm.layouts.map((entry) => entry.key)).not.toContain(payslip.key);
    expect((await readWorkspaceLibrary(shop.id, [...CRM, "hr.employees", "hr.payroll"])).layouts.map((entry) => entry.key)).toContain(payslip.key);
    // No CRM, no site-visit forms.
    expect((await readWorkspaceLibrary(shop.id, ["core.branding.manage"])).visitForms).toEqual([]);
    // Published to the shop by name, not to anyone else.
    expect((await readWorkspaceLibrary(other.id, CRM)).blockTemplates.map((entry) => entry.key)).not.toContain(named.key);
  });

  it("opens one by its address in Build, read-only, in its kind's builder", async () => {
    const quoteItem = await published("BLOCK_TEMPLATE", "Plain quote", quote);
    const record = await findBuildRecord(shop.id, quoteItem.key);
    expect(record).toEqual({ source: "library", id: quoteItem.key, kind: "BLOCK_TEMPLATE", blockKind: "QUOTE" });
    expect(recordHref(record!)).toBe(`/build/documents/${quoteItem.key}`);
    expect(recordProvisioned(record!, CRM)).toBe(true);
    expect(recordProvisioned(record!, ["core.branding.manage"])).toBe(false);
    expect((await workspaceLibraryItem(shop.id, quoteItem.key))?.kind).toBe("BLOCK_TEMPLATE");
    expect(await findBuildRecord(shop.id, `nothing-here-${run}`)).toBeNull();
  });

  it("copies each kind into the workspace through its own tables, as a draft named to fit", async () => {
    const visit = await published("VISIT_FORM", "Coating survey", visitForm);
    const set = await copyLibraryVisitForm(shop.id, userId, visit.key);
    expect(set).toMatchObject({ companyId: shop.id, name: `Coating survey ${run}`, kind: "PRODUCT", isActive: false });
    expect(await prisma.crmQuestion.count({ where: { questionSetId: set!.id } })).toBe(1);

    const enquiry = await published("ENQUIRY_FORM", "Showroom enquiry", enquiryForm);
    const first = await copyLibraryEnquiryForm(shop.id, userId, enquiry.key);
    const second = await copyLibraryEnquiryForm(shop.id, userId, enquiry.key);
    expect(second?.name).toBe(`${first?.name} 2`);
    expect(await prisma.crmIntakeForm.findUnique({ where: { id: first!.id }, select: { headline: true, maxPhotos: true, isActive: true } })).toEqual({
      headline: "Tell us about the floor",
      maxPhotos: 3,
      isActive: false,
    });

    const template = await published("BLOCK_TEMPLATE", "Quote to copy", quote);
    expect(await copyLibraryBlockTemplate(shop.id, userId, template.key)).toMatchObject({ name: `Quote to copy ${run}`, kind: "QUOTE" });
    expect(await prisma.crmTemplate.findFirst({ where: { companyId: shop.id, name: `Quote to copy ${run}` }, select: { isShared: true } })).toEqual({ isShared: false });

    const layout = await published("LAYOUT", "Invoice to copy", invoiceLayout);
    const made = await copyLibraryLayout(shop.id, userId, layout.key);
    expect(made?.template).toMatchObject({ scope: "COMPANY", isDefault: false, sourceKey: "accounting.sales.invoice" });
    expect(JSON.parse(made!.version.schemaJson).labels.documentTitle).toBe(`Library invoice ${run}`);

    // Not one that reaches another workspace.
    const named = await published("VISIT_FORM", "Shop only survey", visitForm, "shop");
    expect(await copyLibraryVisitForm(other.id, userId, named.key)).toBeNull();
  });

  it("prints with a published layout after the workspace's own default and before Corelith's code", async () => {
    const before = await resolveTemplate({ companyId: other.id, documentType: "SALES_QUOTATION", targetType: "RECORD", sourceKey: "accounting.sales.quotation" });
    const layout = await published("LAYOUT", "Quote layout", {
      sourceKey: "accounting.sales.quotation",
      documentType: "SALES_QUOTATION",
      targetType: "RECORD",
      schema: { ...before.templateSchema, labels: { ...before.templateSchema.labels, documentTitle: `Corelith quote ${run}` } },
    });
    const match = { sourceKey: "accounting.sales.quotation", documentType: "SALES_QUOTATION" as const, targetType: "RECORD" as const };
    expect((await libraryLayoutFor(other.id, match))?.id).toBe(layout.id);

    const resolved = await resolveTemplate({ companyId: other.id, ...match });
    expect(resolved.templateSchema.labels.documentTitle).toBe(`Corelith quote ${run}`);
    expect(resolved.templateId).toBeNull();

    // The CRM's chooser offers it as the default, and a document may be given it by id.
    const choices = await layoutsFor(other.id, "QUOTATION");
    expect(choices[0]).toMatchObject({ id: layout.id, isDefault: true, own: false });
    expect(await isLayoutFor(other.id, "QUOTATION", layout.id)).toBe(true);
    expect(await isLayoutFor(other.id, "INVOICE", layout.id)).toBe(false);
    expect((await resolveTemplate({ companyId: other.id, ...match, templateId: layout.id })).templateSchema.labels.documentTitle).toBe(`Corelith quote ${run}`);

    // The workspace's own default wins.
    const own = await prisma.documentTemplate.create({
      data: {
        companyId: other.id,
        scope: "COMPANY",
        name: "Our quote",
        ...match,
        isDefault: true,
        versions: { create: { version: 1, isPublished: true, schemaJson: JSON.stringify({ ...before.templateSchema, labels: { ...before.templateSchema.labels, documentTitle: "Ours" } }) } },
      },
    });
    expect((await resolveTemplate({ companyId: other.id, ...match })).templateSchema.labels.documentTitle).toBe("Ours");
    expect((await layoutsFor(other.id, "QUOTATION")).find((choice) => choice.isDefault)?.id).toBe(own.id);
  });

  it("names a copy so nothing of its kind clashes", () => {
    expect(freeCopyName("Quotation", [])).toBe("Quotation");
    expect(freeCopyName("Quotation", ["quotation", "Quotation 2"])).toBe("Quotation 3");
  });
});
