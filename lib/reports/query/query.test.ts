import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { checkQuery, compileQuery, humanize, MAX_QUERY_ROWS, type QueryInputs, type QuerySchemas } from "@/lib/reports/query/compile";
import { completionsAt } from "@/lib/reports/query/complete";
import { parseQuery } from "@/lib/reports/query/parser";
import { REPORT_DEFINITIONS } from "@/lib/reports/registry";
import type { ReportColumn, ReportRow } from "@/lib/reports/types";

const DEALS: ReportColumn[] = [
  { key: "dealNo", label: "Deal", kind: "code" },
  { key: "client", label: "Customer", kind: "relation" },
  { key: "stage", label: "Stage", kind: "status" },
  { key: "owner", label: "Owner", kind: "text" },
  { key: "value", label: "Value", kind: "money", currency: "USD", total: "sum" },
  { key: "closes", label: "Expected close", kind: "date" },
  { key: "from", label: "From", kind: "text", hidden: true },
];

const CLIENTS: ReportColumn[] = [
  { key: "name", label: "Name", kind: "text" },
  { key: "region", label: "Region", kind: "text" },
];

const deals: ReportRow[] = [
  { id: "d1", dealNo: "D-1", client: "Acme", stage: "Won", owner: "Rudo", value: 1000, closes: "2026-01-05", from: "web" },
  { id: "d2", dealNo: "D-2", client: "Acme", stage: "Lost", owner: "Tino", value: 400, closes: "2026-01-20", from: "referral" },
  { id: "d3", dealNo: "D-3", client: "Bata", stage: "won", owner: "Rudo", value: 2500.5, closes: "2026-02-03", from: null },
  { id: "d4", dealNo: "D-4", client: "Chido", stage: "Open", owner: null, value: null, closes: "2026-02-28", from: "web" },
];

const clients: ReportRow[] = [
  { id: "c1", name: "acme", region: "North" },
  { id: "c2", name: "Bata", region: "South" },
];

const schemas: QuerySchemas = {
  reports: new Map([
    ["crm-deals", DEALS],
    ["crm-clients", CLIENTS],
  ]),
};

const inputs: QueryInputs = {
  report: (key) => (key === "crm-deals" ? deals : key === "crm-clients" ? clients : []),
  block: () => [],
  params: { from: "2026-01-01", to: "2026-01-31" },
};

function run(text: string) {
  return compileQuery(text, schemas).run(inputs);
}

function problem(text: string) {
  const result = checkQuery(text, schemas);
  if (result.ok) throw new Error("expected a problem");
  return result.problem;
}

describe("reading a query", () => {
  it("reads steps one per line, or separated by |", () => {
    const lines = parseQuery("from crm-deals\nwhere value > 1\ntake 2");
    const piped = parseQuery("from crm-deals | where value > 1 | take 2");
    expect(lines.steps.map((step) => step.type)).toEqual(["from", "where", "take"]);
    expect(piped.steps.map((step) => step.type)).toEqual(["from", "where", "take"]);
  });

  it("reads a hyphenated source as one name", () => {
    const { steps } = parseQuery("from crm-deals");
    expect(steps[0]).toMatchObject({ type: "from", source: { kind: "report", key: "crm-deals" } });
  });

  it("reads a step word mid-line as a column", () => {
    expect(run('from crm-deals\nwhere from = "web"').rows.map((row) => row.dealNo)).toEqual(["D-1", "D-4"]);
  });

  it("says to start a step on its own line", () => {
    expect(problem("from crm-deals where value > 1").message).toMatch(/new line/);
  });

  it("points at what is wrong", () => {
    const found = problem("from crm-deals\nwhere valu > 10");
    expect(found.message).toBe("There is no column valu here. Did you mean value?");
    expect(found.span).toEqual({ from: 21, to: 25 });
  });

  it("ignores comments", () => {
    expect(run("-- every deal\nfrom crm-deals -- the lot\ntake 1").rows).toHaveLength(1);
  });
});

describe("running a query", () => {
  it("passes a source through with its columns as the report has them", () => {
    const result = run("from crm-deals");
    expect(result.columns).toEqual(DEALS);
    expect(result.rows).toHaveLength(4);
    expect(result.rows[0]).toMatchObject({ dealNo: "D-1", value: 1000 });
  });

  it("filters with text compared regardless of case", () => {
    expect(run('from crm-deals\nwhere stage = "won"').rows.map((row) => row.dealNo)).toEqual(["D-1", "D-3"]);
    expect(run('from crm-deals\nwhere stage in ("lost", "open")').rows.map((row) => row.dealNo)).toEqual(["D-2", "D-4"]);
    expect(run('from crm-deals\nwhere client like "a%"').rows.map((row) => row.dealNo)).toEqual(["D-1", "D-2"]);
    expect(run("from crm-deals\nwhere owner is null").rows.map((row) => row.dealNo)).toEqual(["D-4"]);
  });

  it("treats a blank as different from every value", () => {
    expect(run('from crm-deals\nwhere owner != "Rudo"').rows.map((row) => row.dealNo)).toEqual(["D-2", "D-4"]);
    expect(run("from crm-deals\nwhere value > 0").rows).toHaveLength(3);
  });

  it("reads the report's dates as $from and $to", () => {
    const rows = run("from crm-deals\nwhere closes >= $from and closes <= $to").rows;
    expect(rows.map((row) => row.dealNo)).toEqual(["D-1", "D-2"]);
  });

  it("derives columns typed from what they are made of", () => {
    const result = run("from crm-deals\nderive vat = value * 0.15, label = dealNo + \" · \" + client");
    expect(result.columns.find((column) => column.key === "vat")).toEqual({ key: "vat", label: "Vat", kind: "money", currency: "USD" });
    expect(result.rows[0]).toMatchObject({ vat: 150, label: "D-1 · Acme" });
    expect(result.rows[3]!.vat).toBeNull();
  });

  it("totals across the whole table in a derive, as a share", () => {
    const result = run("from crm-deals\nwhere value > 0\nderive share = round(percent(value, sum(value)), 1)");
    expect(result.rows.map((row) => row.share)).toEqual([25.6, 10.3, 64.1]);
  });

  it("aggregates by groups, in the order they first appear", () => {
    const result = run("from crm-deals\naggregate total = sum(value), deals = count() by owner\nsort total desc");
    expect(result.columns.map((column) => [column.key, column.kind])).toEqual([
      ["owner", "text"],
      ["total", "money"],
      ["deals", "number"],
    ]);
    expect(result.rows.map((row) => [row.owner, row.total, row.deals])).toEqual([
      ["Rudo", 3500.5, 2],
      ["Tino", 400, 1],
      [null, null, 1],
    ]);
  });

  it("aggregates the whole table into one row without by", () => {
    const result = run("from crm-deals\naggregate total = sum(value), biggest = max(value), people = count_distinct(owner)");
    expect(result.rows).toEqual([{ id: "1", total: 3900.5, biggest: 2500.5, people: 2 }]);
  });

  it("buckets dates for a trend", () => {
    const result = run("from crm-deals\naggregate total = sum(value) by month = month(closes)\nsort month");
    expect(result.columns[0]).toMatchObject({ key: "month", kind: "date" });
    expect(result.rows.map((row) => [row.month, row.total])).toEqual([
      ["2026-01-01", 1400],
      ["2026-02-01", 2500.5],
    ]);
  });

  it("joins another source by matching values, keeping unmatched rows", () => {
    const result = run("from crm-deals\njoin crm-clients as c on client = c.name\nselect dealNo, region = c.region");
    expect(result.rows.map((row) => row.region)).toEqual(["North", "North", "South", null]);
  });

  it("drops unmatched rows on an inner join", () => {
    const result = run("from crm-deals\ninner join crm-clients as c on client = c.name");
    expect(result.rows).toHaveLength(3);
    expect(result.columns.map((column) => column.key)).toContain("c.region");
  });

  it("sorts with blanks last either way, and takes the first rows", () => {
    expect(run("from crm-deals\nsort value desc\ntake 2").rows.map((row) => row.dealNo)).toEqual(["D-3", "D-1"]);
    expect(run("from crm-deals\nsort value").rows.map((row) => row.dealNo)).toEqual(["D-2", "D-1", "D-3", "D-4"]);
  });

  it("selects and drops columns, showing a selected one the report hides", () => {
    expect(run("from crm-deals\nselect dealNo, from").columns).toEqual([
      DEALS[0],
      { ...DEALS[6], hidden: undefined },
    ]);
    expect(run("from crm-deals\ndrop from, closes").columns.map((column) => column.key)).toEqual([
      "dealNo",
      "client",
      "stage",
      "owner",
      "value",
    ]);
  });

  it("finds a column by its label in backticks", () => {
    expect(run("from crm-deals\nselect `Expected close`").columns[0]!.key).toBe("closes");
  });

  it("reads another block's result", () => {
    const won = compileQuery('from crm-deals\nwhere stage = "won"', schemas);
    const blocks = new Map([["won", won.columns]]);
    const query = compileQuery("from @won\naggregate n = count()", { ...schemas, blocks });
    expect(query.blocks).toEqual(["won"]);
    const result = query.run({ ...inputs, block: () => won.run(inputs).rows });
    expect(result.rows[0]!.n).toBe(2);
  });

  it("stops a join that multiplies past the limit", () => {
    const many = Array.from({ length: 300 }, (_, index) => ({ id: String(index), k: "x" }));
    const wide = { reports: new Map([["a", [{ key: "k", label: "K", kind: "text" as const }]]]) };
    const query = compileQuery("from a\njoin a as b on k = b.k", wide);
    expect(() => query.run({ ...inputs, report: () => many })).toThrow(String(MAX_QUERY_ROWS.toLocaleString("en-US")));
  });
});

describe("checking a query", () => {
  it.each([
    ["from crm-nope", /There is no source crm-nope/],
    ["where value > 1", /starts with from/],
    ["from crm-deals\naggregate sum(value)", /Give this a name/],
    ["from crm-deals\naggregate total = sum(value) + value", /differs from row to row/],
    ["from crm-deals\naggregate total = sum(owner)", /sum needs numbers/],
    ["from crm-deals\naggregate n = count() by m = max(value)", /by groups by a value from each row/],
    ["from crm-deals\nwhere sum(max(value)) > 1", /One total cannot sit inside another/],
    ["from crm-deals\nderive x = owner * 2", /works on numbers/],
    ["from crm-deals\nderive x = rond(value)", /Did you mean round/],
    ["from crm-deals\nderive id = 1", /id is kept/],
    ["from crm-deals\nwhere closes > $start", /There is no \$start/],
    ["from crm-deals\njoin crm-clients as c on client > c.name", /matches with =/],
    ["from crm-deals\ntake 0", /whole number/],
    ['from crm-deals\nwhere stage = "won', /not closed/],
  ])("%s", (text, message) => {
    expect(problem(text).message).toMatch(message);
  });
});

describe("humanize", () => {
  it("turns a name into a label", () => {
    expect(humanize("wonValue")).toBe("Won value");
    expect(humanize("won_value")).toBe("Won value");
    expect(humanize("deals")).toBe("Deals");
  });
});

describe("completing a query", () => {
  const labels = (text: string, offset = text.length) =>
    completionsAt(text, offset, schemas)?.options.map((option) => option.label) ?? null;

  it("offers sources after from and join", () => {
    expect(labels("from crm-")).toEqual(["crm-deals", "crm-clients"]);
    expect(completionsAt("from crm-", 9, schemas)?.from).toBe(5);
  });

  it("offers steps where a step can start", () => {
    expect(labels("from crm-deals\n")).toContain("where");
    expect(labels("from crm-deals | ")).toEqual(expect.arrayContaining(["aggregate", "inner join"]));
  });

  it("offers the columns the table has by that step", () => {
    const options = labels("from crm-deals\nderive vat = value * 0.15\nwhere v");
    expect(options).toEqual(expect.arrayContaining(["value", "vat", "sum", "round"]));
  });

  it("offers nothing inside text", () => {
    expect(labels('from crm-deals\nwhere stage = "wo')).toBeNull();
  });
});

describe("the examples in docs/reports/custom-reports.md", () => {
  // Checked against the real sources, so the documentation cannot drift from them.
  const real: QuerySchemas = { reports: new Map(REPORT_DEFINITIONS.map((definition) => [definition.key, definition.columns])) };
  const doc = readFileSync(path.join(process.cwd(), "docs/reports/custom-reports.md"), "utf8");
  const examples = [...doc.matchAll(/```\n((?:--.*\n)?from [\s\S]*?)```/g)].map((match) => match[1]!);

  it("are there to check", () => {
    expect(examples.length).toBeGreaterThanOrEqual(4);
  });

  it.each(examples)("%s", (text) => {
    const checked = checkQuery(text, real);
    expect(checked.ok ? null : checked.problem.message).toBeNull();
  });
});
