import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { documentFromReport, type CustomBlock } from "@/lib/reports/custom/document";
import { checkBlocks, runBlocks, tablesRead } from "@/lib/reports/custom/run";
import { ReportDatabase } from "@/lib/reports/sql/engine";
import { sourceTable } from "@/lib/reports/sql/schema";
import type { ReportColumn, ReportRow } from "@/lib/reports/types";

const COLUMNS: ReportColumn[] = [
  { key: "owner", label: "Owner", kind: "text" },
  { key: "stage", label: "Stage", kind: "status" },
  { key: "value", label: "Value", kind: "money", total: "sum" },
  { key: "closes", label: "Closes", kind: "date" },
];

const rows: ReportRow[] = [
  { id: "1", owner: "Rudo", stage: "Won", value: 100, closes: "2026-01-02" },
  { id: "2", owner: "Tino", stage: "Won", value: 50, closes: "2026-01-03" },
  { id: "3", owner: "Rudo", stage: "Lost", value: 70, closes: "2026-01-04" },
];

const sources = [sourceTable({ key: "crm-deals", title: "Deals", columns: COLUMNS })];

let runner: ReportDatabase;
beforeAll(async () => {
  runner = new ReportDatabase(await PGlite.create());
}, 60_000);

const inputs = () => ({ runner, sources, rows: () => rows, version: () => "v1", period: {} });

function query(id: string, name: string, sql: string): CustomBlock {
  return { id, type: "query", name, query: sql, display: { type: "table" } };
}

describe("a custom report's blocks", () => {
  it("read each other whatever order they sit in", async () => {
    const blocks = [
      query("b", "by_owner", "select owner, sum(value) as total from won group by owner order by total desc"),
      query("a", "won", "select * from crm_deals where stage = 'Won'"),
      { id: "h", type: "heading" as const, text: "Sales" },
    ];
    const checks = checkBlocks(blocks, sources);
    expect(tablesRead(checks, sources)).toEqual(["crm_deals"]);
    const results = await runBlocks(blocks, checks, inputs());
    const byOwner = results.get("b");
    expect(byOwner?.ok && byOwner.rows.map((row) => [row.owner, row.total])).toEqual([
      ["Rudo", 100],
      ["Tino", 50],
    ]);
    // A total of a block's money is still money.
    expect(byOwner?.ok && byOwner.columns[1]).toMatchObject({ key: "total", kind: "money" });
  });

  it("say so when they read each other in a circle", () => {
    const checks = checkBlocks([query("a", "a", "select * from b"), query("b", "b", "select * from a")], sources);
    expect([...checks.values()].every((check) => !check.ok)).toBe(true);
  });

  it("cannot take a source's name", () => {
    const check = checkBlocks([query("a", "crm_deals", "select 1")], sources).get("a");
    expect(check?.ok === false && check.problem.message).toMatch(/same name as a source/);
  });

  it("name a source the reader cannot read as not there", () => {
    const check = checkBlocks([query("a", "a", "select * from payroll_pay")], sources).get("a");
    expect(check?.ok === false && check.problem.message).toMatch(/no table payroll_pay you can read/);
  });

  it("say what went wrong when Postgres refuses the query", async () => {
    const blocks = [query("a", "a", "select owner from crm_deals group by stage")];
    const results = await runBlocks(blocks, checkBlocks(blocks, sources), inputs());
    const result = results.get("a");
    expect(result?.ok === false && result.problem.message).toMatch(/must appear in the GROUP BY/);
  });
});

describe("a report's page as a custom report", () => {
  it("becomes one SQL block per data block, with the same display", async () => {
    const document = documentFromReport({
      key: "crm-deals",
      columns: COLUMNS,
      params: [{ key: "from", label: "Closing", type: "date", default: "yearStart" }],
      layout: {
        blocks: [
          { id: "figures", type: "figures" },
          { id: "by", type: "chart", form: "bars", by: "stage", half: true },
          { id: "trend", type: "chart", form: "trend", by: "closes", half: true },
          { id: "table", type: "table" },
        ],
      },
    });
    expect(document.period).toEqual({ from: "yearStart", to: null });
    expect(document.blocks.map((block) => block.type === "query" && [block.name, block.display.type, block.half ?? false])).toEqual([
      ["deals", "figures", false],
      ["deals_2", "chart", true],
      ["deals_3", "chart", true],
      ["deals_4", "table", false],
    ]);
    const figures = document.blocks[0];
    expect(figures?.type === "query" && figures.query).toBe("select count(*) as row_count,\n  sum(value) as value\nfrom crm_deals\n");
    // And every one of them runs.
    const checks = checkBlocks(document.blocks, sources);
    const results = await runBlocks(document.blocks, checks, inputs());
    expect([...results.values()].every((result) => result.ok)).toBe(true);
    const first = results.get(document.blocks[0]!.id);
    expect(first?.ok && first.rows[0]).toMatchObject({ row_count: 3, value: 220 });
  });
});
