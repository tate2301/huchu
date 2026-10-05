import { describe, expect, it } from "vitest";

import { getClientTemplateFeatureKeys } from "@/lib/platform/client-templates";
import { getWorkspaceSidebarModel } from "@/lib/workspaces";

import { areaForHref, getRailModel } from "./model";

function retailRail(role: string) {
  const model = getWorkspaceSidebarModel({
    role,
    enabledFeatures: getClientTemplateFeatureKeys("TEMPLATE_RETAIL"),
    workspaceProfile: "RETAIL",
  });
  return getRailModel(model.sections);
}

describe("the retail rail (00-foundations 5.3.2)", () => {
  it("draws six module marks and the Management gear for the owner", () => {
    const rail = retailRail("SUPERADMIN");
    expect(rail.areas.map((area) => area.label)).toEqual([
      "The floor",
      "Products",
      "Stock",
      "Buying",
      "Insights",
      "Reports",
    ]);
    expect(rail.management?.label).toBe("Management");
    expect(rail.management?.items.map((item) => item.label)).toEqual([
      "Tills and devices",
      "Till rules",
      "Fiscal device",
      "Posting to the books",
      "Bin",
    ]);
  });

  it("keeps a one-item module as a mark: Reports", () => {
    const reports = retailRail("SUPERADMIN").areas.find((area) => area.id === "retail-reports");
    expect(reports?.items.map((item) => item.href)).toEqual(["/reports"]);
  });

  it("gives the cashier no gear, no Stock and no Insights", () => {
    const rail = retailRail("CASHIER");
    expect(rail.areas.map((area) => area.label)).toEqual(["The floor", "Products", "Buying"]);
    expect(rail.management).toBeNull();
  });

  it("finds the module a page belongs to, the gear included", () => {
    const rail = retailRail("SUPERADMIN");
    expect(areaForHref(rail, "/retail/shifts")?.label).toBe("The floor");
    expect(areaForHref(rail, "/retail/manage/tills")?.label).toBe("Management");
    expect(areaForHref(rail, null)).toBeNull();
  });
});
