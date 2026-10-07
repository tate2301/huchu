import { describe, expect, it } from "vitest";

import { Funnel } from "@/lib/icons";
import { navSections } from "@/lib/navigation";

import { areaRows, areasFromSections, folderForHref } from "./areas";
import { orderRows } from "./order";

describe("areasFromSections", () => {
  it("orders a ranked section's areas: flow as declared, then own, then A to Z", () => {
    const areas = areasFromSections([
      {
        id: "sales",
        title: "Sales",
        flattenGroups: true,
        ranked: true,
        groups: [
          { id: "setup", label: "Setup" },
          { id: "mine", label: "Mine", rank: "own" },
          { id: "pipeline", label: "Pipeline", rank: "flow" },
          { id: "billing", label: "Billing", rank: "flow" },
          { id: "automation", label: "Automation" },
        ],
        items: ["setup", "mine", "pipeline", "billing", "automation"].map((group) => ({
          href: `/sales/${group}`,
          label: group,
          icon: Funnel,
          group,
        })),
      },
    ]);
    expect(areas.map((area) => area.label)).toEqual([
      "Pipeline",
      "Billing",
      "Mine",
      "Automation",
      "Setup",
    ]);
    expect(areas.every((area) => area.ranked)).toBe(true);
  });

  it("leaves an unranked section in its declared order", () => {
    const areas = areasFromSections([
      {
        id: "plant",
        title: "Plant",
        flattenGroups: true,
        groups: [
          { id: "b", label: "Zinc" },
          { id: "a", label: "Assays" },
        ],
        items: ["b", "a"].map((group) => ({ href: `/plant/${group}`, label: group, icon: Funnel, group })),
      },
    ]);
    expect(areas.map((area) => area.label)).toEqual(["Zinc", "Assays"]);
  });

  it("reads the CRM as its work moves, then the person's own, then the rest", () => {
    const crm = navSections.find((section) => section.id === "crm")!;
    const areas = areasFromSections([crm]).filter((area) => area.items.length > 1);
    expect(areas.map((area) => area.label)).toEqual([
      "Pipeline",
      "Contacts",
      "Projects",
      "Money",
      "Work",
      "Insights",
      "Setup",
    ]);

    const rows = (label: string) => {
      const area = areas.find((a) => a.label === label)!;
      return orderRows(area.items, {
        label: (item) => item.label,
        rank: (item) => item.rank,
        alphabetical: area.ranked,
      }).map((item) => item.label);
    };
    expect(rows("Pipeline")).toEqual(["Leads", "Deals", "Intake forms"]);
    expect(rows("Contacts")).toEqual(["Companies", "People", "Sites"]);
    expect(rows("Work")).toEqual(["Site visits", "Follow-ups", "Tasks"]);
    // The index heads the group, then billing, then spending.
    expect(rows("Money")).toEqual([
      "Money in and out",
      "Quotes",
      "Invoices",
      "Receipts",
      "Collections",
      "Requisitions",
      "Cost tracker",
      "Daily reports",
    ]);
    expect(rows("Insights")).toEqual(["My performance", "Insights", "Sales reports", "Team"]);
    // Workflow activity and the site-visit questions live on their index pages.
    expect(rows("Setup")).toEqual(["Build", "Import", "Settings", "Workflows"]);
  });

  it("keeps the CRM's Home out of every area", () => {
    const crm = navSections.find((section) => section.id === "crm")!;
    const home = areasFromSections([crm]).find((area) => area.items.some((item) => item.href === "/crm"))!;
    expect(home.items.map((item) => item.label)).toEqual(["Home"]);
  });
});

describe("a section read whole", () => {
  const section = {
    id: "sales",
    title: "Sales",
    flattenGroups: true,
    ranked: true,
    groups: [
      { id: "setup", label: "Setup" },
      { id: "pipeline", label: "Pipeline", rank: "flow" as const },
    ],
    items: [
      { href: "/sales", label: "Home", icon: Funnel },
      { href: "/sales/settings", label: "Settings", icon: Funnel, group: "setup" },
      { href: "/sales/leads", label: "Leads", icon: Funnel, group: "pipeline" },
      { href: "/sales/deals", label: "Deals", icon: Funnel, group: "pipeline" },
    ],
  };

  it("keeps its groups one level down, as folders", () => {
    const [area] = areasFromSections([section], { flatten: false });
    expect(area.items).toHaveLength(4);
    expect(area.folders?.map((folder) => folder.label)).toEqual(["Pipeline", "Setup"]);
    expect(areaRows(area).map((item) => item.label)).toEqual(["Home"]);
    expect(folderForHref(area, "/sales/deals")?.label).toBe("Pipeline");
    expect(folderForHref(area, "/sales")).toBeNull();
  });

  it("has no folders when it is flattened into areas", () => {
    const areas = areasFromSections([section]);
    expect(areas.every((area) => area.folders === undefined)).toBe(true);
    expect(areaRows(areas[0]!)).toBe(areas[0]!.items);
  });

  it("has no folders when it has one group", () => {
    const [area] = areasFromSections(
      [{ ...section, groups: [section.groups[1]!], items: section.items.filter((item) => item.group !== "setup") }],
      { flatten: false },
    );
    expect(area.folders).toBeUndefined();
  });
});
