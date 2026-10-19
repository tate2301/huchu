import { describe, expect, it } from "vitest";

import { navSections } from "@/lib/navigation";
import {
  CLIENT_BUNDLE_TEMPLATES,
  getClientTemplateDisabledFeatureKeys,
  getClientTemplateFeatureKeys,
} from "@/lib/platform/client-templates";
import { areaRows, areasFromSections } from "@/lib/rail/areas";
import { getRailModel } from "@/lib/rail/model";
import { getWorkspaceOptions, getWorkspaceProfileForTemplate, getWorkspaceSidebarModel } from "@/lib/workspaces";

const books = navSections.find((section) => section.id === "accounting")!;

describe("Books' panel (design/core-modules/tools/boards/books_nav.py)", () => {
  const level = (id: string) => books.items.filter((item) => item.group === id).map((item) => item.label);

  it("opens on Money, then a row per level in the board's order", () => {
    expect(books.items.filter((item) => !item.group).map((item) => item.label)).toEqual(["Money"]);
    expect(books.groups?.map((group) => group.label)).toEqual([
      "Sales",
      "Bills & spending",
      "Bank & cash",
      "Tax",
      "Close the month",
      "Ledger",
      "Settings",
    ]);
    expect(books.groups?.every((group) => group.level)).toBe(true);
  });

  it("draws each level's rows in the board's order, leaving out the ones with no page yet", () => {
    expect(level("books-sales")).toEqual(["Invoices", "Quotes", "Payments received", "Credit notes", "Customers"]);
    expect(level("books-spending")).toEqual(["All spending", "Bills", "Payments made", "Purchase orders", "Requisitions", "Claims & petty cash", "Suppliers"]);
    expect(level("books-bank")).toEqual(["Accounts", "To match", "Takings"]);
    expect(level("books-tax")).toEqual(["VAT returns", "Fiscal register"]);
    expect(level("books-close")).toEqual(["Checklist", "Needs posting", "Rates & revaluation"]);
    expect(level("books-ledger")).toEqual([
      "Journals",
      "Trial balance",
      "Financial statements",
      "Chart of accounts",
      "Cost centres",
      "Posting rules",
    ]);
    expect(level("books-settings")).toEqual(["Tax codes & rules", "Set up the books"]);
    const settings = books.groups?.find((group) => group.id === "books-settings");
    expect(settings?.links?.label).toBe("In Management");
    expect(settings?.links?.items.map((item) => item.label)).toEqual(["Business & tax details", "Approvals & limits", "Fiscal device"]);
  });

  it("puts every Sales and Bills & spending row at its Books address, and Needs posting under Close the month", () => {
    for (const item of books.items.filter((row) => row.group === "books-sales" || row.group === "books-spending")) expect(item.href).toMatch(/^\/books\//);
    expect(books.items.find((item) => item.label === "Needs posting")?.group).toBe("books-close");
    const hrefs = books.items.map((item) => item.href);
    expect(hrefs).toEqual(expect.arrayContaining(["/books/journals", "/books/vat", "/books/periods"]));
    expect(hrefs.some((href) => /^\/accounting\/(journals|tax|periods|sales|receivables|purchases|payables)(\?|$)/.test(href))).toBe(false);
  });

  it("points every row at a page that exists: no dead links", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const pages = [...books.items, ...(books.groups ?? []).flatMap((group) => group.links?.items ?? [])];
    for (const item of pages) {
      const route = (item.href.split("?")[0] ?? item.href).replace(/^\//, "");
      expect(fs.existsSync(path.join(process.cwd(), "app", route, "page.tsx")), `${item.label} → ${item.href}`).toBe(true);
    }
  });

  it("reaches the rail as one module whose groups are levels, each page behind its own feature", () => {
    const features = ["accounting.core", "accounting.ar", "accounting.banking", "accounting.journals", "accounting.periods", "accounting.tax"];
    const model = getWorkspaceSidebarModel({ role: "SUPERADMIN", enabledFeatures: features, workspaceProfile: "GENERAL" });
    const area = getRailModel(model.sections).areas.find((candidate) => candidate.label === "Books");
    expect(area?.bands ?? []).toEqual([]);
    expect(area?.folders?.map((folder) => folder.label)).toEqual(["Sales", "Bank & cash", "Tax", "Close the month", "Ledger", "Settings"]);
    expect(areaRows(area!).map((item) => item.label)).toEqual(["Money"]);
    const labels = area?.items.map((item) => item.label) ?? [];
    expect(labels).toEqual(expect.arrayContaining(["Money", "Invoices", "Payments received", "To match", "VAT returns", "Journals", "Checklist"]));
    // Takings needs the tills; All spending needs Payables.
    expect(labels).not.toContain("Takings");
    expect(labels).not.toContain("All spending");
  });

  it("keeps Ledger and Settings for the owner, a manager and the accountant (§3.2)", () => {
    const features = getClientTemplateFeatureKeys("TEMPLATE_CRM");
    const levels = (role: string) => {
      const sections = getWorkspaceSidebarModel({ role, enabledFeatures: features, workspaceProfile: "GENERAL" }).sections;
      return areasFromSections(sections, { flatten: false }).find((area) => area.label === "Books")?.folders?.map((folder) => folder.label) ?? [];
    };
    for (const role of ["SUPERADMIN", "MANAGER", "FINANCE_OFFICER"]) expect(levels(role)).toEqual(expect.arrayContaining(["Ledger", "Settings"]));
    for (const role of ["BURSAR", "CLERK"]) {
      expect(levels(role)).not.toContain("Ledger");
      expect(levels(role)).not.toContain("Settings");
    }
  });
});

describe("each module's panel (the owner, 15 Oct: Reports listed its rows twice, and leaked into the CRM's)", () => {
  // Every template, every workspace it splits into, for the roles that see the most and the least.
  const cases = CLIENT_BUNDLE_TEMPLATES.flatMap((template) => {
    const disabled = new Set(getClientTemplateDisabledFeatureKeys(template.code));
    const enabledFeatures = getClientTemplateFeatureKeys(template.code).filter((key) => !disabled.has(key));
    const workspaceProfile = getWorkspaceProfileForTemplate(template.code);
    return ["SUPERADMIN", "MANAGER", "CLERK"].flatMap((role) =>
      getWorkspaceOptions({ role, enabledFeatures, workspaceProfile }).map((option) => ({
        name: `${template.code} › ${option.label} as ${role}`,
        args: { role, enabledFeatures, workspaceProfile, activeWorkspaceId: option.id },
      })),
    );
  });

  it.each(cases.map((entry) => [entry.name, entry.args] as const))("%s: no row twice, and no other module's rows", (_, args) => {
    const sections = getWorkspaceSidebarModel(args).sections;
    // Read both ways the rail can: modules split into their groups, and modules whole with their groups as levels.
    for (const areas of [getRailModel(sections).areas, areasFromSections(sections, { flatten: false })]) {
      const owner = new Map<string, string>();
      for (const area of areas) {
        const hrefs = area.items.map((item) => item.href);
        expect(new Set(hrefs).size, `${area.label} lists a row twice: ${hrefs.join(", ")}`).toBe(hrefs.length);
        for (const folder of area.folders ?? []) {
          const inFolder = folder.items.map((item) => item.href);
          expect(new Set(inFolder).size, `${area.label} › ${folder.label}`).toBe(inFolder.length);
          expect(inFolder.every((href) => hrefs.includes(href)), `${area.label} › ${folder.label}`).toBe(true);
        }
        for (const href of hrefs) {
          expect(owner.get(href), `${href} is in ${owner.get(href)} and ${area.label}`).toBeUndefined();
          owner.set(href, area.label);
        }
      }
      // Reports' rows are in Reports' panel alone; Explore and Vane are modules of their own.
      const holding = (prefix: RegExp) => areas.filter((area) => area.items.some((item) => prefix.test(item.href))).map((area) => area.id);
      expect(holding(/^\/reports(\/|\?|$)/).length).toBeLessThanOrEqual(1);
      expect(holding(/^\/explore/).every((id) => id === "explore")).toBe(true);
      expect(holding(/^\/vane/).every((id) => id === "vane")).toBe(true);
    }
  });

  it("gives Explore a module of its own beside Reports, for owners and managers only", () => {
    const floorcode = (role: string) =>
      getWorkspaceSidebarModel({
        role,
        enabledFeatures: getClientTemplateFeatureKeys("TEMPLATE_CRM"),
        workspaceProfile: "GENERAL",
      }).sections.map((section) => section.id);
    const owner = floorcode("SUPERADMIN");
    expect(owner.indexOf("explore")).toBe(owner.indexOf("reporting") + 1);
    expect(floorcode("CLERK")).not.toContain("explore");
  });

  it("gives Vane's pages a module of their own, last, in every workspace", () => {
    const sections = getWorkspaceSidebarModel({
      role: "CLERK",
      enabledFeatures: getClientTemplateFeatureKeys("TEMPLATE_CRM"),
      workspaceProfile: "GENERAL",
    }).sections;
    expect(sections.at(-1)?.id).toBe("vane");
    expect(sections.at(-1)?.items.map((item) => item.label)).toEqual(["For you", "Working on", "Plans", "Done", "Muted"]);
  });
});
