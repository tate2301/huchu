import { describe, expect, it } from "vitest";

import { navSections } from "@/lib/navigation";
import { getRailModel } from "@/lib/rail/model";
import { getWorkspaceSidebarModel } from "@/lib/workspaces";

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
