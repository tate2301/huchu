import { describe, expect, it } from "vitest";

import {
  boolParam,
  buildCompanyWhere,
  buildDealWhere,
  buildPersonWhere,
  buildRecordOrderBy,
  buildSiteWhere,
  customFieldParams,
  listParam,
  numberParam,
} from "./records";

const COMPANY = "company-1";
const USER = "user-1";

describe("buildPersonWhere", () => {
  it("always scopes to the tenant and hides archived and merged records", () => {
    expect(buildPersonWhere(COMPANY, {}, USER)).toEqual({
      companyId: COMPANY,
      mergedIntoId: null,
      archivedAt: null,
    });
  });

  it("shows archived records only when asked", () => {
    const where = buildPersonWhere(COMPANY, { includeArchived: true }, USER);
    expect(where).not.toHaveProperty("archivedAt");
    // A merged-away record is never listed — it redirects to its survivor.
    expect(where.mergedIntoId).toBeNull();
  });

  it("resolves mineOnly against the calling user", () => {
    const where = buildPersonWhere(COMPANY, { mineOnly: true }, USER);
    expect(where.AND).toContainEqual({ assignedToId: USER });
  });

  it("treats explicit owners and unassigned as alternatives", () => {
    const where = buildPersonWhere(COMPANY, { assignedToIds: ["u2"], unassigned: true }, USER);
    expect(where.AND).toContainEqual({
      OR: [{ assignedToId: { in: ["u2"] } }, { assignedToId: null }],
    });
  });

  it("filters on contact type", () => {
    const where = buildPersonWhere(COMPANY, { contactTypes: ["DECISION_MAKER"] }, USER);
    expect(where.AND).toContainEqual({ contactType: { in: ["DECISION_MAKER"] } });
  });

  it("searches name, email, phone, number and company", () => {
    const where = buildPersonWhere(COMPANY, { q: "dube" }, USER);
    const clause = (where.AND as Array<{ OR?: unknown[] }>).find((entry) => entry.OR);
    expect(clause?.OR).toHaveLength(5);
  });
});

describe("buildCompanyWhere", () => {
  it("filters on company type and account status", () => {
    const where = buildCompanyWhere(
      COMPANY,
      { companyTypes: ["SUPPLIER"], accountStatuses: ["ON_HOLD"] },
      USER,
    );
    expect(where.AND).toContainEqual({ companyType: { in: ["SUPPLIER"] } });
    expect(where.AND).toContainEqual({ accountStatus: { in: ["ON_HOLD"] } });
  });

  it("narrows to the children of one parent", () => {
    const where = buildCompanyWhere(COMPANY, { parentClientId: "parent-1" }, USER);
    expect(where.AND).toContainEqual({ parentClientId: "parent-1" });
  });
});

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

describe("buildSiteWhere", () => {
  it("filters by company and city", () => {
    const where = buildSiteWhere(COMPANY, { clientIds: ["c1"], cities: ["Harare"] });
    expect(where.AND).toContainEqual({ clientId: { in: ["c1"] } });
    expect(where.AND).toContainEqual({ city: { in: ["Harare"] } });
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
