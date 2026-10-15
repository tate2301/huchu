import { describe, expect, it } from "vitest";

import { EMPTY_PAYLOAD, LIBRARY_KINDS } from "./kinds";

const explore = (sql: string) => ({ answers: "Which quotes wait", product: "crm", sql });
const issue = (kind: "REPORT" | "EXPLORE" | "INSIGHT", payload: unknown) => {
  const parsed = LIBRARY_KINDS[kind].payload.safeParse(payload);
  return parsed.success ? null : parsed.error.issues[0]!.message;
};

describe("the library's reading kinds", () => {
  it("take a question Explore would run, over any report source", () => {
    expect(issue("EXPLORE", explore("select number, total from crm_quotes where total > 100"))).toBeNull();
    expect(issue("EXPLORE", explore("select stage, count(*) as deals from crm_deals group by stage"))).toBeNull();
  });

  it("refuse SQL the guard refuses: a change, a second statement, a table there is none of", () => {
    expect(issue("EXPLORE", explore("delete from crm_quotes"))).toMatch(/only reads/);
    expect(issue("EXPLORE", explore("select 1; select 2"))).toMatch(/One statement/);
    expect(issue("EXPLORE", explore("select * from \"User\""))).toMatch(/no table/i);
    expect(issue("INSIGHT", { sql: "update crm_quotes set total = 0", headline: "x", onlyWhenRows: true, product: "crm" })).toMatch(/only reads/);
  });

  it("name Explore's products, not others", () => {
    expect(issue("EXPLORE", { ...explore("select * from crm_quotes"), product: "tender" })).toBeNull();
    expect(issue("EXPLORE", { ...explore("select * from crm_quotes"), product: "gold" })).not.toBeNull();
  });

  it("check every block of a report, by its name", () => {
    const report = (query: string) => ({
      period: { from: "monthStart", to: "today" },
      blocks: [{ id: "q1", type: "query", name: "waiting", query, display: { type: "table" } }],
    });
    expect(issue("REPORT", report("select * from crm_quotes"))).toBeNull();
    expect(issue("REPORT", report("select * from payroll_secrets"))).toMatch(/^waiting: /);
  });

  it("start new items from payloads that already pass", () => {
    for (const kind of ["REPORT", "EXPLORE", "INSIGHT"] as const) {
      const empty = EMPTY_PAYLOAD[kind] as Record<string, unknown>;
      // A new Explore question still needs what it answers; everything else is ready to save.
      const filled = kind === "EXPLORE" ? { ...empty, answers: "Every quote" } : empty;
      expect(issue(kind, filled)).toBeNull();
    }
  });
});
