import { describe, expect, it } from "vitest";

import { checkQuestion } from "./guard";
import { historyOf, questionLine, runResult, withOwners } from "./runs";
import { overTables, productOfTable, realTable, tablesInScope } from "./tables";
import { TABLE_TEMPLATES, templateBySlug } from "./templates";

const deal = { table: "CrmDeal", columns: [{ column: "id", udt: "text" }, { column: "dealNo", udt: "text" }, { column: "value", udt: "numeric" }, { column: "createdAt", udt: "timestamp" }] };
const invoice = { table: "SalesInvoice", columns: [{ column: "id", udt: "text" }, { column: "total", udt: "numeric" }] };
const employee = { table: "Employee", columns: [{ column: "id", udt: "text" }, { column: "name", udt: "text" }] };

describe("the real tables, as Explore names them", () => {
  it("writes a table and its columns lower case with underscores, typed by Postgres", () => {
    const table = realTable(deal, 96);
    expect(table).toMatchObject({ key: "CrmDeal", name: "crm_deal", product: "crm", rows: 96 });
    expect(table.columns.map((column) => [column.key, column.sql, column.kind])).toEqual([
      ["id", "id", "text"],
      ["dealNo", "deal_no", "text"],
      ["value", "value", "number"],
      ["createdAt", "created_at", "date"],
    ]);
  });

  it("files a table under its product, and none for the workspace's own", () => {
    expect(productOfTable("SalesInvoice")).toBe("books");
    expect(productOfTable("RetailSale")).toBe("tender");
    expect(productOfTable("Company")).toBeNull();
  });

  it("gives a role its products' tables, and the others locked with who reads them", () => {
    const scope = tablesInScope([deal, invoice, employee], ["crm", "books"], [{ product: "people", who: "Owners" }]);
    expect(scope.tables.map((table) => table.name)).toEqual(["crm_deal", "sales_invoice"]);
    expect(scope.locked).toEqual([{ name: "employee", key: "Employee", product: "people", who: "Owners" }]);
  });
});

describe("a question over the real tables", () => {
  const tables = [realTable(deal), realTable(invoice)];
  const period = { from: "2025-10-15", to: "2026-10-15" };

  it("reads each table it names through a with over the real one, granted columns only", () => {
    const sql = overTables("select deal_no, value from crm_deal", ["crm_deal"], tables, period);
    expect(sql).toBe(
      'with "crm_deal" as not materialized (select "id" as "id", "dealNo" as "deal_no", "value" as "value", "createdAt" as "created_at" from "CrmDeal")\nselect deal_no, value from crm_deal',
    );
  });

  it("joins the question's own with, and reads a report's dates as the question's year", () => {
    const sql = overTables("with big as (select * from crm_deal where value > 10) select * from big where created_at >= period_start()", ["crm_deal"], tables, period);
    expect(sql.startsWith('with "crm_deal" as not materialized (')).toBe(true);
    expect(sql).toContain("),\nbig as (select * from crm_deal where value > 10)");
    expect(sql).toContain("created_at >= date '2025-10-15'");
  });

  it("is still refused when it changes anything or reads a table the role does not", () => {
    const readable = new Set(tables.map((table) => table.name));
    expect(checkQuestion("update crm_deal set value = 0", readable).ok).toBe(false);
    expect(checkQuestion('select * from "Company"', readable).ok).toBe(false);
    expect(checkQuestion("select 1; select 2", readable).ok).toBe(false);
    expect(checkQuestion("select deal_no from crm_deal", readable).ok).toBe(true);
  });

  it("has templates over the tables that pass the guard, under the slugs the reports' use", () => {
    for (const template of TABLE_TEMPLATES) {
      expect(templateBySlug(template.slug), template.slug).not.toBeNull();
      const named = new Set([...template.sql.matchAll(/\b(?:from|join)\s+([a-z_]+)/g)].map((match) => match[1]!));
      expect(checkQuestion(template.sql, named).ok, template.slug).toBe(true);
    }
    expect(templateBySlug("open-quotes", "tables")).toBeNull();
  });
});

describe("the log", () => {
  const at = (minutes: number) => new Date(Date.UTC(2026, 9, 15, 10, minutes));

  it("lists each question once, newest first, and none refused", () => {
    const history = historyOf([
      { id: "3", title: null, sql: "select * from crm_deal", createdAt: at(30), rows: 4, result: "OK" },
      { id: "2", title: null, sql: "update crm_deal set value = 0", createdAt: at(20), rows: null, result: "REFUSED" },
      { id: "1", title: "Deals", sql: "select * from crm_deal", createdAt: at(10), rows: 4, result: "OK" },
      { id: "0", title: "Owed", sql: "select * from sales_invoice", createdAt: at(5), rows: 12, result: "OK" },
    ]);
    expect(history.map((entry) => [entry.id, entry.line])).toEqual([
      ["3", "select * from crm_deal"],
      ["0", "Owed"],
    ]);
  });

  it("names a question by its title, else its first line of SQL", () => {
    expect(questionLine("Open quotes", "select 1")).toBe("Open quotes");
    expect(questionLine("Untitled question", "-- note\nselect *\nfrom crm_deal")).toBe("select *");
  });

  it("says how each run ended", () => {
    expect(runResult({ rows: 142, ms: 40, result: "OK", reason: null }).text).toBe("142 rows · 0.04 s");
    expect(runResult({ rows: null, ms: null, result: "REFUSED", reason: "Explore only reads. A change is refused before it runs, and nothing was changed." })).toEqual({
      text: "refused, a change",
      tone: "warning",
    });
  });

  it("always lets owners use Explore", () => {
    expect(withOwners(["MANAGER"])).toEqual(["SUPERADMIN", "MANAGER"]);
    expect(withOwners([])).toEqual(["SUPERADMIN"]);
  });
});
