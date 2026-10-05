import { describe, expect, it } from "vitest";

import { FLOOR_REPORTS } from "@/lib/reports/definitions/retail/floor";
import { canRetailRoleDo, canSeeRetailCostPrice } from "@/lib/retail/permissions";

import {
  canReadList,
  listIds,
  parseListQuery,
  periodInstants,
  periodRange,
  publicListSpec,
  resolveListQuery,
  runList,
  type ListContext,
} from "./list-query";
import { LIST_IDS_CAP, type ListOption, type ListQuery, type ListSpec, type ReportRow } from "./types";

const HARARE = "Africa/Harare";
// 3 October 2026, 10:00 in Harare.
const NOW = new Date("2026-10-03T08:00:00Z");

const SHIFTS = FLOOR_REPORTS.find((report) => report.key === "retail-shifts")!.list!;

function contextFor(role: string, userId = "user-owner"): ListContext {
  return {
    role,
    userId,
    now: NOW,
    timeZone: HARARE,
    can: ([resource, action]) => canRetailRoleDo(role, resource, action),
    seeCost: canSeeRetailCostPrice(role),
  };
}

const OWNER = contextFor("SUPERADMIN");

const query = (over: Partial<ListQuery> = {}): ListQuery => ({ page: 1, size: 50, filters: {}, ...over });

const CASHIERS = [
  { id: "u-chipo", name: "Chipo Dube" },
  { id: "u-farai", name: "Farai Moyo" },
  { id: "u-tafara", name: "Tafara Nyathi" },
];
const STATES = ["Balanced", "Short", "Balanced", "Over", "Balanced", "Not counted", "Balanced"] as const;

/** 312 shifts, two a day back from 3 October, every one of them inside "Any time". */
function shiftRows(count = 312): ReportRow[] {
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(Date.UTC(2026, 9, 3) - Math.floor(index / 2) * 86_400_000).toISOString().slice(0, 10);
    const state = index === 0 ? "Open" : STATES[index % STATES.length]!;
    const variance = state === "Short" ? -((index % 9) + 0.5) : state === "Over" ? (index % 5) + 1 : state === "Balanced" ? 0 : null;
    const cashier = CASHIERS[index % 3]!;
    return {
      id: `shift-${String(index).padStart(3, "0")}`,
      shiftNo: `SH-${String(1000 - index).padStart(5, "0")}`,
      cashier: cashier.name,
      cashierId: cashier.id,
      till: index % 2 === 0 ? "Front till" : "Back till",
      tillCode: index % 2 === 0 ? "TILL-1" : "TILL-2",
      state,
      openedAt: day,
      openedTime: index % 2 === 0 ? "07:58" : "15:02",
      durationMinutes: 420,
      running: state === "Open",
      sales: 20 + (index % 7),
      takings: 200 + (index % 11) * 25.5,
      variance,
      varianceSize: variance === null ? null : Math.abs(variance),
    };
  });
}

const LOADED: Record<string, ListOption[]> = {
  till: [
    { value: "TILL-2", label: "Back till" },
    { value: "TILL-1", label: "Front till" },
  ],
  cashier: CASHIERS.map((cashier) => ({ value: cashier.id, label: cashier.name })),
};

function run(rows: ReportRow[], over: Partial<ListQuery> = {}, ctx = OWNER) {
  const resolved = resolveListQuery(SHIFTS, query(over), LOADED, ctx);
  return runList(SHIFTS, rows, resolved, ctx, { loaded: LOADED });
}

const sum = (rows: ReportRow[], key: string) =>
  Math.round(rows.reduce((total, row) => total + (typeof row[key] === "number" ? (row[key] as number) : 0), 0) * 10_000) / 10_000;

describe("periods", () => {
  it("resolves the presets in Harare: Last 30 days on 3 October is 4 September to 3 October", () => {
    expect(periodRange("30d", NOW, HARARE)).toEqual({ from: "2026-09-04", to: "2026-10-03" });
    const instants = periodInstants("30d", NOW, HARARE)!;
    // 00:00 on 4 September in Harare, and up to the end of 3 October there.
    expect(instants.gte!.toISOString()).toBe("2026-09-03T22:00:00.000Z");
    expect(instants.lt!.toISOString()).toBe("2026-10-03T22:00:00.000Z");
  });

  it("reads the day in the zone, not in UTC", () => {
    // 23:30 UTC on 2 October is already 3 October in Harare.
    expect(periodRange("today", new Date("2026-10-02T23:30:00Z"), HARARE)).toEqual({ from: "2026-10-03", to: "2026-10-03" });
  });

  it("knows the other presets and typed ranges", () => {
    expect(periodRange("yesterday", NOW, HARARE)).toEqual({ from: "2026-10-02", to: "2026-10-02" });
    expect(periodRange("7d", NOW, HARARE)).toEqual({ from: "2026-09-27", to: "2026-10-03" });
    expect(periodRange("this-month", NOW, HARARE)).toEqual({ from: "2026-10-01", to: "2026-10-03" });
    expect(periodRange("last-month", NOW, HARARE)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(periodRange("this-year", NOW, HARARE)).toEqual({ from: "2026-01-01", to: "2026-10-03" });
    expect(periodRange("any", NOW, HARARE)).toBeNull();
    expect(periodRange("2026-08-01..2026-08-31", NOW, HARARE)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
  });
});

describe("resolving a query", () => {
  it("fills every default: newest first, no group, Opened in the last 30 days", () => {
    const resolved = resolveListQuery(SHIFTS, query(), LOADED, OWNER);
    expect(resolved).toMatchObject({ sort: "newest", group: null, page: 1, size: 50, tab: null, q: "" });
    expect(resolved.filters).toEqual({
      till: "any",
      cashier: "any",
      state: "any",
      opened: "30d",
      variance: "any",
      takings: "any",
    });
  });

  it("falls back to the default for values the source does not offer", () => {
    const resolved = resolveListQuery(
      SHIFTS,
      query({
        filters: { till: "TILL-9", opened: "fortnight", state: "lost", made: "up" },
        sort: "openedAt:sideways",
        group: "price",
        size: 70,
        page: -2,
      }),
      LOADED,
      OWNER,
    );
    expect(resolved.filters.till).toBe("any");
    expect(resolved.filters.opened).toBe("30d");
    expect(resolved.filters.state).toBe("any");
    expect(resolved.filters).not.toHaveProperty("made");
    expect(resolved).toMatchObject({ sort: "newest", group: null, size: 50, page: 1 });
  });

  it("names a column sort after the named sort it equals", () => {
    expect(resolveListQuery(SHIFTS, query({ sort: "openedAt:asc" }), LOADED, OWNER).sort).toBe("oldest");
    expect(resolveListQuery(SHIFTS, query({ sort: "takings:asc" }), LOADED, OWNER).sort).toBe("takings:asc");
    // Not sortable: the default.
    expect(resolveListQuery(SHIFTS, query({ sort: "cashier:asc" }), LOADED, OWNER).sort).toBe("newest");
  });

  it("reads the address", () => {
    const parsed = parseListQuery(new URLSearchParams("page=3&size=25&till=TILL-2&opened=any&sort=most-taken&group=state&q=chipo&cols=till"));
    expect(parsed).toEqual({
      page: 3,
      size: 25,
      sort: "most-taken",
      group: "state",
      q: "chipo",
      hidden: ["till"],
      filters: { till: "TILL-2", opened: "any" },
    });
  });
});

describe("a page of shifts", () => {
  const rows = shiftRows();

  it("totals every filtered row: page 2 of 7 carries the same totals as page 1", () => {
    const first = run(rows, { filters: { opened: "any" } });
    const second = run(rows, { filters: { opened: "any" }, page: 2 });
    expect(first.result.total).toBe(312);
    expect(first.result.pages).toBe(7);
    expect(second.result.page).toBe(2);
    expect(second.result.rows).toHaveLength(50);
    expect(second.result.rows[0]!.id).not.toBe(first.result.rows[0]!.id);
    expect(second.result.totals).toEqual(first.result.totals);
    expect(first.result.totals).toEqual({
      sales: sum(rows, "sales"),
      takings: sum(rows, "takings"),
      variance: sum(rows, "variance"),
    });
    expect(first.result.summary.state).toEqual({
      count: rows.filter((row) => ["Short", "Over", "Not counted"].includes(row.state as string)).length,
      label: "to check",
      tone: "pending",
    });
  });

  it("orders newest first, the time of day breaking a tie", () => {
    const { result } = run(rows, { filters: { opened: "any" } });
    expect(result.rows[0]).toMatchObject({ openedAt: "2026-10-03", openedTime: "15:02" });
    expect(result.rows[1]).toMatchObject({ openedAt: "2026-10-03", openedTime: "07:58" });
  });

  it("narrows by the default period, a till and the search", () => {
    const lastThirty = run(rows);
    expect(lastThirty.result.total).toBe(60);
    const back = run(rows, { filters: { opened: "any", till: "TILL-2" } });
    expect(back.result.total).toBe(156);
    expect(back.result.totals.takings).toBe(sum(rows.filter((row) => row.tillCode === "TILL-2"), "takings"));
    const chipo = run(rows, { filters: { opened: "any" }, q: "CHIPO" });
    expect(chipo.result.total).toBe(104);
  });

  it("narrows by a choice that is a range", () => {
    const short = run(rows, { filters: { opened: "any", variance: "short" } });
    expect(short.result.rows.every((row) => (row.variance as number) < 0)).toBe(true);
    const different = run(rows, { filters: { opened: "any", variance: "any-difference" } });
    expect(different.result.total).toBe(rows.filter((row) => row.variance !== null && row.variance !== 0).length);
  });

  it("orders grouped pages by group, then by sort, each group with its whole count and subtotals", () => {
    const grouped = run(rows, { filters: { opened: "any" }, group: "state" });
    const { groups } = grouped.result;
    // The state column's tone order, not the order rows happened to come in.
    expect(groups!.map((group) => group.label)).toEqual(["Open", "Short", "Over", "Not counted", "Balanced"]);
    const short = groups!.find((group) => group.label === "Short")!;
    const shortRows = rows.filter((row) => row.state === "Short");
    expect(short).toMatchObject({ value: "Short", tone: "bad", count: shortRows.length });
    expect(short.totals).toEqual({
      sales: sum(shortRows, "sales"),
      takings: sum(shortRows, "takings"),
      variance: sum(shortRows, "variance"),
    });
    expect(grouped.ordered.map((row) => row.state)).toEqual(
      [...grouped.ordered.map((row) => row.state)].sort(
        (a, b) => ["Open", "Short", "Over", "Not counted", "Balanced"].indexOf(a as string) - ["Open", "Short", "Over", "Not counted", "Balanced"].indexOf(b as string),
      ),
    );
    // Within a group, newest first.
    const inShort = grouped.ordered.filter((row) => row.state === "Short").map((row) => `${row.openedAt} ${row.openedTime}`);
    expect(inShort).toEqual([...inShort].sort().reverse());
    // The page is a slice of that order.
    expect(grouped.result.rows.map((row) => row.id)).toEqual(grouped.ordered.slice(0, 50).map((row) => row.id));
  });

  it("gives a cashier their own shifts only, without the Cashier filter", () => {
    const cashier = contextFor("CASHIER", "u-chipo");
    const own = run(rows, { filters: { opened: "any", cashier: "u-farai" } }, cashier);
    expect(own.result.total).toBe(104);
    expect(own.ordered.every((row) => row.cashierId === "u-chipo")).toBe(true);
    const shown = publicListSpec(SHIFTS, cashier, LOADED);
    expect(shown.filters.map((filter) => filter.key)).not.toContain("cashier");
    expect(shown.bulk!.map((action) => action.key)).toEqual(["export", "copy"]);
  });

  it("offers the empty guide's Open shift only to a role that may open one, as the header does", () => {
    const bookkeeper = contextFor("FINANCE_OFFICER", "u-rc");
    expect(canReadList(SHIFTS, bookkeeper)).toBe(true);
    const theirs = publicListSpec(SHIFTS, bookkeeper, LOADED);
    expect(theirs.primary).toBeNull();
    expect(theirs.empty.title).toBe("No shifts yet");
    expect(theirs.empty.primary).toBeUndefined();
    expect(publicListSpec(SHIFTS, OWNER, LOADED).empty.primary).toEqual({ label: "Open shift", sheet: "shift-open" });
  });

  it("caps ids at 5,000 and says so", () => {
    const many = shiftRows(LIST_IDS_CAP + 7);
    const ids = listIds(run(many, { filters: { opened: "any" } }));
    expect(ids.total).toBe(LIST_IDS_CAP + 7);
    expect(ids.ids).toHaveLength(LIST_IDS_CAP);
    expect(ids.capped).toBe(true);
    expect(listIds(run(rows, { filters: { opened: "any" } }))).toMatchObject({ total: 312, capped: false });
  });

  it("picks the columns a bulk action reads beside the ids, and only columns the role may see", () => {
    const ids = listIds(run(rows, { filters: { opened: "any" } }), ["shiftNo", "openedAt", "cashierId"], SHIFTS.columns);
    expect(ids.picked!.shiftNo).toHaveLength(312);
    // In the order of the ids.
    expect(ids.picked!.shiftNo![5]).toBe(rows.find((entry) => entry.id === ids.ids[5])!.shiftNo);
    expect(Object.keys(ids.picked!)).toEqual(["shiftNo", "openedAt"]);
    expect(listIds(run(rows, { filters: { opened: "any" } }))).not.toHaveProperty("picked");
  });

  it("knows a list with no rows at all from one the filters emptied", () => {
    expect(run([]).result).toMatchObject({ total: 0, pages: 1, page: 1, everEmpty: true });
    expect(run(rows, { q: "nobody" }).result).toMatchObject({ total: 0, everEmpty: false });
  });

  it("refuses the stock clerk and reads for everyone else", () => {
    expect(canReadList(SHIFTS, contextFor("STOCK_CLERK"))).toBe(false);
    expect(canReadList(SHIFTS, contextFor("CASHIER"))).toBe(true);
    expect(canReadList(SHIFTS, contextFor("MANAGER"))).toBe(true);
  });
});

/** A list with tabs and a cost column, as the Products list will be. */
const PRODUCTS: ListSpec = {
  noun: "products",
  read: [["retail.catalog", "view"]],
  search: { placeholder: "Name or code", keys: ["name"] },
  tabs: [
    { key: "selling", label: "Selling", where: [{ column: "state", op: "is", value: ["Selling"] }] },
    { key: "archived", label: "Archived", where: [{ column: "state", op: "is", value: ["Archived"] }] },
    { key: "all", label: "All", where: [] },
  ],
  filters: [
    {
      key: "category",
      label: "Category",
      type: "choice",
      any: "Any",
      column: "category",
      options: [
        { value: "Spirits", label: "Spirits" },
        { value: "Beer", label: "Beer" },
      ],
    },
  ],
  sorts: [{ key: "name", label: "Name A–Z", rules: [{ column: "name", dir: "asc" }] }],
  groups: ["category", "cost"],
  columns: [
    { key: "name", label: "Product", kind: "text", cell: "link", width: "minmax(180px,1fr)" },
    { key: "category", label: "Category", kind: "text", cell: "muted", width: "120px" },
    { key: "state", label: "State", kind: "status", cell: "state", width: "110px", tones: { Selling: "ok", Archived: "neutral" } },
    { key: "price", label: "Price", kind: "money", cell: "money", width: "100px", total: "sum" },
    { key: "cost", label: "Cost", kind: "money", cell: "money", width: "100px", total: "sum", requires: "view-cost" },
  ],
  rowHref: "/retail/products/{id}",
  card: { title: "name", figure: "price", meta: "{category}" },
  empty: { icon: "Package", title: "No products yet", line: "Add the first one." },
};

const PRODUCT_ROWS: ReportRow[] = [
  { id: "p1", name: "Amarula Cream 750ml", category: "Spirits", state: "Selling", price: 18.25, cost: 11 },
  { id: "p2", name: "Castle Lager 340ml", category: "Beer", state: "Selling", price: 1.2, cost: 0.8 },
  { id: "p3", name: "Black Label 750ml", category: "Beer", state: "Selling", price: 2.5, cost: 1.6 },
  { id: "p4", name: "Old Brandy", category: "Spirits", state: "Archived", price: 9, cost: 6 },
];

describe("tabs and cost", () => {
  it("counts the tabs ignoring search and filters", () => {
    const ctx = contextFor("SUPERADMIN");
    const resolved = resolveListQuery(PRODUCTS, query({ q: "castle", filters: { category: "Beer" } }), {}, ctx);
    expect(resolved.tab).toBe("selling");
    const { result } = runList(PRODUCTS, PRODUCT_ROWS, resolved, ctx);
    expect(result.total).toBe(1);
    expect(result.tabs).toEqual({ selling: 3, archived: 1, all: 4 });
  });

  it("drops a view-cost column, values and totals, for a cashier", () => {
    const cashier = contextFor("CASHIER", "u-chipo");
    const resolved = resolveListQuery(PRODUCTS, query({ tab: "all", group: "cost", sort: "cost:desc" }), {}, cashier);
    expect(resolved.group).toBeNull();
    const { result, applied } = runList(PRODUCTS, PRODUCT_ROWS, resolved, cashier);
    expect(result.rows.every((row) => !("cost" in row))).toBe(true);
    expect(result.totals).toEqual({ price: 30.95 });
    expect(applied.columns.map((column) => column.key)).not.toContain("cost");
    const shown = publicListSpec(PRODUCTS, cashier, {});
    expect(shown.columns.map((column) => column.key)).toEqual(["name", "category", "state", "price"]);
    expect(shown.groups).toEqual(["category"]);

    const owner = contextFor("SUPERADMIN");
    const theirs = runList(PRODUCTS, PRODUCT_ROWS, resolveListQuery(PRODUCTS, query({ tab: "all" }), {}, owner), owner);
    expect(theirs.result.totals).toEqual({ price: 30.95, cost: 19.4 });
  });

  it("offers Export's extras to the roles they name, and a choice only when the company can make it", () => {
    const spec: ListSpec = {
      ...PRODUCTS,
      filters: [
        ...PRODUCTS.filters,
        { key: "site", label: "Site", type: "choice", any: "All sites", optionsFromLoader: true, hideBelow: 2 },
      ],
      exportExtras: [{ label: "Import a spreadsheet", href: "/retail/products/import", requires: [["retail.catalog", "create"]] }],
    };
    const oneSite = { site: [{ value: "s1", label: "Harare Main Branch" }] };
    const twoSites = { site: [...oneSite.site, { value: "s2", label: "Borrowdale" }] };
    const owner = publicListSpec(spec, contextFor("SUPERADMIN"), twoSites);
    expect(owner.exportExtras).toEqual([{ label: "Import a spreadsheet", href: "/retail/products/import" }]);
    expect(owner.filters.map((filter) => filter.key)).toContain("site");
    expect(publicListSpec(spec, contextFor("SUPERADMIN"), oneSite).filters.map((filter) => filter.key)).not.toContain("site");
    expect(publicListSpec(spec, contextFor("CASHIER", "u-chipo"), twoSites).exportExtras).toBeUndefined();
  });
});
