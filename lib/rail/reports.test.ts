import { describe, expect, it } from "vitest";

import { Funnel } from "@/lib/icons";

import type { RailArea } from "./areas";
import { areaForPage, moduleReportHref, readModuleReportPath, reportsForArea, type PanelReport } from "./reports";

const area = (id: string, hrefs: string[]): RailArea => ({
  id,
  label: id,
  icon: Funnel,
  items: hrefs.map((href) => ({ href, label: href, icon: Funnel })),
});

const areas = [
  area("pipeline", ["/crm/leads", "/crm/deals"]),
  area("work", ["/crm/appointments"]),
  area("accounting", ["/books", "/books/invoices", "/books/financials"]),
  area("reporting", ["/reports"]),
];

const report = (key: string, about: string[]): PanelReport => ({ key, title: key, href: `/reports/${key}`, about });

describe("Reports from <module>", () => {
  it("files a report under the module whose row holds the page it is about", () => {
    expect(areaForPage(areas, "/crm/deals/{id}")?.id).toBe("pipeline");
    expect(areaForPage(areas, "/books/invoices?view=overdue")?.id).toBe("accounting");
    expect(areaForPage(areas, "/books/financials")?.id).toBe("accounting");
    expect(areaForPage(areas, "/retail/sales")).toBeNull();
  });

  it("lists a module's reports in the order given, a report on several modules under its first", () => {
    const reports = [
      report("crm-deals", ["/crm/deals"]),
      report("crm-visits", ["/crm/appointments"]),
      report("money-owed", ["/books/invoices", "/crm/deals"]),
      report("deals-by-visit", ["/crm/deals", "/crm/appointments"]),
    ];
    expect(reportsForArea(reports, areas, "pipeline").map((r) => r.key)).toEqual(["crm-deals", "deals-by-visit"]);
    expect(reportsForArea(reports, areas, "accounting").map((r) => r.key)).toEqual(["money-owed"]);
  });

  it("lists none for a module with none, and none in Reports' own panel", () => {
    expect(reportsForArea([report("crm-deals", ["/crm/deals"])], areas, "accounting")).toEqual([]);
    expect(reportsForArea([report("shift", ["/reports/shift"])], areas, "reporting")).toEqual([]);
  });
});

describe("a report's module address", () => {
  const deals = { key: "crm-deals", title: "Deals", href: "/reports/crm-deals", about: ["/crm/deals/{id}"] };
  const built = { key: "built-books-aging", title: "Ageing", href: "/reports/built/books-aging", about: ["/books/invoices"] };
  const gold = { key: "gold-chain", title: "Gold", href: "/reports/gold-chain", about: ["/reports/gold-chain"] };

  it("opens a module's report at the module's address, and Reports' own at Reports'", () => {
    expect(moduleReportHref(deals)).toBe("/crm/reports/crm-deals");
    expect(moduleReportHref(built)).toBe("/books/reports/built/books-aging");
    expect(moduleReportHref(gold)).toBe("/reports/gold-chain");
  });

  it("reads the address back to the report the panel lists", () => {
    expect(readModuleReportPath("/crm/reports/crm-deals")).toEqual({ scope: "crm", key: "crm-deals" });
    expect(readModuleReportPath("/books/reports/built/books-aging")).toEqual({ scope: "books", key: "built-books-aging" });
    expect(readModuleReportPath("/reports/crm-deals")).toBeNull();
    expect(readModuleReportPath("/retail/reports/sales")).toBeNull();
    expect(readModuleReportPath("/retail/reports/built/retail-reorder")).toEqual({ scope: "retail", key: "built-retail-reorder" });
    expect(readModuleReportPath("/crm/deals")).toBeNull();
  });
});
