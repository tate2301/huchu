/**
 * Report queries: what the guard lets through, how a result is typed, and
 * what the report database does with a query — run here against a real
 * PGlite, the same Postgres the browser's worker runs.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { resultColumns } from "@/lib/reports/sql/columns";
import { ReportDatabase } from "@/lib/reports/sql/engine";
import { checkSql, trimEnd } from "@/lib/reports/sql/guard";
import { sourceTable, sqlName, type SqlTable } from "@/lib/reports/sql/schema";
import { REPORT_DEFINITIONS } from "@/lib/reports/registry";
import type { ReportColumn, ReportRow } from "@/lib/reports/types";

const DEALS: ReportColumn[] = [
  { key: "dealNo", label: "Deal", kind: "code" },
  { key: "client", label: "Customer", kind: "relation" },
  { key: "status", label: "Outcome", kind: "status" },
  { key: "owner", label: "Owner", kind: "text" },
  { key: "value", label: "Value", kind: "money", currency: "USD", total: "sum" },
  { key: "closes", label: "Expected close", kind: "date" },
];

const deals: ReportRow[] = [
  { id: "d1", dealNo: "D-1", client: "Acme", status: "Won", owner: "Rudo", value: 1000, closes: "2026-01-05" },
  { id: "d2", dealNo: "D-2", client: "Acme", status: "Lost", owner: "Tino", value: 400, closes: "2026-01-20" },
  { id: "d3", dealNo: "D-3", client: "Bata", status: "Won", owner: "Rudo", value: 2500.5, closes: "2026-02-03" },
  { id: "d4", dealNo: "D-4", client: "Chido", status: "Open", owner: null, value: null, closes: "2026-02-28" },
];

const table = sourceTable({ key: "crm-deals", title: "Deals", columns: DEALS });
const allowed = new Set([table.name, "crm_leads"]);

describe("names", () => {
  it("are what Postgres reads without quotes", () => {
    expect(sqlName("crm-deals")).toBe("crm_deals");
    expect(sqlName("dealNo")).toBe("deal_no");
    expect(sqlName("daysOverdue")).toBe("days_overdue");
    expect(table.columns.map((column) => column.sql)).toEqual(["deal_no", "client", "status", "owner", "value", "closes"]);
  });

  it("never collide within a source", () => {
    for (const definition of REPORT_DEFINITIONS) {
      const names = definition.columns.map((column) => sqlName(column.key));
      expect(new Set(names).size, definition.key).toBe(names.length);
    }
  });
});

describe("the guard", () => {
  it.each([
    "select owner, sum(value) as total from crm_deals group by owner order by total desc",
    "with won as (select * from crm_deals where status = 'Won') select * from won",
    "select row_number() over (order by value desc) as place, deal_no from crm_deals",
    "select percentile_cont(0.5) within group (order by value) from crm_deals",
    "select count(*) filter (where status = 'Won') from crm_deals",
    "select date_trunc('month', closes)::date as month, sum(value) from crm_deals where closes >= period_start() group by 1",
    "select d.deal_no from crm_deals d join crm_leads l on l.client = d.client",
    "select case when value > 1000 then 'Big' else 'Small' end as size, count(*) from crm_deals group by 1",
  ])("lets through %s", (sql) => {
    expect(checkSql(sql, allowed)).toMatchObject({ ok: true });
  });

  it.each([
    ["delete from crm_deals", /only read/],
    ["select 1; select 2", /One query per block/],
    ["select * into copy from crm_deals", /cannot make a table/],
    ["select * from crm_deals for update", /does not read as SQL|does not lock/],
    ["select * from pg_catalog.pg_authid", /no table pg_catalog.pg_authid/],
    ["select * from information_schema.tables", /no table information_schema.tables/],
    ["select set_config('role', 'postgres', false)", /set_config is not one of the functions/],
    ["select pg_read_file('postgresql.conf')", /pg_read_file is not one/],
    ["select * from crm_deals, lateral (select pg_sleep(10)) x", /pg_sleep is not one/],
    ["select query_to_xml('delete from crm_deals', true, true, '')", /query_to_xml is not one/],
    ["select * from crm_dealz", /Did you mean crm_deals/],
    ["select * from crm_deals where", /stops before it is finished/],
    ["", /Write a query/],
  ])("refuses %s", (sql, message) => {
    const checked = checkSql(sql, allowed);
    expect(checked.ok ? null : checked.problem.message).toMatch(message);
  });

  it("points at what it refuses", () => {
    const checked = checkSql("select * from crm_dealz", allowed);
    expect(checked.ok ? null : [checked.problem.from, checked.problem.to]).toEqual([14, 23]);
  });

  it("takes trailing semicolons and comments off, so the query can be wrapped", () => {
    expect(trimEnd("select 1;  -- the one\n")).toBe("select 1");
    expect(trimEnd("select '--' as dashes ; /* done */ ")).toBe("select '--' as dashes");
  });

  it("reads every example in the documentation", () => {
    const tables = new Set(REPORT_DEFINITIONS.map((definition) => sqlName(definition.key)));
    const doc = readFileSync(path.join(process.cwd(), "docs/reports/custom-reports.md"), "utf8");
    const examples = [...doc.matchAll(/```sql\n([\s\S]*?)```/g)].map((match) => match[1]!);
    expect(examples.length).toBeGreaterThanOrEqual(4);
    for (const example of examples) {
      const checked = checkSql(example, tables);
      expect(checked.ok ? null : `${checked.problem.message} in:\n${example}`).toBeNull();
    }
  });
});

describe("the report database", () => {
  let db: ReportDatabase;
  const run = async (sql: string, period: { from?: string; to?: string } = {}, tables: SqlTable[] = [table]) => {
    const checked = checkSql(sql, allowed);
    if (!checked.ok) throw new Error(checked.problem.message);
    const ran = await db.run(checked.body, period);
    if (!ran.ok) return ran;
    return { ...ran, columns: resultColumns(checked.ast, ran.result.fields, tables) };
  };

  beforeAll(async () => {
    db = new ReportDatabase(await PGlite.create());
    await db.load(table, deals, "v1");
  }, 60_000);

  it("runs a query over the rows it was given, typed as the report types them", async () => {
    const ran = await run("select owner, sum(value) as total, count(*) as deals from crm_deals group by owner order by total desc nulls last");
    expect(ran.ok && ran.result.rows).toEqual([
      { owner: "Rudo", total: 3500.5, deals: 2 },
      { owner: "Tino", total: 400, deals: 1 },
      { owner: null, total: null, deals: 1 },
    ]);
    expect(ran.ok && ran.columns).toEqual([
      { key: "owner", label: "Owner", kind: "text" },
      { key: "total", label: "Total", kind: "money", currency: "USD" },
      { key: "deals", label: "Deals", kind: "number" },
    ]);
  });

  it("reads dates as days, and the report's dates through period_start and period_end", async () => {
    const ran = await run(
      "select deal_no, closes from crm_deals where closes between period_start() and period_end() order by closes",
      { from: "2026-01-01", to: "2026-01-31" },
    );
    expect(ran.ok && ran.result.rows).toEqual([
      { deal_no: "D-1", closes: "2026-01-05" },
      { deal_no: "D-2", closes: "2026-01-20" },
    ]);
    expect(ran.ok && ran.columns.map((column) => column.kind)).toEqual(["code", "date"]);
  });

  it("buckets by month for a trend", async () => {
    const ran = await run("select date_trunc('month', closes)::date as month, sum(value) as value from crm_deals group by 1 order by 1");
    expect(ran.ok && ran.result.rows).toEqual([
      { month: "2026-01-01", value: 1400 },
      { month: "2026-02-01", value: 2500.5 },
    ]);
    expect(ran.ok && ran.columns.map((column) => [column.key, column.kind])).toEqual([
      ["month", "date"],
      ["value", "money"],
    ]);
  });

  it("says where Postgres found a problem, in the query as written", async () => {
    const ran = await run("select valu from crm_deals");
    expect(ran.ok).toBe(false);
    expect(!ran.ok && ran.error).toEqual({ message: 'column "valu" does not exist', position: 7 });
  });

  it("cannot change a table, even past the guard", async () => {
    const ran = await db.run("select * from crm_deals) as x; delete from crm_deals; select * from (select 1", {});
    expect(ran.ok).toBe(false);
    const still = await run("select count(*) as n from crm_deals");
    expect(still.ok && still.result.rows[0]).toEqual({ n: 4 });
  });

  it("runs as a role that cannot read files or set its own role, even past the guard", async () => {
    const files = await db.run("select pg_read_file('postgresql.conf')", {});
    expect(!files.ok && files.error.message).toMatch(/permission denied/);
    const write = await db.run("with gone as (delete from crm_deals returning *) select * from gone", {});
    expect(!write.ok && write.error.message).toMatch(/read-only transaction|permission denied|data-modifying statement/);
  });

  it("keeps an unchanged table, and reloads a changed one", async () => {
    await db.load(table, deals.slice(0, 1), "v1");
    expect((await run("select count(*) as n from crm_deals")).ok && db.has("crm_deals", "v1")).toBe(true);
    await db.load(table, deals.slice(0, 1), "v2");
    const ran = await run("select count(*) as n from crm_deals");
    expect(ran.ok && ran.result.rows[0]).toEqual({ n: 1 });
    await db.load(table, deals, "v3");
  });
});
