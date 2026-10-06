import { describe, expect, it } from "vitest";

import { documentFromReport, type CustomBlock } from "@/lib/reports/custom/document";
import { checkBlocks, runBlocks, sourcesRead } from "@/lib/reports/custom/run";
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

const schemas = { reports: new Map([["crm-deals", COLUMNS]]) };
const inputs = { report: () => rows, params: {} };

function query(id: string, name: string, text: string): CustomBlock {
  return { id, type: "query", name, query: text, display: { type: "table" } };
}

describe("a custom report's blocks", () => {
  it("read each other whatever order they sit in", () => {
    const blocks = [
      query("b", "by_owner", "from @won\naggregate total = sum(value) by owner"),
      query("a", "won", 'from crm-deals\nwhere stage = "Won"'),
      { id: "h", type: "heading" as const, text: "Sales" },
    ];
    const checks = checkBlocks(blocks, schemas);
    expect(sourcesRead(checks)).toEqual(["crm-deals"]);
    const results = runBlocks(blocks, checks, inputs);
    const byOwner = results.get("b");
    expect(byOwner?.ok && byOwner.rows.map((row) => [row.owner, row.total])).toEqual([
      ["Rudo", 100],
      ["Tino", 50],
    ]);
  });

  it("say so when they read each other in a circle", () => {
    const blocks = [query("a", "a", "from @b"), query("b", "b", "from @a")];
    const checks = checkBlocks(blocks, schemas);
    expect([...checks.values()].every((check) => !check.ok)).toBe(true);
  });

  it("ask for a query when one is empty", () => {
    const checks = checkBlocks([query("a", "a", "  ")], schemas);
    const check = checks.get("a");
    expect(check?.ok === false && check.problem.message).toMatch(/Write a query/);
  });

  it("name a source the reader cannot read as not there", () => {
    const checks = checkBlocks([query("a", "a", "from payroll-pay")], schemas);
    const check = checks.get("a");
    expect(check?.ok === false && check.problem.message).toMatch(/no source payroll-pay you can read/);
  });
});

describe("a report's page as a custom report", () => {
  it("becomes one query block per data block, with the same display", () => {
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
    expect(figures?.type === "query" && figures.query).toBe("from crm-deals\naggregate rows = count(), value = sum(value)\n");
    // And every one of them checks.
    const checks = checkBlocks(document.blocks, schemas);
    expect([...checks.values()].every((check) => check.ok)).toBe(true);
  });
});
