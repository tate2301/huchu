import { describe, expect, it } from "vitest";

import { fieldListSchema } from "@/lib/forms/fields";
import { getCatalogFeatureKeys } from "@/lib/platform/gating/catalog-utils";

import { reportCatalog } from "./catalog";
import { reportFeatureKey } from "./access";
import { REPORT_DEFINITIONS } from "./registry";
import { unpairedReportKeys } from "./server";

describe("the report registry", () => {
  it("pairs every definition with a loader and every loader with a definition", () => {
    expect(unpairedReportKeys(REPORT_DEFINITIONS)).toEqual([]);
  });

  it("gives every report its own key", () => {
    const keys = REPORT_DEFINITIONS.map((definition) => definition.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(REPORT_DEFINITIONS.map((definition) => [definition.key, definition] as const))(
    "%s is well formed",
    (_, definition) => {
      const columns = new Set(definition.columns.map((column) => column.key));
      expect(columns.size).toBe(definition.columns.length);
      // Something to show before anybody changes the view.
      expect(definition.columns.some((column) => !column.hidden)).toBe(true);
      for (const rule of definition.defaults.sort ?? []) expect(columns).toContain(rule.column);
      if (definition.defaults.groupBy) expect(columns).toContain(definition.defaults.groupBy);
      // Anyone who can open it is governed by some feature.
      expect(reportFeatureKey(definition)).not.toBeNull();
      for (const action of definition.rowActions ?? []) {
        if (action.kind === "edit") {
          expect(fieldListSchema.safeParse(action.fields).success).toBe(true);
          for (const field of action.fields) expect(action.values[field.key]).toBeDefined();
        }
      }
    },
  );
});

describe("reportCatalog", () => {
  // Every feature there is, dependencies included.
  const everything = getCatalogFeatureKeys();
  const crmOnly = everything.filter((key) => key.startsWith("crm.") || key.startsWith("core."));

  it("lists only what the workspace was provisioned with", () => {
    const areas = reportCatalog(REPORT_DEFINITIONS, { role: "MANAGER", enabledFeatures: crmOnly }, "GENERAL");
    const keys = areas.flatMap((area) => area.reports.map((report) => report.key));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => key.startsWith("crm-"))).toBe(true);
  });

  it("puts the workspace's own industry first", () => {
    const mine = reportCatalog(REPORT_DEFINITIONS, { role: "MANAGER", enabledFeatures: everything }, "GOLD_MINE");
    expect(mine[0]!.area).toBe("Production");
    const school = reportCatalog(REPORT_DEFINITIONS, { role: "MANAGER", enabledFeatures: everything }, "SCHOOLS");
    expect(school[0]!.area).toBe("Fees");
  });

  it("keeps manager reports from other roles", () => {
    const clerk = reportCatalog(REPORT_DEFINITIONS, { role: "CLERK", enabledFeatures: everything }, "GOLD_MINE");
    const keys = clerk.flatMap((area) => area.reports.map((report) => report.key));
    expect(keys).toContain("shift");
    expect(keys).not.toContain("downtime");
    expect(keys).not.toContain("compliance-incidents");
  });

  it("gives a role pinned to the CRM nothing outside it", () => {
    const rep = reportCatalog(REPORT_DEFINITIONS, { role: "SALES_REP", enabledFeatures: everything }, "GENERAL");
    const keys = rep.flatMap((area) => area.reports.map((report) => report.key));
    expect(keys.every((key) => key.startsWith("crm-"))).toBe(true);
  });
});
