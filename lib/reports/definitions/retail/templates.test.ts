/**
 * The built-in Reports templates read only sources that exist, through their
 * report faces, and name only what those faces have. A template on a source
 * still to be built cannot be added ahead of it: its source would not be here.
 */
import { describe, expect, it } from "vitest";

import { REPORT_AREAS } from "@/lib/reports/areas";
import { reportCatalog } from "@/lib/reports/catalog";
import { REPORT_DEFINITIONS } from "@/lib/reports/registry";
import { getReport } from "@/lib/reports/server";
import { UNROLLED } from "@/lib/reports/rollup";

import { RETAIL_BUILT_INS } from "./templates";

describe("the built-in templates", () => {
  it("read exactly the sources built so far", () => {
    expect([...new Set(RETAIL_BUILT_INS.map((template) => template.source))].sort()).toEqual([
      "retail-items-sold",
      "retail-payments",
      "retail-shifts",
      "retail-stock-movements",
      "retail-stock-on-hand",
    ]);
  });

  it.each(RETAIL_BUILT_INS.map((template) => [template.slug, template] as const))(
    "%s reads a registered source's report face and names only what it has",
    (_slug, template) => {
      const report = getReport(template.source);
      expect(report, template.source).not.toBeNull();
      const face = report!.definition.report;
      expect(face, `${template.source} has a report face`).toBeDefined();
      expect(face!.area).toBe(template.area);

      const columns = new Set(face!.columns.map((column) => column.key));
      const filters = new Set(face!.filters.map((filter) => filter.key));
      const rollups = new Set(face!.rollups.map((rollup) => rollup.key).filter((key) => key !== UNROLLED));
      const { query } = template;
      for (const key of query.cols ?? []) expect(columns, key).toContain(key);
      for (const key of Object.keys(query.filters)) expect(filters, key).toContain(key);
      for (const key of query.rows ?? []) expect(rollups, key).toContain(key);
      if (query.sort) expect(face!.sorts.map((sort) => sort.key)).toContain(query.sort);
      if (query.group) expect(face!.groups).toContain(query.group);
      // A rolled-up template shows its count column only rolled up.
      if (face!.rollupOnly) expect(columns).toContain(face!.rollupOnly);
    },
  );

  it("have one slug each", () => {
    const slugs = RETAIL_BUILT_INS.map((template) => template.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("belong to the Reports areas", () => {
    const areas = new Set(REPORT_AREAS.map((area) => area.slug));
    for (const template of RETAIL_BUILT_INS) expect(areas).toContain(template.area);
    expect(REPORT_AREAS.map((area) => area.label)).toEqual(["Selling", "Stock", "Buying", "Customers", "Money", "The floor"]);
  });

  it("are Reports' own: the generic catalogue lists no retail source", () => {
    const catalogue = reportCatalog(REPORT_DEFINITIONS, { role: "SUPERADMIN", enabledFeatures: ["retail.core", "retail.pos", "retail.shifts"] }, "RETAIL");
    expect(catalogue.flatMap((area) => area.reports.map((report) => report.key)).filter((key) => key.startsWith("retail-"))).toEqual([]);
  });
});
