/**
 * "One row for each" in memory: rows rolled up by a key, their money summed,
 * their count the documents that count (a voided sale is a row but not a
 * sale), the totals over the rolled rows equal to the totals before rolling,
 * and the key cell linking to the same template, narrowed, over the same period.
 */
import { describe, expect, it } from "vitest";

import { canRetailRoleDo } from "@/lib/retail/permissions";

import { listShape, resolveListQuery, runSource, type ListContext } from "./list-query";
import { rolledFace, rollUp, rollupKeys } from "./rollup";
import type { ListQuery, ReportFace, ReportRow } from "./types";

const NOW = new Date("2026-10-03T08:00:00Z");
const OWNER: ListContext = {
  role: "SUPERADMIN",
  userId: "owner",
  now: NOW,
  timeZone: "Africa/Harare",
  can: ([resource, action]) => canRetailRoleDo("SUPERADMIN", resource, action),
  seeCost: true,
};

/** A sales-shaped face: one row per document, a voided sale's total kept out of the count. */
const SALES: ReportFace = {
  area: "selling",
  noun: "sales",
  read: [["retail.sell", "view"]],
  search: { placeholder: "Sale", keys: ["saleNo"] },
  filters: [
    { key: "when", label: "Period", type: "period", any: "Any time", column: "day", default: "any" },
    { key: "site", label: "Shop", type: "choice", any: "Any", column: "siteId", optionsFromLoader: true },
  ],
  sorts: [{ key: "newest", label: "Newest first", rules: [{ column: "at", dir: "desc" }] }],
  groups: ["site"],
  columns: [
    { key: "saleNo", label: "Sale", kind: "code", cell: "ref", width: "120px" },
    { key: "day", label: "Date", kind: "date", cell: "date", width: "140px" },
    { key: "site", label: "Shop", kind: "text", cell: "text", width: "160px" },
    { key: "cashier", label: "Cashier", kind: "text", cell: "muted", width: "140px" },
    { key: "total", label: "Total", kind: "money", currency: "USD", cell: "money", total: "sum", width: "120px" },
    { key: "taken", label: "Taken", kind: "money", currency: "USD", cell: "money", total: "sum", width: "120px" },
    { key: "sales", label: "Sales", kind: "number", cell: "num", total: "sum", width: "90px" },
  ],
  rowHref: "/retail/sales/{id}",
  card: { title: "saleNo", figure: "total", meta: "{site}" },
  empty: { title: "No sales", line: "None." },
  rollups: [
    { key: "none", label: "Sale" },
    { key: "site", label: "Shop" },
    { key: "day", label: "Day" },
  ],
  rollupOnly: "sales",
};

const sale = (id: string, site: string, total: number, at: string, voided = false): ReportRow => ({
  id,
  saleNo: id,
  day: at.slice(0, 10),
  at,
  site: site === "s1" ? "Harare Main Branch" : "Borrowdale",
  siteId: site,
  cashier: "Chipo Dube",
  total,
  taken: voided ? 0 : total,
  sales: voided ? 0 : 1,
});

const ROWS: ReportRow[] = [
  sale("S-1", "s1", 10.5, "2026-10-02T09:00:00Z"),
  sale("S-2", "s1", 20.25, "2026-10-02T10:00:00Z"),
  sale("S-3", "s2", 7, "2026-10-01T09:00:00Z"),
  sale("S-4", "s1", 4.4, "2026-10-01T11:00:00Z", true),
  sale("S-5", "s2", 3.1, "2026-10-03T07:00:00Z"),
];

const query = (over: Partial<ListQuery> = {}): ListQuery => ({ page: 1, size: 50, filters: {}, face: "report", ...over });

describe("rolling up", () => {
  it("makes one row per shop, its count the sales that stand and its money summed", () => {
    const rolled = rollUp(ROWS, SALES, ["site"], SALES.columns);
    const main = rolled.find((row) => row.site === "Harare Main Branch")!;
    const borrowdale = rolled.find((row) => row.site === "Borrowdale")!;
    expect(rolled).toHaveLength(2);
    expect(main).toMatchObject({ id: "Harare Main Branch", siteId: "s1", sales: 2, total: 35.15, taken: 30.75 });
    expect(borrowdale).toMatchObject({ id: "Borrowdale", siteId: "s2", sales: 2, total: 10.1, taken: 10.1 });
    // Columns that are neither keys nor figures are gone; the latest time stays for "Newest first".
    expect(main.cashier).toBeUndefined();
    expect(main.at).toBe("2026-10-02T10:00:00Z");
  });

  it("joins several keys with | for the id", () => {
    const rolled = rollUp(ROWS, SALES, ["site", "day"], SALES.columns);
    expect(rolled.map((row) => row.id).sort()).toEqual([
      "Borrowdale|2026-10-01",
      "Borrowdale|2026-10-03",
      "Harare Main Branch|2026-10-01",
      "Harare Main Branch|2026-10-02",
    ]);
  });

  it("totals the rolled rows to what the rows total unrolled", () => {
    const flat = runSource(SALES, ROWS, resolveListQuery(SALES, query(), {}, OWNER), OWNER);
    const resolved = resolveListQuery(SALES, query({ rows: ["site"] }), {}, OWNER);
    const rolled = runSource(SALES, ROWS, resolved, OWNER);
    expect(rolled.result.total).toBe(2);
    for (const key of ["total", "taken"]) expect(rolled.result.totals[key]).toBe(flat.result.totals[key]);
    expect(rolled.result.totals.sales).toBe(4);
  });

  it("narrows before it rolls up: one shop's rows only", () => {
    const resolved = resolveListQuery(SALES, query({ rows: ["day"], filters: { site: "s1" } }), { site: [{ value: "s1", label: "Harare Main Branch" }] }, OWNER);
    const run = runSource(SALES, ROWS, resolved, OWNER);
    expect(run.result.rows.map((row) => row.id)).toEqual(["2026-10-02", "2026-10-01"]);
  });

  it("links a key cell to the same template, narrowed to that value, over the same period", () => {
    const resolved = resolveListQuery(SALES, query({ rows: ["site"], template: "weekend", filters: { when: "this-week" } }), {}, OWNER);
    const run = runSource(SALES, ROWS, resolved, OWNER);
    const main = run.result.rows.find((row) => row.site === "Harare Main Branch")!;
    expect(main.siteHref).toBe("/retail/reports/weekend?site=s1&when=this-week");
    const shape = listShape(SALES, resolved);
    expect(shape.columns.map((column) => column.key)).toEqual(["site", "sales", "total", "taken"]);
    expect(shape.columns[0]).toMatchObject({ cell: "link", href: "{siteHref}" });
  });

  it("rolls up only by keys the face offers", () => {
    expect(rollupKeys(SALES, ["site"])).toEqual(["site"]);
    expect(rollupKeys(SALES, ["site", "cashier"])).toEqual([]);
    expect(rollupKeys(SALES, ["none"])).toEqual([]);
    expect(rolledFace(SALES, ["day"]).columns[0]!.key).toBe("day");
  });
});
