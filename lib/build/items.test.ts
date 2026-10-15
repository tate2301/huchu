import { describe, expect, it } from "vitest";

import {
  blockItem,
  buildBadges,
  buildCounts,
  buildFinding,
  buildHref,
  enquiryItem,
  filterBuildItems,
  layoutItem,
  readBuildQuery,
  reportItem,
  visitItem,
} from "./items";
import { buildProvisions, layoutProvisioned, layoutUser } from "./provision";
import { corelithTemplates, templatesView } from "./templates";

const at = "2026-10-12T09:00:00.000Z";

const items = [
  visitItem({ id: "v1", name: "Floor site visit", kind: "PRODUCT", isActive: true, updatedAt: at }),
  enquiryItem({ id: "e1", name: "Showroom enquiry", isActive: false, updatedAt: at }),
  blockItem({ id: "b1", name: "Quotation", kind: "QUOTE", isShared: true, isActive: true, updatedAt: at }),
  blockItem({ id: "b2", name: "Invoice email", kind: "EMAIL", isShared: true, isActive: true, updatedAt: at }),
  blockItem({ id: "b3", name: "Old quotation", kind: "QUOTE", isShared: true, isActive: false, updatedAt: at }),
  layoutItem(
    {
      id: "l1",
      name: "Payslip",
      sourceKey: "hr.payslip",
      documentType: "GENERIC_RECORD",
      isDefault: true,
      isActive: true,
      updatedAt: at,
      versions: [
        { version: 1, isPublished: false },
        { version: 2, isPublished: true },
        { version: 3, isPublished: false },
      ],
    },
    "payroll",
  ),
  reportItem({ id: "r1", title: "Monday board", audience: "JUST_ME", updatedAt: at }),
];

describe("Build's items", () => {
  it("opens each kind in its builder", () => {
    expect(items.map((item) => item.href)).toEqual([
      "/build/forms/v1",
      "/build/forms/e1",
      "/build/documents/b1",
      "/build/templates/b2",
      "/build/documents/b3",
      "/build/templates/l1",
      "/build/reports/r1",
    ]);
    expect(buildHref("block", "f1", "FORM")).toBe("/build/forms/f1");
  });

  it("reads status and version from each table's own facts", () => {
    expect(items.map((item) => item.status)).toEqual(["published", "draft", "published", "published", "retired", "published", "draft"]);
    expect(items.find((item) => item.id === "l1")).toMatchObject({ version: 2, isDefault: true, usedFor: "Pay runs", usedBy: "payroll", kind: "document" });
    expect(items.find((item) => item.id === "b2")?.kind).toBe("email");
  });

  it("counts by kind, status and module, and keys the panel's figures by its rows", () => {
    const counts = buildCounts(items);
    expect(counts.all).toBe(7);
    expect(counts.kind).toEqual({ form: 2, document: 3, email: 1, report: 1 });
    expect(counts.status).toEqual({ published: 4, draft: 2, retired: 1 });
    const badges = buildBadges(counts, { corelith: 24, made: 6, retired: 1 });
    expect(badges["/build"]).toBe("7");
    expect(badges["/build?kind=forms"]).toBe("2");
    expect(badges["/build?used=payroll"]).toBe("1");
    expect(badges["/build/templates"]).toBe("24");
    expect(badges["/build/templates?view=retired"]).toBe("1");
  });

  it("narrows by the address's kind, module, status and search", () => {
    const query = readBuildQuery(new URLSearchParams("kind=documents&status=retired"));
    expect(query).toMatchObject({ kind: "document", status: "retired", used: null, page: 1 });
    expect(filterBuildItems(items, query).map((item) => item.id)).toEqual(["b3"]);
    expect(filterBuildItems(items, { ...readBuildQuery(new URLSearchParams("used=crm")), q: "invoice" }).map((item) => item.id)).toEqual(["b2"]);
  });

  it("says how many are in use", () => {
    expect(buildFinding(items).fact).toBe("4 forms, documents, emails and reports are in use.");
    expect(buildFinding([]).fact).toBe("Nothing is built here yet.");
  });
});

describe("what a workspace is provisioned to build", () => {
  const school = ["schools.core", "core.branding.manage", "accounting.core"];
  const crm = ["crm.core", "crm.intake", "core.branding.manage", "hr.employees", "hr.payroll"];

  it("keeps the CRM's forms to a workspace with the CRM", () => {
    expect(buildProvisions(school)).toMatchObject({ visitForms: false, enquiryForms: false, blocks: false, layouts: true, schools: true });
    expect(buildProvisions(crm)).toMatchObject({ visitForms: true, enquiryForms: true, blocks: true, payroll: true, schools: false });
  });

  it("offers a printed layout only where its module runs", () => {
    expect(layoutUser("hr.payslip")).toBe("payroll");
    expect(layoutProvisioned("hr.payslip", school)).toBe(false);
    expect(layoutProvisioned("hr.payslip", crm)).toBe(true);
    expect(layoutProvisioned("schools.fee.receipt", school)).toBe(true);
    const offered = corelithTemplates(buildProvisions(school), school).map((template) => template.key);
    expect(offered.some((key) => key.startsWith("visit:") || key.startsWith("block:") || key === "enquiry")).toBe(false);
    expect(offered).toContain("layout:schools.fee.receipt");
    expect(offered).not.toContain("layout:hr.payslip");
  });

  it("marks Corelith's layout as the default until the workspace has its own", () => {
    const view = templatesView(items, buildProvisions(crm), crm);
    expect(view.corelith.find((template) => template.key === "layout:hr.payslip")?.badge).toBe("Built in");
    expect(view.made.map((template) => template.name)).not.toContain("Old quotation");
    expect(view.retired.map((template) => template.name)).toEqual(["Old quotation"]);
    expect(view.made.map((template) => template.name)).not.toContain("Monday board");
  });
});
