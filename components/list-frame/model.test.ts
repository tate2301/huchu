import { describe, expect, it } from "vitest";

import { getReportDefinition } from "@/lib/reports/registry";
import type { ListSpecPublic, ReportRow } from "@/lib/reports/types";

import {
  bulkHref,
  runEndpoint,
  bulkKeys,
  canClear,
  cellPadding,
  cellText,
  defaultFilters,
  diffTone,
  durationState,
  filterValueLabel,
  filtersOn,
  foldAt,
  gridMinWidth,
  gridTemplate,
  nextColumnSort,
  pageButtons,
  rowMatches,
  selectionTotals,
  shownColumns,
  sortLabel,
  totalText,
  trailingFigures,
} from "./model";

const source = getReportDefinition("retail-shifts")!;
const list = source.list!;
const spec = { ...list, primary: null } as unknown as ListSpecPublic;
const column = (key: string) => list.columns.find((entry) => entry.key === key)!;

const row = (values: Partial<ReportRow>): ReportRow => ({ id: "s-1", ...values }) as ReportRow;

describe("widths (5.4.4, 5.5.3)", () => {
  it("draws the Main board's grid at full width", () => {
    const columns = shownColumns(list.columns, [], 1144);
    expect(gridTemplate(columns)).toBe(
      "40px 104px minmax(132px,1fr) 96px 124px 160px 104px 64px 128px 136px 44px",
    );
    expect(gridMinWidth(columns)).toBe(1132);
  });

  it("drops Till and Duration at 1140px of table, and Opened at 940px (Narrow board)", () => {
    expect(shownColumns(list.columns, [], 1140).map((entry) => entry.key)).toEqual([
      "shiftNo",
      "cashier",
      "state",
      "openedAt",
      "sales",
      "takings",
      "variance",
    ]);
    expect(shownColumns(list.columns, [], 728).map((entry) => entry.key)).toEqual([
      "shiftNo",
      "cashier",
      "state",
      "sales",
      "takings",
      "variance",
    ]);
  });

  it("never hides the first column", () => {
    expect(shownColumns(list.columns, ["shiftNo", "till"], 1440).map((entry) => entry.key)).not.toContain("till");
    expect(shownColumns(list.columns, ["shiftNo"], 1440)[0]!.key).toBe("shiftNo");
  });

  it("folds the toolbar at 1060, 860, 720 and 640", () => {
    expect(foldAt(1144)).toEqual({ view: false, chips: false, hints: false, count: false });
    expect(foldAt(968)).toEqual({ view: true, chips: false, hints: false, count: false });
    expect(foldAt(728)).toEqual({ view: true, chips: true, hints: false, count: false });
    expect(foldAt(700)).toEqual({ view: true, chips: true, hints: true, count: false });
    expect(foldAt(600)).toEqual({ view: true, chips: true, hints: true, count: true });
  });

  it("spans group headings up to the figures, and pads the last figure 20px", () => {
    expect(trailingFigures(list.columns)).toBe(3);
    expect(cellPadding(column("variance"), true)).toBe("0 14px 0 10px");
    expect(cellPadding(column("variance"), true, false)).toBe("0 20px 0 10px");
    expect(cellPadding(column("takings"), false)).toBeUndefined();
    expect(cellPadding(column("cashier"), false)).toBeUndefined();
  });
});

describe("cells (5.4.7)", () => {
  it("prints money, signed differences and counts", () => {
    expect(cellText(column("takings"), row({ takings: 886.85 }))).toBe("US$886.85");
    expect(cellText(column("variance"), row({ variance: -7.15 }))).toBe("−US$7.15");
    expect(cellText(column("variance"), row({ variance: 3.17 }))).toBe("+US$3.17");
    expect(cellText(column("variance"), row({ variance: 0 }))).toBe("US$0.00");
    expect(cellText(column("sales"), row({ sales: 8412 }))).toBe("8,412");
    expect(cellText(column("variance"), row({ variance: null }))).toBe("—");
  });

  it("prints a percentage column as a percentage, one place (22.4%)", () => {
    const margin = { ...column("sales"), key: "marginNow", percent: true };
    expect(cellText(margin, row({ marginNow: 22.4 }))).toBe("22.4%");
    expect(cellText(margin, row({ marginNow: 29 }))).toBe("29.0%");
    expect(totalText(margin, 24.6)).toBe("24.6%");
  });

  it("prints a count with its unit word when the column names one (13 bottles)", () => {
    const onHand = { ...column("sales"), key: "onHand", unitKey: "unitWord" };
    expect(cellText(onHand, row({ onHand: 13, unitWord: "bottles" }))).toBe("13 bottles");
    expect(cellText(onHand, row({ onHand: 1200, unitWord: "cartons" }))).toBe("1,200 cartons");
    expect(cellText(onHand, row({ onHand: 4, unitWord: "" }))).toBe("4");
  });

  it("colours a difference by its sign, and only a difference", () => {
    expect(diffTone(column("variance"), -7.15)).toBe("bad");
    expect(diffTone(column("variance"), 3.17)).toBe("warn");
    expect(diffTone({ diff: "gain" }, 3.17)).toBe("ok");
    expect(diffTone(column("variance"), 0.004)).toBe("zero");
  });

  it("tells a running drawer from a stale one and a closed one", () => {
    const duration = column("durationMinutes");
    expect(durationState(duration, row({ durationMinutes: 372, running: true }))).toBe("running");
    expect(durationState(duration, row({ durationMinutes: 3170, running: true }))).toBe("stale");
    expect(durationState(duration, row({ durationMinutes: 420, running: false }))).toBe("done");
  });

  it("prints totals as the totals band does", () => {
    expect(totalText(column("variance"), -186.42)).toBe("−US$186.42");
    expect(totalText(column("takings"), 71904.35)).toBe("US$71,904.35");
    expect(totalText(column("sales"), 8412)).toBe("8,412");
    expect(totalText(column("sales"), null)).toBe("");
  });

  it("sums the ticked rows in the browser", () => {
    const rows = [
      row({ sales: 96, takings: 886.85, variance: -7.15 }),
      row({ sales: 77, takings: 695.1, variance: -8.14 }),
      row({ sales: 44, takings: 402.1, variance: -0.5 }),
    ];
    expect(selectionTotals(list.columns, rows)).toEqual({ sales: 217, takings: 1984.05, variance: -15.79 });
  });

  it("totals a ratio column over the ticked rows, as the Σ row does", () => {
    const categories = getReportDefinition("retail-categories")!.list!;
    const rows = [
      row({ products: 6, sold30: 8371.2, profit30: 1866.78, marginNow: 22.3 }),
      row({ products: 1, sold30: 252, profit30: 64.01, marginNow: 25.4 }),
    ];
    expect(selectionTotals(categories.columns, rows)).toEqual({ products: 7, sold30: 8623.2, marginNow: 22.4 });
    expect(selectionTotals(categories.columns, [row({ products: 2, sold30: 0, profit30: 0 })])).toEqual({
      products: 2,
      sold30: 0,
    });
  });
});

describe("the toolbar's words", () => {
  it("names the sorts, column sorts included", () => {
    expect(sortLabel(spec, "newest")).toBe("Newest first");
    expect(sortLabel(spec, "takings:asc")).toBe("Takings, lowest first");
    expect(sortLabel(spec, "openedAt:asc")).toBe("Opened, oldest first");
  });

  it("sorts a figure column high to low first, then reverses", () => {
    expect(nextColumnSort(spec, "newest", column("takings"))).toBe("takings:desc");
    expect(nextColumnSort(spec, "takings:desc", column("takings"))).toBe("takings:asc");
    // Newest first is Opened, descending: the next click on Opened reverses it.
    expect(nextColumnSort(spec, "newest", column("openedAt"))).toBe("openedAt:asc");
  });

  it("counts the filters that are on, the primaries once they fold", () => {
    const filters = { ...defaultFilters(spec), till: "TILL-2" };
    expect(defaultFilters(spec).opened).toBe("30d");
    expect(filtersOn(spec, defaultFilters(spec), false)).toBe(1);
    expect(filtersOn(spec, filters, false)).toBe(1);
    expect(filtersOn(spec, filters, true)).toBe(2);
    expect(filtersOn(spec, { ...filters, opened: "any" }, false)).toBe(0);
  });

  it("offers Clear only off the defaults", () => {
    expect(canClear(spec, { filters: defaultFilters(spec), q: "" })).toBe(false);
    expect(canClear(spec, { filters: { ...defaultFilters(spec), opened: "any" }, q: "" })).toBe(true);
    expect(canClear(spec, { filters: defaultFilters(spec), q: "chipo" })).toBe(true);
  });

  it("says what a filter is set to", () => {
    const opened = spec.filters.find((filter) => filter.key === "opened")!;
    const state = spec.filters.find((filter) => filter.key === "state")!;
    expect(filterValueLabel(opened, "30d")).toBe("Last 30 days");
    expect(filterValueLabel(opened, "any")).toBe("Any time");
    expect(filterValueLabel(opened, "2026-09-01..2026-09-30")).toBe("1 Sep 2026 to 30 Sep 2026");
    expect(filterValueLabel(state, "not-counted")).toBe("Not counted");
    expect(filterValueLabel(state, "nonsense")).toBe("Any");
  });
});

describe("pages (5.4.9)", () => {
  it("shows up to seven pages, then 1, …, around the current, …, last", () => {
    expect(pageButtons(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pageButtons(1, 12)).toEqual([1, 2, "gap", 12]);
    expect(pageButtons(6, 12)).toEqual([1, "gap", 5, 6, 7, "gap", 12]);
    expect(pageButtons(12, 12)).toEqual([1, "gap", 11, 12]);
    expect(pageButtons(3, 12)).toEqual([1, 2, 3, 4, "gap", 12]);
  });
});

describe("actions", () => {
  it("offers a row action only to rows that match its when", () => {
    const zReport = list.rowMenu!.find((action) => action.key === "z-report")!;
    expect(rowMatches(row({ state: "Short" }), list.columns, zReport.when)).toBe(true);
    expect(rowMatches(row({ state: "Open" }), list.columns, zReport.when)).toBe(false);
  });

  it("builds Compare cashiers from the ticked rows' first and last days", () => {
    const compare = list.bulk!.find((action) => action.key === "compare")!;
    const template = "do" in compare && "href" in compare.do ? (compare.do.href as string) : "";
    const href = bulkHref(template, [
      row({ id: "a", openedAt: "2026-08-15" }),
      row({ id: "b", openedAt: "2026-08-07" }),
      row({ id: "c", openedAt: "2026-08-14" }),
    ]);
    expect(href).toBe("/retail/insights/sales?tab=cashier&from=2026-08-07&to=2026-08-15");
  });

  it("asks Select all for the columns its bulk actions read", () => {
    expect(bulkKeys(spec).sort()).toEqual(["openedAt", "shiftNo"]);
  });
});

describe("runEndpoint", () => {
  it("posts a fixed endpoint as it stands, and fills a row's own from that one row", () => {
    expect(runEndpoint("/api/v2/retail/bin/delete", [])).toBe("/api/v2/retail/bin/delete");
    expect(runEndpoint("/api/v2/retail/tills/{id}/unpair", [{ id: "t 1" }])).toBe("/api/v2/retail/tills/t%201/unpair");
    expect(runEndpoint("/api/v2/retail/tills/{id}/unpair", [{ id: "a" }, { id: "b" }])).toBeNull();
  });
});
