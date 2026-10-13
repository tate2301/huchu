import { describe, expect, it } from "vitest";

import { reportSuggestions, reportTarget, toReportSuggestion } from "./status";

const suggestion = (id: string, target: string, sql: string | null = "select rep as fitter, count(*) as visits\nfrom crm_visit_forms\ngroup by rep\n") => ({
  id,
  headline: "by fitter",
  body: "You narrow this board by fitter every Monday. I wrote the question; let's keep it and add it as a table.",
  sql,
  action: { label: "Keep", target },
});

describe("Vane's suggestions for a report", () => {
  it("knows the report an action points at", () => {
    expect(reportTarget({ target: "/reports/c/r1/edit" })).toBe("r1");
    expect(reportTarget({ target: "/reports/c/r1?from=2026-07-01" })).toBe("r1");
    expect(reportTarget({ target: "/reports/crm-deals" })).toBeNull();
    expect(reportTarget(null)).toBeNull();
  });

  it("offers only suggestions for this report that carry their SQL", () => {
    expect(toReportSuggestion(suggestion("a", "/reports/c/r1/edit"), "r1")).toEqual({
      id: "a",
      name: "by fitter",
      note: "You narrow this board by fitter every Monday. I wrote the question; let's keep it and add it as a table.",
      sql: "select rep as fitter, count(*) as visits\nfrom crm_visit_forms\ngroup by rep\n",
    });
    expect(toReportSuggestion(suggestion("b", "/reports/c/r2/edit"), "r1")).toBeNull();
    expect(toReportSuggestion(suggestion("c", "/reports/c/r1/edit", null), "r1")).toBeNull();
  });

  it("reads open suggestions this person can see, and keeps this report's", async () => {
    let where: unknown = null;
    const db = {
      vaneItem: {
        findMany: async (args: { where: unknown }) => {
          where = args.where;
          return [suggestion("a", "/reports/c/r1/edit"), suggestion("b", "/books/invoices")];
        },
      },
    } as unknown as Parameters<typeof reportSuggestions>[0];
    const found = await reportSuggestions(db, { companyId: "c1", userId: "u1", role: "MANAGER", reportId: "r1" });
    expect(found.map((entry) => entry.id)).toEqual(["a"]);
    expect(where).toMatchObject({ companyId: "c1", status: "OPEN", kind: "SUGGESTION" });
  });
});
