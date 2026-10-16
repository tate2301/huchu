import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import type { QueryBlock } from "@/lib/reports/custom/document";
import { checkBlocks, runBlocks } from "@/lib/reports/custom/run";
import { getReportDefinition } from "@/lib/reports/registry";
import { ReportDatabase } from "@/lib/reports/sql/engine";
import type { ReportRow } from "@/lib/reports/types";

import { insightFromResult, LIBRARY_INSIGHT_CAP, runnableInsights, type LibraryInsightQuestion } from "./insights";
import type { ReachedItem } from "./reach";

const quotes = getReportDefinition("crm-quotes")!;
const deals = getReportDefinition("crm-deals")!;

const item = (key: string, payload: Record<string, unknown>): ReachedItem => ({
  id: `id-${key}`,
  key,
  title: `Quotes waiting ${key}`,
  summary: null,
  publishedAt: new Date(),
  payload: { onlyWhenRows: true, product: "crm", ...payload },
});

const waiting = (key: string) =>
  item(key, {
    sql: "select count(*) as quotes, sum(total) as quoted from crm_quotes where lower(status) = 'sent' having count(*) > 0",
    headline: "{quotes} quotes are waiting",
    body: "{quoted} waits on an answer.",
  });

describe("library insights a person may run", () => {
  it("are those whose every table their role reads, with the source keys they read", () => {
    const onDeals = item("deals", { sql: "select count(*) as n from crm_deals", headline: "{n} deals" });
    const ran = runnableInsights([waiting("a"), onDeals], [quotes], true);
    expect(ran.questions.map((question) => question.key)).toEqual(["a"]);
    expect(ran.questions[0]!.reads).toEqual(["crm-quotes"]);
    expect(ran.tables.map((table) => table.name)).toEqual(["crm_quotes"]);
    expect(runnableInsights([waiting("a"), onDeals], [quotes, deals], false).questions).toHaveLength(2);
  });

  it("leave out a payload that no longer reads, and stop at the cap", () => {
    const broken = item("broken", { sql: "", headline: "" });
    const many = Array.from({ length: LIBRARY_INSIGHT_CAP + 3 }, (_, index) => waiting(`q${index}`));
    expect(runnableInsights([broken, ...many], [quotes], true).questions).toHaveLength(LIBRARY_INSIGHT_CAP);
  });
});

describe("a library insight's answer", () => {
  const question: LibraryInsightQuestion = runnableInsights([waiting("a")], [quotes], true).questions[0]!;
  const tables = runnableInsights([waiting("a")], [quotes], true).tables;
  let db: ReportDatabase;
  beforeAll(async () => {
    db = new ReportDatabase(await PGlite.create());
  }, 60_000);

  const run = async (rows: ReportRow[], version: string) => {
    const block: QueryBlock = { id: question.id, type: "query", name: "insight", query: question.sql, display: { type: "table" } };
    const results = await runBlocks([block], checkBlocks([block], tables), {
      runner: db,
      sources: tables,
      rows: () => rows,
      version: () => version,
      period: {},
    });
    return results.get(question.id);
  };

  it("fills the headline and line from its first row, money as money, and opens in Explore", async () => {
    const result = await run(
      [
        { id: "1", number: "Q-1", status: "Sent", total: 1200 },
        { id: "2", number: "Q-2", status: "Sent", total: 300.5 },
        { id: "3", number: "Q-3", status: "Accepted", total: 99 },
      ],
      "v1",
    );
    const insight = insightFromResult(question, result, true);
    expect(insight).toMatchObject({ id: "library:a", headline: "2 quotes are waiting", body: "$1,500.50 waits on an answer.", pin: null, vaneItemId: null });
    expect(insight?.question?.href).toMatch(/^\/explore\?sql=/);
    expect(insightFromResult(question, result, false)?.question).toBeNull();
  });

  it("says nothing when its answer has no rows and it only speaks when it has", async () => {
    const result = await run([{ id: "1", number: "Q-3", status: "Accepted", total: 99 }], "v2");
    expect(result?.ok && result.rows).toEqual([]);
    expect(insightFromResult(question, result, true)).toBeNull();
    // Told to speak anyway, a hole with no row reads as a dash.
    expect(insightFromResult({ ...question, onlyWhenRows: false }, result, true)?.headline).toBe("— quotes are waiting");
  });

  it("says nothing when its question failed", () => {
    expect(insightFromResult(question, { ok: false, problem: { message: "boom", from: 0, to: 1 }, running: true }, true)).toBeNull();
  });
});
