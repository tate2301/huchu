import { describe, expect, it } from "vitest";

import { Funnel } from "@/lib/icons";
import { navSections } from "@/lib/navigation";

import { areasFromSections } from "./areas";
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
      "Projects",
      "Finance",
      "Billing",
      "Work",
      "Automation",
      "CRM setup",
      "Insights",
    ]);

    const rows = (label: string) => {
      const area = areas.find((a) => a.label === label)!;
      return orderRows(area.items, {
        label: (item) => item.label,
        rank: (item) => item.rank,
        alphabetical: area.ranked,
      }).map((item) => item.label);
    };
    expect(rows("Pipeline")).toEqual(["Leads", "Deals", "Companies", "People", "Sites", "Team"]);
    expect(rows("Work")).toEqual(["Site visits", "My overview", "Follow-ups", "Intake forms", "Tasks"]);
    expect(rows("Finance")).toEqual(["Overview", "Requisitions", "Cost tracker", "Daily reports"]);
    expect(rows("Billing")).toEqual(["Quotes", "Invoices", "Receipts", "Collections"]);
  });
});
