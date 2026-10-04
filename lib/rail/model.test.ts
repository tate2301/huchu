import { describe, expect, it } from "vitest";

import { Funnel } from "@/lib/icons";
import type { NavItem } from "@/lib/navigation";
import type { WorkspaceNavSection } from "@/lib/workspaces";

import { getRailModel } from "./model";

const rows = (prefix: string, count: number, group?: string): NavItem[] =>
  Array.from({ length: count }, (_, index) => ({
    href: `/${prefix}/${index}`,
    label: `${prefix} ${index}`,
    icon: Funnel,
    ...(group ? { group } : {}),
  }));

describe("getRailModel", () => {
  it("keeps a destination of its own as a loose row, not a mark", () => {
    const model = getRailModel([
      { id: "home", title: "Home", items: rows("home", 1) },
      { id: "work", title: "Work", items: rows("work", 3) },
    ]);
    expect(model.loose.map((item) => item.href)).toEqual(["/home/0"]);
    expect(model.areas.map((area) => area.id)).toEqual(["work"]);
  });

  it("reads modules whole past ten areas, with their groups as folders that fit", () => {
    const groups = Array.from({ length: 7 }, (_, index) => ({ id: `g${index}`, label: `Group ${index}` }));
    const crm: WorkspaceNavSection = {
      id: "crm",
      title: "CRM",
      flattenGroups: true,
      groups,
      items: [...rows("crm-home", 1), ...groups.flatMap((group) => rows(group.id, 4, group.id))],
    };
    const others: WorkspaceNavSection[] = Array.from({ length: 5 }, (_, index) => ({
      id: `module-${index}`,
      title: `Module ${index}`,
      items: rows(`module-${index}`, 3),
    }));

    const model = getRailModel([crm, ...others]);
    const area = model.areas.find((candidate) => candidate.id === "crm")!;
    expect(model.areas).toHaveLength(6);
    expect(area.items).toHaveLength(29);
    expect(area.folders).toHaveLength(7);
    // Twenty-nine destinations, but the panel draws one row and seven folders.
    expect(model.overflowing).toEqual([]);
  });

  it("reports a folder too long for the panel", () => {
    const model = getRailModel([
      {
        id: "big",
        title: "Big",
        groups: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        items: [...rows("a", 20, "a"), ...rows("b", 2, "b")],
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `module-${index}`,
        title: `Module ${index}`,
        items: rows(`module-${index}`, 2),
      })),
    ]);
    expect(model.overflowing.map((area) => area.id)).toEqual(["big"]);
  });
});
