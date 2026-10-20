import { describe, expect, it } from "vitest";

import { navSections } from "@/lib/navigation";
import {
  CLIENT_BUNDLE_TEMPLATES,
  getClientTemplateDisabledFeatureKeys,
  getClientTemplateFeatureKeys,
} from "@/lib/platform/client-templates";
import { composeNav } from "@/lib/nav/compose";
import { canOpenFor, productGroupsFor, visibleAddresses } from "@/lib/nav/gate";
import { getWorkspaceProfileForTemplate, getWorkspaceSidebarModel } from "@/lib/workspaces";

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
    expect(level("books-bank")).toEqual(["Accounts", "To match", "Reconciliations", "Takings"]);
    expect(level("books-tax")).toEqual(["What's due", "VAT returns", "Withholding", "Provisional tax", "Fiscal register"]);
    expect(level("books-close")).toEqual(["Checklist", "Needs posting", "Rates & revaluation", "Year end"]);
    expect(level("books-ledger")).toEqual([
      "Journals",
      "Trial balance",
      "Financial statements",
      "General ledger",
      "Chart of accounts",
      "Cost centres",
      "Posting rules",
      "Audit trail",
    ]);
    expect(level("books-settings")).toEqual(["Tax codes & rules", "Numbering", "Locks & periods", "Opening balances", "Set up the books"]);
    const settings = books.groups?.find((group) => group.id === "books-settings");
    expect(settings?.links?.label).toBe("In Management");
    expect(settings?.links?.items.map((item) => item.label)).toEqual(["Business & tax details", "Money accounts", "Approvals & limits", "Fiscal device"]);
  });

  it("puts every Sales and Bills & spending row at its Books address, and Needs posting under Close the month", () => {
    for (const item of books.items.filter((row) => row.group === "books-sales" || row.group === "books-spending")) expect(item.href).toMatch(/^\/books\//);
    expect(books.items.find((item) => item.label === "Needs posting")?.group).toBe("books-close");
    const hrefs = books.items.map((item) => item.href);
    expect(hrefs).toEqual(expect.arrayContaining(["/books/journals", "/books/vat", "/books/periods"]));
    expect(hrefs.some((href) => href.startsWith("/accounting"))).toBe(false);
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

  it("reaches the sidebar as one group, each page behind its own feature", () => {
    const features = ["accounting.core", "accounting.ar", "accounting.banking", "accounting.journals", "accounting.periods", "accounting.tax"];
    const who = { role: "SUPERADMIN", enabledFeatures: features, workspaceProfile: "GENERAL" };
    const books = composeNav({ canOpen: canOpenFor(who), products: productGroupsFor(visibleAddresses(who), "GENERAL") }).find((group) => group.id === "books");
    const labels = books?.items.flatMap((item) => [item.label, ...item.kids.map((kid) => kid.label)]) ?? [];
    expect(books?.items.map((item) => item.id)).toEqual(expect.arrayContaining(["money", "bsales", "bbank", "btax", "bledger"]));
    expect(labels).toEqual(expect.arrayContaining(["Money", "Invoices", "To match", "VAT", "Journals"]));
    // Takings needs the tills; Expenses need Payables.
    expect(labels).not.toContain("Takings");
    expect(labels).not.toContain("Expenses");
  });

  it("keeps Ledger for the owner, a manager and the accountant (§3.2)", () => {
    const features = getClientTemplateFeatureKeys("TEMPLATE_CRM");
    const has = (role: string) => {
      const who = { role, enabledFeatures: features, workspaceProfile: "GENERAL" };
      const groups = composeNav({ canOpen: canOpenFor(who), products: productGroupsFor(visibleAddresses(who), "GENERAL") });
      return groups.some((group) => group.items.some((item) => item.id === "bledger"));
    };
    for (const role of ["SUPERADMIN", "MANAGER", "FINANCE_OFFICER"]) expect(has(role), role).toBe(true);
    for (const role of ["BURSAR", "CLERK"]) expect(has(role), role).toBe(false);
  });
});

describe("the sidebar for each template and role", () => {
  // Every template, for the roles that see the most and the least.
  const cases = CLIENT_BUNDLE_TEMPLATES.flatMap((template) => {
    const disabled = new Set(getClientTemplateDisabledFeatureKeys(template.code));
    const enabledFeatures = getClientTemplateFeatureKeys(template.code).filter((key) => !disabled.has(key));
    const workspaceProfile = getWorkspaceProfileForTemplate(template.code);
    return ["SUPERADMIN", "MANAGER", "CLERK"].map((role) => ({
      name: `${template.code} as ${role}`,
      args: { role, enabledFeatures, workspaceProfile },
    }));
  });

  it.each(cases.map((entry) => [entry.name, entry.args] as const))("%s: no page twice, no empty group, children under their page", (_, args) => {
    const groups = composeNav({ canOpen: canOpenFor(args), products: productGroupsFor(visibleAddresses(args), args.workspaceProfile) });
    const ids = groups.flatMap((group) => group.items.map((item) => item.id));
    expect(new Set(ids).size, `a page is listed twice: ${ids.join(", ")}`).toBe(ids.length);
    for (const group of groups) {
      expect(group.items.length, `${group.label} is empty`).toBeGreaterThan(0);
      for (const item of group.items) {
        const kidIds = item.kids.map((kid) => kid.id);
        expect(new Set(kidIds).size, `${item.label} lists a child twice`).toBe(kidIds.length);
        // One visible child is not a list: the page opens it instead.
        expect(item.kids.length === 1, `${item.label} has one child`).toBe(false);
      }
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
