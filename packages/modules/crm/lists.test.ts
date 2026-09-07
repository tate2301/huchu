import { describe, expect, it } from "vitest";

import { listIdFilter } from "./lists";
import { allowedViewTypes, builtInViews, VIEW_ENTITIES, VIEW_ENTITY_KEYS } from "./views-registry";

describe("listIdFilter", () => {
  it("narrows to the list's members", () => {
    expect(listIdFilter(["a", "b"])).toEqual({ id: { in: ["a", "b"] } });
  });

  it("matches nothing for an empty list rather than everything", () => {
    // Ignoring the filter would show the whole table, which reads as though
    // the filter had failed rather than as an empty list.
    expect(listIdFilter([])).toEqual({ id: { in: [] } });
  });

  it("applies no filter when there is no list", () => {
    expect(listIdFilter(null)).toBeUndefined();
  });
});

describe("allowedViewTypes", () => {
  it("offers a board for every record type", () => {
    // People, companies and sites grew boards on their own list pages; the
    // registry kept saying they had none, so a saved view of people had no
    // kanban option while the page behind it had a board toggle.
    for (const entity of VIEW_ENTITY_KEYS) {
      expect(allowedViewTypes(entity)).toContain("BOARD");
    }
  });

  it("offers a calendar only where there is a date to put on one", () => {
    expect(allowedViewTypes("DEAL")).toContain("CALENDAR");
    expect(allowedViewTypes("PERSON")).not.toContain("CALENDAR");
  });

  it("always offers a table", () => {
    for (const entity of VIEW_ENTITY_KEYS) {
      expect(allowedViewTypes(entity)).toContain("TABLE");
    }
  });

  it("offers a calendar only where dates drive the record", () => {
    expect(allowedViewTypes("DEAL")).toContain("CALENDAR");
    expect(allowedViewTypes("SITE")).not.toContain("CALENDAR");
  });
});

describe("VIEW_ENTITIES", () => {
  it("gives every record type a route and a label", () => {
    for (const entity of VIEW_ENTITY_KEYS) {
      const capability = VIEW_ENTITIES[entity];
      expect(capability.href.startsWith("/crm/")).toBe(true);
      expect(capability.label.length).toBeGreaterThan(0);
      expect(capability.plural.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate column keys within a record type", () => {
    for (const entity of VIEW_ENTITY_KEYS) {
      const keys = VIEW_ENTITIES[entity].columns.map((column) => column.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe("builtInViews", () => {
  it("gives leads an open-pipeline and a needs-attention view", () => {
    const keys = builtInViews("LEAD").map((view) => view.key);
    expect(keys).toContain("open");
    expect(keys).toContain("overdue");
  });

  it("splits deals by outcome", () => {
    const keys = builtInViews("DEAL").map((view) => view.key);
    expect(keys).toEqual(expect.arrayContaining(["open", "won", "lost"]));
  });

  it("omits owner-based views for sites, which have no owner", () => {
    const keys = builtInViews("SITE").map((view) => view.key);
    expect(keys).toEqual(["all"]);
  });

  it("gives every view a distinct key", () => {
    for (const entity of VIEW_ENTITY_KEYS) {
      const keys = builtInViews(entity).map((view) => view.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
