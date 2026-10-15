import { describe, expect, it } from "vitest";

import { navSections } from "@/lib/navigation";
import {
  CLIENT_BUNDLE_TEMPLATES,
  getClientTemplateDisabledFeatureKeys,
  getClientTemplateFeatureKeys,
} from "@/lib/platform/client-templates";
import { areasFromSections } from "@/lib/rail/areas";
import { getRailModel } from "@/lib/rail/model";
import { getWorkspaceOptions, getWorkspaceProfileForTemplate, getWorkspaceSidebarModel } from "@/lib/workspaces";

const books = navSections.find((section) => section.id === "accounting")!;

describe("Books' panel (design/core-modules, BooksInvoices and PageBooksJournals)", () => {
  it("lists the board's rows, then the ledger, then every other accounting page under More", () => {
    const rows = (group?: string) => books.items.filter((item) => item.group === group).map((item) => item.label);
    expect(rows(undefined)).toEqual(["Money", "Invoices", "Payments", "Takings", "Expenses", "Bank", "VAT"]);
    expect(rows("ledger")).toEqual(["Journals", "Periods", "Chart of accounts"]);
    expect(rows("more")).toEqual([
      "Receivables",
      "Payables",
      "Financial reports",
      "Trial balance",
      "Receivables report",
      "Payables report",
      "Posting rules",
      "Fiscalisation",
    ]);
    expect(books.groups?.find((group) => group.id === "more")?.trailing).toBe(true);
  });

  it("puts Journals, VAT returns and Periods at the addresses the boards name", () => {
    const hrefs = books.items.map((item) => item.href);
    expect(hrefs).toEqual(expect.arrayContaining(["/books/journals", "/books/vat", "/books/periods"]));
    expect(hrefs.some((href) => /^\/accounting\/(journals|tax|periods)$/.test(href))).toBe(false);
  });

  it("reaches the rail as one module with its bands, each page behind its own feature", () => {
    const features = ["accounting.core", "accounting.ar", "accounting.banking", "accounting.journals", "accounting.periods", "accounting.tax"];
    const model = getWorkspaceSidebarModel({ role: "SUPERADMIN", enabledFeatures: features, workspaceProfile: "GENERAL" });
    const area = getRailModel(model.sections).areas.find((candidate) => candidate.label === "Books");
    expect(area?.bands?.map((band) => band.label)).toEqual(["Ledger", "More"]);
    const labels = area?.items.map((item) => item.label) ?? [];
    expect(labels).toEqual(expect.arrayContaining(["Money", "Invoices", "Payments", "Bank", "VAT", "Journals", "Periods"]));
    // Takings needs the tills; Expenses needs Payables.
    expect(labels).not.toContain("Takings");
    expect(labels).not.toContain("Expenses");
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
