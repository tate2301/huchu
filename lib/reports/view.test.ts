import { describe, expect, it } from "vitest";

import type { ReportColumn, ReportRow, ReportView } from "./types";
import { aggregate, applyView, decodeView, defaultView, encodeView, fitView, rowsWithin } from "./view";

const COLUMNS: ReportColumn[] = [
  { key: "name", label: "Name", kind: "text" },
  { key: "stage", label: "Stage", kind: "status" },
  { key: "value", label: "Value", kind: "money", total: "sum" },
  { key: "closes", label: "Closes", kind: "date" },
  { key: "notes", label: "Notes", kind: "text", hidden: true },
];

const ROWS: ReportRow[] = [
  { id: "1", name: "Logo mats", stage: "Won", value: 1200, closes: "2026-09-02", notes: "repeat" },
  { id: "2", name: "Entrance", stage: "Open", value: 800.5, closes: "2026-10-01", notes: null },
  { id: "3", name: "Warehouse", stage: "Won", value: 300, closes: null, notes: "urgent" },
  { id: "4", name: "Clinic", stage: null, value: null, closes: "2026-09-15", notes: null },
];

const base = (): ReportView => defaultView({ columns: COLUMNS, defaults: {} });

describe("defaultView", () => {
  it("shows every column but the ones folded away, and totals what the source asks", () => {
    const view = base();
    expect(view.columns.filter((c) => !c.hidden).map((c) => c.key)).toEqual(["name", "stage", "value", "closes"]);
    expect(view.totals).toEqual({ value: "sum" });
  });
});

describe("applyView", () => {
  it("totals the rows it shows", () => {
    const result = applyView(ROWS, COLUMNS, base());
    expect(result.rows).toHaveLength(4);
    expect(result.totals.value).toBe(2300.5);
    expect(result.columns.map((c) => c.key)).not.toContain("notes");
  });

  it("filters by conditions, and totals only what is left", () => {
    const view = { ...base(), conditions: [{ column: "stage", op: "is" as const, value: ["won"] }] };
    const result = applyView(ROWS, COLUMNS, view);
    expect(result.rows.map((r) => r.id)).toEqual(["1", "3"]);
    expect(result.totals.value).toBe(1500);
  });

  it("reads numbers and dates as numbers and dates", () => {
    const over = applyView(ROWS, COLUMNS, { ...base(), conditions: [{ column: "value", op: "gt", value: "500" }] });
    expect(over.rows.map((r) => r.id)).toEqual(["1", "2"]);
    const september = applyView(ROWS, COLUMNS, {
      ...base(),
      conditions: [{ column: "closes", op: "between", value: ["2026-09-01", "2026-09-30"] }],
    });
    expect(september.rows.map((r) => r.id)).toEqual(["1", "4"]);
  });

  it("finds blanks, and never matches a blank to a bound", () => {
    const blank = applyView(ROWS, COLUMNS, { ...base(), conditions: [{ column: "closes", op: "empty" }] });
    expect(blank.rows.map((r) => r.id)).toEqual(["3"]);
    const low = applyView(ROWS, COLUMNS, { ...base(), conditions: [{ column: "value", op: "lt", value: "1000" }] });
    expect(low.rows.map((r) => r.id)).toEqual(["2", "3"]);
  });

  it("searches what is on screen and not what is hidden", () => {
    expect(applyView(ROWS, COLUMNS, { ...base(), search: "ware" }).rows.map((r) => r.id)).toEqual(["3"]);
    expect(applyView(ROWS, COLUMNS, { ...base(), search: "urgent" }).rows).toHaveLength(0);
  });

  it("sorts figures as figures and keeps blanks last either way", () => {
    const asc = applyView(ROWS, COLUMNS, { ...base(), sort: [{ column: "value", dir: "asc" }] });
    expect(asc.rows.map((r) => r.id)).toEqual(["3", "2", "1", "4"]);
    const desc = applyView(ROWS, COLUMNS, { ...base(), sort: [{ column: "value", dir: "desc" }] });
    expect(desc.rows.map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("groups in sorted order, with a blank group and totals per group", () => {
    const result = applyView(ROWS, COLUMNS, { ...base(), groupBy: "stage", sort: [{ column: "name", dir: "asc" }] });
    expect(result.groups?.map((g) => [g.value, g.rows.length, g.totals.value])).toEqual([
      [null, 1, null],
      ["Open", 1, 800.5],
      ["Won", 2, 1500],
    ]);
  });

  it("shows columns in the view's order", () => {
    const view = fitView(
      { ...base(), columns: [{ key: "value", hidden: false }, { key: "name", hidden: false }] },
      COLUMNS,
    );
    expect(applyView(ROWS, COLUMNS, view).columns.map((c) => c.key)).toEqual(["value", "name", "stage", "closes"]);
  });
});

describe("fitView", () => {
  it("drops what a source no longer has and adds what it has gained", () => {
    const stale: ReportView = {
      columns: [{ key: "gone", hidden: false }, { key: "stage", hidden: true }],
      conditions: [{ column: "gone", op: "empty" }],
      search: "",
      sort: [{ column: "gone", dir: "asc" }],
      groupBy: "gone",
      totals: { gone: "sum", name: "sum", value: "avg" },
    };
    const fitted = fitView(stale, COLUMNS);
    expect(fitted.columns.map((c) => c.key)).toEqual(["stage", "name", "value", "closes", "notes"]);
    expect(fitted.columns[0]!.hidden).toBe(true);
    expect(fitted.conditions).toEqual([]);
    expect(fitted.sort).toEqual([]);
    expect(fitted.groupBy).toBeNull();
    // A sum of names means nothing; an average of values does.
    expect(fitted.totals).toEqual({ value: "avg" });
  });
});

describe("aggregate", () => {
  it("counts values rather than rows, and reads the earliest date", () => {
    const closes = COLUMNS[3]!;
    expect(aggregate(ROWS, closes, "count")).toBe(3);
    expect(aggregate(ROWS, closes, "min")).toBe("2026-09-02");
    expect(aggregate(ROWS, COLUMNS[1]!, "distinct")).toBe(2);
    expect(aggregate(ROWS, COLUMNS[2]!, "avg")).toBe(766.8333);
  });
});

describe("encodeView", () => {
  it("round-trips, including text outside ASCII", () => {
    const view = { ...base(), search: "Zimbabwe — Harare", groupBy: "stage" };
    expect(decodeView(encodeView(view))).toEqual(view);
  });

  it("refuses what is not a view", () => {
    expect(decodeView("not-a-view")).toBeNull();
    expect(decodeView(null)).toBeNull();
  });
});

describe("rowsWithin", () => {
  it("spends one limit across groups in order, and gives folded groups nothing", () => {
    const grouped = applyView(ROWS, COLUMNS, { ...base(), groupBy: "stage", sort: [{ column: "name", dir: "asc" }] });
    expect(rowsWithin(grouped, 2).map((rows) => rows.map((row) => row.id))).toEqual([["4"], ["2"], []]);
    expect(rowsWithin(grouped, 10, (group) => group.value === "Open").map((rows) => rows.length)).toEqual([1, 0, 2]);
  });

  it("takes from the flat list when ungrouped", () => {
    expect(rowsWithin(applyView(ROWS, COLUMNS, base()), 3)).toHaveLength(1);
    expect(rowsWithin(applyView(ROWS, COLUMNS, base()), 3)[0]).toHaveLength(3);
  });
});
