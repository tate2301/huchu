import { describe, expect, it } from "vitest";

import {
  boolParam,
  buildDealWhere,
  buildRecordOrderBy,
  customFieldParams,
  listParam,
  numberParam,
} from "./records";

const COMPANY = "company-1";
const USER = "user-1";

describe("buildDealWhere", () => {
  it("scopes to the tenant and hides archived deals", () => {
    expect(buildDealWhere(COMPANY, {}, USER)).toEqual({ companyId: COMPANY, archivedAt: null });
  });

  it("builds a bounded value range", () => {
    const where = buildDealWhere(COMPANY, { valueMin: 100, valueMax: 900 }, USER);
    expect(where.AND).toContainEqual({ value: { gte: 100, lte: 900 } });
  });

  it("filters to deals carrying an overdue task", () => {
    const where = buildDealWhere(COMPANY, { overdueOnly: true }, USER);
    const clause = (where.AND as Array<{ followUps?: { some?: { status?: string } } }>).find(
      (entry) => entry.followUps,
    );
    expect(clause?.followUps?.some?.status).toBe("PENDING");
  });

  it("filters by forecast category", () => {
    const where = buildDealWhere(COMPANY, { forecastCategories: ["COMMIT"] }, USER);
    expect(where.AND).toContainEqual({ forecastCategory: { in: ["COMMIT"] } });
  });

  it("searches title, number, company and primary contact", () => {
    const where = buildDealWhere(COMPANY, { q: "roof" }, USER);
    const clause = (where.AND as Array<{ OR?: unknown[] }>).find((entry) => entry.OR);
    expect(clause?.OR).toHaveLength(4);
  });
});

describe("custom field filters", () => {
  it("folds a custom-field filter into a JSON path clause", () => {
    const where = buildDealWhere(COMPANY, { customFields: { budget_confirmed: "yes" } }, USER);
    expect(where.AND).toContainEqual({
      customFields: { path: ["budget_confirmed"], equals: "yes" },
    });
  });

  it("ignores empty custom-field values rather than matching nothing", () => {
    const where = buildDealWhere(COMPANY, { customFields: { budget: "" } }, USER);
    expect(where.AND).toBeUndefined();
  });
});

describe("buildRecordOrderBy", () => {
  it("honours a sortable column", () => {
    expect(buildRecordOrderBy("DEAL", { field: "value", direction: "asc" })).toEqual({
      value: "asc",
    });
  });

  it("falls back to updatedAt for a column that isn't sortable", () => {
    // Sorting by an arbitrary client-supplied column would be an injection route.
    expect(buildRecordOrderBy("DEAL", { field: "customFields", direction: "asc" })).toEqual({
      updatedAt: "desc",
    });
  });

  it("falls back for an unknown entity", () => {
    expect(buildRecordOrderBy("WIDGET", { field: "name", direction: "asc" })).toEqual({
      updatedAt: "desc",
    });
  });
});

describe("query param helpers", () => {
  it("splits a comma list and drops blanks", () => {
    expect(listParam(new URLSearchParams("ids=a,,b"), "ids")).toEqual(["a", "b"]);
    expect(listParam(new URLSearchParams("ids="), "ids")).toBeUndefined();
  });

  it("reads 1 and true as true", () => {
    expect(boolParam(new URLSearchParams("x=1"), "x")).toBe(true);
    expect(boolParam(new URLSearchParams("x=true"), "x")).toBe(true);
    expect(boolParam(new URLSearchParams("x=0"), "x")).toBe(false);
    expect(boolParam(new URLSearchParams(), "x")).toBeUndefined();
  });

  it("ignores an unparseable number", () => {
    expect(numberParam(new URLSearchParams("v=12.5"), "v")).toBe(12.5);
    expect(numberParam(new URLSearchParams("v=abc"), "v")).toBeUndefined();
  });

  it("collects cf.* params, splitting multi-values", () => {
    expect(customFieldParams(new URLSearchParams("cf.budget=1000&cf.tags=a,b&q=x"))).toEqual({
      budget: "1000",
      tags: ["a", "b"],
    });
  });

  it("returns undefined when there are no custom-field params", () => {
    expect(customFieldParams(new URLSearchParams("q=x"))).toBeUndefined();
  });
});
