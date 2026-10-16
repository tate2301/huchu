import { describe, expect, it } from "vitest";

import { buildProvisions } from "@/lib/build/provision";
import { corelithTemplates, libraryHref } from "@/lib/build/templates";
import { readMarketplace } from "@/lib/management/marketplace";

import {
  blockTemplatePayloadSchema,
  EMPTY_BLOCK_TEMPLATE,
  EMPTY_ENQUIRY_FORM,
  EMPTY_LAYOUT,
  EMPTY_VISIT_FORM,
  enquiryFormPayloadSchema,
  layoutPayloadSchema,
  visitFormPayloadSchema,
} from "./build-kinds";
import { EMPTY_PAYLOAD, LIBRARY_KINDS } from "./kinds";
import { libraryLayoutPreview } from "./layout-preview";
import type { WorkspaceLibrary } from "./workspace";

const messages = (result: { success: boolean; error?: { issues: Array<{ message: string }> } }) => result.error?.issues.map((issue) => issue.message) ?? [];

describe("the library's form, template and layout payloads", () => {
  it("starts each kind from a payload its own schema reads", () => {
    for (const kind of ["VISIT_FORM", "ENQUIRY_FORM", "BLOCK_TEMPLATE", "LAYOUT"] as const) {
      expect(LIBRARY_KINDS[kind].payload.safeParse(EMPTY_PAYLOAD[kind]).success).toBe(true);
    }
  });

  it("refuses a site-visit form its builder would not publish", () => {
    const area = { key: "areas", label: "Areas", type: "areas" as const, required: true };
    expect(visitFormPayloadSchema.safeParse({ ...EMPTY_VISIT_FORM, fields: [area] }).success).toBe(true);
    expect(messages(visitFormPayloadSchema.safeParse({ ...EMPTY_VISIT_FORM, fields: [{ ...area, label: " " }] }))).toContain("Every question needs something to ask.");
    const line = { id: "l", description: "Coating", unitPrice: 10, quantity: { from: "field", key: "nothing", factor: 1 } };
    expect(messages(visitFormPayloadSchema.safeParse({ ...EMPTY_VISIT_FORM, fields: [area], quoteLines: [line] }))[0]).toMatch(/not on the form/);
    // A workspace's product is not Corelith's to name.
    expect(visitFormPayloadSchema.safeParse({ ...EMPTY_VISIT_FORM, fields: [area], quoteLines: [{ ...line, productId: "p1", quantity: { from: "fixed", value: 1 } }] }).success).toBe(false);
    // A question the site-visit form has no column for.
    expect(messages(visitFormPayloadSchema.safeParse({ ...EMPTY_VISIT_FORM, fields: [{ key: "mail", label: "Email", type: "email", required: false }] }))[0]).toMatch(/cannot ask/);
  });

  it("refuses an enquiry form offering one service twice, and a template whose blocks do not belong", () => {
    const epoxy = { id: "epoxy", label: "Epoxy" };
    expect(enquiryFormPayloadSchema.safeParse({ ...EMPTY_ENQUIRY_FORM, services: [epoxy] }).success).toBe(true);
    expect(enquiryFormPayloadSchema.safeParse({ ...EMPTY_ENQUIRY_FORM, services: [epoxy, epoxy] }).success).toBe(false);
    expect(blockTemplatePayloadSchema.safeParse({ ...EMPTY_BLOCK_TEMPLATE, kind: "FORM" }).success).toBe(false);
    expect(messages(blockTemplatePayloadSchema.safeParse({ ...EMPTY_BLOCK_TEMPLATE, kind: "RECEIPT", blocks: [{ id: "s", type: "signature", label: "Sign", party: "customer" }] }))[0]).toMatch(
      /does not belong/,
    );
  });

  it("keeps a layout to a source the catalogue prints", () => {
    expect(layoutPayloadSchema.safeParse(EMPTY_LAYOUT).success).toBe(true);
    expect(layoutPayloadSchema.safeParse({ ...EMPTY_LAYOUT, sourceKey: "made.up" }).success).toBe(false);
    expect(layoutPayloadSchema.safeParse({ ...EMPTY_LAYOUT, documentType: "SALES_RECEIPT" }).success).toBe(false);
  });

  it("draws a layout with the source's sample record on a sample letterhead", () => {
    const html = libraryLayoutPreview(EMPTY_LAYOUT.sourceKey, EMPTY_LAYOUT.schema);
    expect(html).toContain("Sample Company");
    expect(html).toContain("<html");
  });
});

const library: WorkspaceLibrary = {
  visitForms: [{ id: "v", key: "floor-survey", title: "Floor survey", summary: null, payload: { ...EMPTY_VISIT_FORM, fields: [{ key: "areas", label: "Areas", type: "areas", required: true }] } }],
  enquiryForms: [{ id: "e", key: "showroom", title: "Showroom enquiry", summary: "From the showroom", payload: EMPTY_ENQUIRY_FORM }],
  blockTemplates: [
    { id: "b", key: "site-brief", title: "Site brief", summary: null, payload: { ...EMPTY_BLOCK_TEMPLATE, kind: "FORM" } },
    { id: "q", key: "plain-quote", title: "Plain quote", summary: null, payload: EMPTY_BLOCK_TEMPLATE },
  ],
  layouts: [
    { id: "l2", key: "invoice-new", title: "Invoice, newer", summary: null, payload: EMPTY_LAYOUT },
    { id: "l1", key: "invoice-old", title: "Invoice, older", summary: null, payload: EMPTY_LAYOUT },
  ],
};

describe("the library in Build's From Corelith and the marketplace", () => {
  const crm = ["crm.core", "crm.intake", "core.branding.manage", "accounting.core"];

  it("lists each beside the ones in code, opening read-only and used through the library", () => {
    const rows = corelithTemplates(buildProvisions(crm), crm, new Set(), library);
    const survey = rows.find((row) => row.key === "library:floor-survey");
    expect(survey).toMatchObject({ group: "forms", description: "1 question", href: "/build/forms/floor-survey", start: { type: "library", kind: "VISIT_FORM", key: "floor-survey" } });
    expect(rows.find((row) => row.key === "library:site-brief")?.href).toBe("/build/forms/site-brief");
    expect(rows.find((row) => row.key === "library:plain-quote")).toMatchObject({ group: "documents", href: "/build/documents/plain-quote" });
    expect(libraryHref("BLOCK_TEMPLATE", "welcome", "EMAIL")).toBe("/build/templates/welcome");
  });

  it("makes the newest library layout the default for its source, in place of the catalogue's, until the workspace has its own", () => {
    const rows = corelithTemplates(buildProvisions(crm), crm, new Set(), library);
    expect(rows.find((row) => row.key === "library:invoice-new")?.badge).toBe("Default");
    expect(rows.find((row) => row.key === "library:invoice-old")?.badge).toBeNull();
    expect(rows.find((row) => row.key === "layout:accounting.sales.invoice")?.badge).toBe("Built in");
    const own = corelithTemplates(buildProvisions(crm), crm, new Set(["accounting.sales.invoice"]), library);
    expect(own.find((row) => row.key === "library:invoice-new")?.badge).toBeNull();
  });

  it("fills the marketplace's forms and documents", async () => {
    const db = { documentTemplate: { findMany: async () => [] }, companySubscriptionAddon: { findMany: async () => [] } } as never;
    const sections = await readMarketplace(db, "c", { reportTemplates: [], verticalName: "your business", library });
    const items = sections.flatMap((section) => section.items).filter((item) => item.key.startsWith("library:"));
    expect(items.filter((item) => item.kind === "forms").map((item) => item.name)).toEqual(["Floor survey", "Showroom enquiry", "Site brief"]);
    expect(items.filter((item) => item.kind === "documents").map((item) => item.name)).toEqual(["Plain quote", "Invoice, newer", "Invoice, older"]);
    expect(items.find((item) => item.name === "Showroom enquiry")).toMatchObject({ detail: "From the showroom", href: "/build/forms/showroom", maker: "Corelith" });
  });
});
