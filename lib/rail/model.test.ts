import { describe, expect, it } from "vitest";

import { ChartBar, FileText, Stack, Storefront, Tag, TrayArrowDown, Wrench } from "@/lib/icons";
import { getClientTemplateFeatureKeys, getClientTemplateWorkspaceProfile } from "@/lib/platform/client-templates";
import type { WorkspaceNavSection } from "@/lib/workspaces";
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

describe("the retail rail (00-foundations 5.3.2, 98-decisions 5 October)", () => {
  it("draws a mark per module for the owner, Setup last and no Management module", () => {
    const rail = retailRail("SUPERADMIN");
    expect(rail.shape).toBe("areas");
    expect(rail.areas.map((area) => area.label)).toEqual([
      "The floor",
      "Products",
      "Stock",
      "Buying",
      "Insights",
      "Reports",
      "Setup",
    ]);
    expect(rail.areas.find((area) => area.id === "retail-setup")?.items.map((item) => item.label)).toEqual([
      "Shop",
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

  it("gives the cashier no Setup, no Stock and no Insights", () => {
    const rail = retailRail("CASHIER");
    expect(rail.areas.map((area) => area.label)).toEqual(["The floor", "Products", "Buying"]);
  });

  it("leaves Posting to the books out of the manager's Setup (5.3.4: M column blank)", () => {
    const setup = retailRail("MANAGER").areas.find((area) => area.id === "retail-setup");
    expect(setup?.items.map((item) => item.label)).toEqual([
      "Shop",
      "Tills and devices",
      "Till rules",
      "Fiscal device",
      "Bin",
    ]);
  });

  it("draws each module's mark from its registry file", () => {
    expect(retailRail("SUPERADMIN").areas.map((area) => area.icon)).toEqual([
      Storefront,
      Tag,
      Stack,
      TrayArrowDown,
      ChartBar,
      FileText,
      Wrench,
    ]);
  });

  it("finds the module a page belongs to", () => {
    const { areas } = retailRail("SUPERADMIN");
    expect(areaForHref(areas, "/retail/shifts")?.label).toBe("The floor");
    expect(areaForHref(areas, "/retail/manage/tills")?.label).toBe("Setup");
    expect(areaForHref(areas, null)).toBeNull();
  });

  it("leaves room for pins beside the marks", () => {
    expect(retailRail("SUPERADMIN").pinCapacity).toBeGreaterThan(0);
  });
});

describe("the rail's shape", () => {
  const section = (id: string, count: number): WorkspaceNavSection => ({
    id,
    title: id,
    items: Array.from({ length: count }, (_, index) => ({
      href: `/${id}/${index}`,
      label: `${id} ${index}`,
      icon: Tag,
    })),
  });

  it("draws a small workspace flat, with every pin slot free", () => {
    const rail = getRailModel([section("alpha", 3), section("beta", 2)]);
    expect(rail.shape).toBe("flat");
    expect(rail.pinCapacity).toBe(6);
  });

  it("draws a big one as a module list and one module at a time", () => {
    const rail = getRailModel([section("alpha", 8), section("beta", 8), section("gamma", 8)]);
    expect(rail.shape).toBe("areas");
    expect(rail.cost).toBeGreaterThan(rail.budget);
  });

  it("draws the gold, schools and CRM workspaces with their modules", () => {
    for (const template of ["TEMPLATE_GOLD_MINE", "TEMPLATE_SCHOOLS", "TEMPLATE_CRM"]) {
      const model = getWorkspaceSidebarModel({
        role: "SUPERADMIN",
        enabledFeatures: getClientTemplateFeatureKeys(template),
        workspaceProfile: getClientTemplateWorkspaceProfile(template),
      });
      const rail = getRailModel(model.sections);
      expect(rail.areas.length, template).toBeGreaterThan(0);
      expect(model.supportItems.map((item) => item.href), template).toContain("/help");
    }
  });
});
