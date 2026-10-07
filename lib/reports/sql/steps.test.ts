/**
 * Steps write SQL, and SQL in that shape reads back as the same steps. What
 * the steps write passes the guard and runs on the report database.
 */
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { ReportDatabase } from "@/lib/reports/sql/engine";
import { checkSql } from "@/lib/reports/sql/guard";
import { sourceTable } from "@/lib/reports/sql/schema";
import { stepsFromSql, stepsToSql, type QuerySteps } from "@/lib/reports/sql/steps";
import type { ReportRow } from "@/lib/reports/types";

const table = sourceTable({
  key: "crm-visit-forms",
  title: "Site visit forms",
  columns: [
    { key: "visitNo", label: "Visit", kind: "code" },
    { key: "visited", label: "Visited", kind: "date" },
    { key: "form", label: "Form", kind: "text" },
    { key: "rep", label: "Rep", kind: "text" },
    { key: "measured", label: "Area measured (m²)", kind: "number" },
    { key: "drafted", label: "Quote drafted", kind: "money" },
    { key: "outcome", label: "Deal", kind: "status" },
  ],
});
const tables = [table];

const rows: ReportRow[] = [
  { id: "1", visitNo: "V-1", visited: "2026-07-03", form: "Epoxy flooring survey", rep: "Rutendo", measured: 240, drafted: 11534.4, outcome: "Won" },
  { id: "2", visitNo: "V-2", visited: "2026-07-21", form: "Epoxy flooring survey", rep: "Tafadzwa", measured: 120, drafted: 4200, outcome: "Lost" },
  { id: "3", visitNo: "V-3", visited: "2026-08-02", form: "Tile installation survey", rep: "Rutendo", measured: 60, drafted: 1800, outcome: null },
  { id: "4", visitNo: "V-4", visited: "2026-08-15", form: "Epoxy flooring survey", rep: "Rutendo", measured: 300, drafted: 13900, outcome: "Won" },
];

const byMonth: QuerySteps = {
  from: "crm_visit_forms",
  keep: [{ column: "form", op: "contains", value: "epoxy" }, { column: "measured", op: "above", value: "100" }],
  groups: [{ column: "visited", by: "month" }],
  totals: [
    { fn: "count", as: "visits" },
    { fn: "sum", column: "measured", as: "measured" },
  ],
  columns: [],
  sort: { column: "month", dir: "asc" },
};

describe("steps as SQL", () => {
  it("writes SQL a person can read", () => {
    expect(stepsToSql(byMonth, tables)).toBe(
      [
        "select",
        "  cast(date_trunc('month', visited) as date) as month,",
        "  count(*) as visits,",
        "  sum(measured) as measured",
        "from crm_visit_forms",
        "where form ilike '%epoxy%'",
        "  and measured > 100",
        "group by 1",
        "order by month asc",
        "",
      ].join("\n"),
    );
  });

  it.each<[string, QuerySteps]>([
    ["totals by month", byMonth],
    ["rows as they are", { from: "crm_visit_forms", keep: [], groups: [], totals: [], columns: [] }],
    ["some columns, filtered and sorted", { from: "crm_visit_forms", keep: [{ column: "outcome", op: "isNotEmpty" }, { column: "rep", op: "is", value: "O'Brien" }], groups: [], totals: [], columns: ["visit_no", "measured"], sort: { column: "measured", dir: "desc" }, limit: 10 }],
    ["by two things", { from: "crm_visit_forms", keep: [{ column: "outcome", op: "isNot", value: "Lost" }], groups: [{ column: "rep" }, { column: "form" }], totals: [{ fn: "avg", column: "drafted", as: "typical_quote" }], columns: [] }],
    ["one total", { from: "crm_visit_forms", keep: [{ column: "visited", op: "below", value: "2026-08-01" }], groups: [], totals: [{ fn: "max", column: "measured", as: "largest" }], columns: [] }],
  ])("reads back %s", (_, steps) => {
    expect(stepsFromSql(stepsToSql(steps, tables), tables)).toEqual(steps);
  });

  it.each([
    ["a join", "select * from crm_visit_forms a join crm_visit_forms b on a.visit_no = b.visit_no"],
    ["a subquery", "select * from (select * from crm_visit_forms) as x"],
    ["an or", "select * from crm_visit_forms where rep = 'A' or rep = 'B'"],
    ["a case", "select case when measured > 100 then 'big' else 'small' end as size from crm_visit_forms"],
    ["an unknown column", "select nope from crm_visit_forms"],
    ["another table", "select * from crm_leads"],
    ["a total with no name", "select sum(measured) from crm_visit_forms"],
    ["a grouping that differs from the columns", "select rep, count(*) as n from crm_visit_forms group by form"],
    ["two statements", "select * from crm_visit_forms; select * from crm_visit_forms"],
    ["not SQL at all", "show me the money"],
  ])("leaves %s as SQL", (_, sql) => {
    expect(stepsFromSql(sql, tables)).toBeNull();
  });
});

describe("what steps write", () => {
  let db: ReportDatabase;
  beforeAll(async () => {
    db = new ReportDatabase(await PGlite.create());
    await db.load(table, rows, "v1");
  });

  it("passes the guard and runs", async () => {
    const checked = checkSql(stepsToSql(byMonth, tables), new Set([table.name]));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const ran = await db.run(checked.body, {});
    expect(ran.ok).toBe(true);
    if (!ran.ok) return;
    expect(ran.result.rows.map((row) => [String(row.month).slice(0, 7), Number(row.visits), Number(row.measured)])).toEqual([
      ["2026-07", 2, 360],
      ["2026-08", 1, 300],
    ]);
  });

  it("keeps a quote in a value from becoming SQL", async () => {
    const steps: QuerySteps = { from: "crm_visit_forms", keep: [{ column: "rep", op: "is", value: "x'; drop table crm_visit_forms; --" }], groups: [], totals: [], columns: [] };
    const checked = checkSql(stepsToSql(steps, tables), new Set([table.name]));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const ran = await db.run(checked.body, {});
    expect(ran.ok && ran.result.rows).toEqual([]);
  });
});
