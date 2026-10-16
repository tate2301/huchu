import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { REPORT_DEFINITIONS } from "@/lib/reports/registry";
import { sqlName } from "@/lib/reports/sql/schema";
import { parseSchema, readerAccess } from "@/lib/vane/reader-access";

import { canUseExplore, whoReads } from "./access";
import { askPrompt } from "./ask";
import { checkQuestion } from "./guard";
import { byProduct, exploreTable, productOf, searchTables } from "./products";
import { exploreHref, questionDocument, questionSql, readSlug } from "./questions";
import { exploreReadable, exploreReaderSql, scopeTables } from "./reader-access";
import { describeSteps } from "./steps";
import { EXPLORE_TEMPLATES, templatesFor, templateTitle } from "./templates";

const every = new Set(REPORT_DEFINITIONS.map((definition) => sqlName(definition.key)));

describe("the guard", () => {
  const readable = new Set(["crm_quotes", "crm_site_visits", "books_owed_by_age"]);
  const locked = new Map([["payroll_pay", "Managers"]]);

  it("lets one select over the person's tables through", () => {
    const checked = checkQuestion("select number, total from crm_quotes order by total desc;", readable, locked);
    expect(checked).toMatchObject({ ok: true, tables: ["crm_quotes"], body: "select number, total from crm_quotes order by total desc" });
  });

  it("refuses a change before it runs, and names what it would have changed", () => {
    const checked = checkQuestion("update invoices\nset state = 'paid'\nwhere number = 'INV-0131';", readable, locked);
    expect(checked.ok).toBe(false);
    if (checked.ok) return;
    expect(checked.refusal).toMatchObject({ kind: "change", verb: "update", table: "invoices" });
    expect(checked.refusal.message).toMatch(/^Explore only reads/);
  });

  it("refuses statements the parser cannot read but that change things", () => {
    for (const sql of ["truncate crm_quotes", "vacuum crm_quotes", "drop table crm_quotes", "delete from crm_quotes"]) {
      const checked = checkQuestion(sql, readable, locked);
      expect(checked.ok ? null : checked.refusal.kind).toBe("change");
    }
  });

  it("refuses a second statement", () => {
    const checked = checkQuestion("select 1 from crm_quotes; select 2 from crm_quotes", readable, locked);
    expect(checked.ok ? null : checked.refusal.kind).toBe("second");
  });

  it("says who reads a table the person's role does not", () => {
    const checked = checkQuestion("select * from payroll_pay", readable, locked);
    expect(checked.ok ? null : checked.refusal).toMatchObject({ kind: "locked", table: "payroll_pay", who: "Managers" });
  });

  it("underlines anything else where it is, in Explore's words", () => {
    const checked = checkQuestion("select * from nowhere", readable, locked);
    expect(checked.ok ? null : checked.refusal.kind).toBe("problem");
    const fn = checkQuestion("select pg_sleep(10) from crm_quotes", readable, locked);
    expect(fn.ok ? null : fn.problem.message).toMatch(/functions a question can use/);
  });
});

describe("steps", () => {
  it("reads a question back clause by clause", () => {
    const steps = describeSteps(`select v.scheduled, c.number, q.total
from crm_site_visits v
join crm_quotes q on q.customer = v.client
left join books_owed_by_age c on c.customer = v.client
where v.scheduled >= '2026-09-01' and (q.status is null or q.status <> 'Accepted')
order by q.total desc nulls last;`);
    expect(steps.map((step) => step.text)).toEqual([
      "Start from crm_site_visits",
      "Bring in crm_quotes and books_owed_by_age",
      "Keep rows where v.scheduled >= '2026-09-01' and (q.status is null or q.status <> 'Accepted')",
      "Sort by q.total, biggest first",
    ]);
  });

  it("names a grouping and what it works out", () => {
    const steps = describeSteps("select rep, count(*) as visits from crm_site_visits group by rep order by visits desc limit 5");
    expect(steps.map((step) => step.text)).toEqual([
      "Start from crm_site_visits",
      "Group by rep, and work out visits",
      "Sort by visits, biggest first",
      "Keep the first 5",
    ]);
  });

  it("reads a change as the step Explore does not have", () => {
    expect(describeSteps("update invoices set state = 'paid' where number = 'INV-0131'")).toEqual([
      { icon: "step", text: "Start from invoices" },
      { icon: "x", text: "Change is not a step Explore has" },
    ]);
  });
});

describe("products and tables", () => {
  it("files each source under its product", () => {
    expect(productOf("crm-site-visits")).toBe("crm");
    expect(productOf("books-owed-by-age")).toBe("books");
    expect(productOf("retail-sales")).toBe("tender");
    expect(productOf("payroll-pay")).toBe("people");
    expect(productOf("downtime")).toBe("operations");
  });

  it("lists products in order and finds tables by a column", () => {
    const tables = REPORT_DEFINITIONS.filter((d) => ["crm-quotes", "books-owed-by-age", "crm-deals"].includes(d.key)).map(exploreTable);
    expect(byProduct(tables).map((group) => [group.product.name, group.tables.map((table) => table.name)])).toEqual([
      ["CRM", ["crm_deals", "crm_quotes"]],
      ["Books", ["books_owed_by_age"]],
    ]);
    expect(searchTables(tables, "days_late").map((hit) => [hit.table.name, hit.columns])).toEqual([["books_owed_by_age", ["days_late"]]]);
  });
});

describe("templates", () => {
  it("each reads only report sources, and passes the guard", () => {
    for (const template of EXPLORE_TEMPLATES) {
      const checked = checkQuestion(template.sql, every);
      expect(checked.ok ? template.slug : `${template.slug}: ${checked.problem.message}`).toBe(template.slug);
    }
    expect(new Set(EXPLORE_TEMPLATES.map((template) => template.slug)).size).toBe(EXPLORE_TEMPLATES.length);
  });

  it("are offered only to someone who reads every table they read", () => {
    const offered = templatesFor(new Set(["crm_quotes"])).map((template) => template.slug);
    expect(offered).toEqual(["quotes-waiting", "quotes-open", "quoted-by-month"]);
    expect(templateTitle({ title: "Open quotes since {lastMonth}" }, new Date(2026, 9, 15))).toBe("Open quotes since September");
    expect(templateTitle({ title: "Open quotes since {lastMonth}" }, new Date(2027, 0, 3))).toBe("Open quotes since December");
  });
});

describe("saved questions", () => {
  it("are custom reports with one table", () => {
    const document = questionDocument("select * from crm_quotes");
    expect(questionSql({ document })).toBe("select * from crm_quotes");
    expect(questionSql({ document: { ...document, blocks: [...document.blocks, { id: "t", type: "text", text: "x" }] } })).toBeNull();
  });

  it("open by id, and templates by slug", () => {
    expect(readSlug("6f1c2a9e-1111-4c2d-9a8b-0123456789ab")).toEqual({ kind: "saved", id: "6f1c2a9e-1111-4c2d-9a8b-0123456789ab" });
    expect(readSlug("open-quotes")).toEqual({ kind: "template", slug: "open-quotes" });
    expect(exploreHref({ ask: "how much did we quote in september" })).toBe("/explore?ask=how+much+did+we+quote+in+september");
  });
});

describe("explore_reader's access", () => {
  const schema = readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const access = readerAccess(parseSchema(schema));

  it("reads what Vane's reader reads, less pay and Vane's and Explore's own tables", () => {
    const tables = new Set(exploreReadable(access).map((table) => table.table));
    expect(tables.has("SalesInvoice")).toBe(true);
    for (const table of ["PayrollRun", "VaneItem", "VaneMessage", "ExploreQuestionRun", "ExploreReaderScope", "VaneReaderScope", "Session"]) {
      expect(tables.has(table), table).toBe(false);
    }
    const employee = exploreReadable(access).find((table) => table.table === "Employee");
    expect(employee?.columns.some((column) => /phone|bank/i.test(column))).toBe(false);
  });

  it("binds every table to the workspace and the person's tables", () => {
    const sql = exploreReaderSql(access);
    expect(sql).toContain(`CREATE POLICY "explore_own_pid" ON "ExploreReaderScope"`);
    expect(sql).toMatch(/CREATE POLICY "explore_workspace" ON "SalesInvoice" AS RESTRICTIVE FOR SELECT TO explore_reader USING \('SalesInvoice' = ANY/);
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)/);
  });

  it("is the SQL in the migrations: its own, and the tables and columns added since", () => {
    const migrations = readdirSync(path.join(process.cwd(), "prisma/migrations"))
      .filter((name) => name >= "20261016100000_explore_reader" && !name.endsWith(".toml"))
      .map((name) => readFileSync(path.join(process.cwd(), "prisma/migrations", name, "migration.sql"), "utf8"))
      .join("\n");
    const granted = (sql: string) => {
      const columns = new Map<string, Set<string>>();
      for (const [, list, table] of sql.matchAll(/^GRANT SELECT \((.+)\) ON "(\w+)" TO explore_reader;$/gm)) {
        const own = columns.get(table!) ?? new Set<string>();
        for (const column of list!.split(", ")) own.add(column);
        columns.set(table!, own);
      }
      return Object.fromEntries([...columns].map(([table, own]) => [table, [...own].sort()]));
    };
    const wanted = exploreReaderSql(access);
    expect(granted(migrations)).toEqual(granted(wanted));
    for (const policy of wanted.split("\n").filter((line) => line.startsWith("CREATE POLICY"))) expect(migrations).toContain(policy);
  });

  it("scopes a role to its products' tables", () => {
    const readable = exploreReadable(access).map((table) => table.table);
    const crm = scopeTables(["crm"], readable);
    expect(crm.length).toBeGreaterThan(3);
    expect(crm.every((table) => table.startsWith("Crm"))).toBe(true);
    expect(scopeTables(["books"], readable)).toContain("SalesInvoice");
  });
});

describe("asking Vane", () => {
  it("tells Vane only the person's tables, and what is on screen for Change this", () => {
    const tables = REPORT_DEFINITIONS.filter((d) => d.key === "crm-quotes").map(exploreTable);
    const prompt = askPrompt({ question: "only the sent ones", mode: "change", sql: "select * from crm_quotes" }, tables, "There is no table quotes you can read.");
    expect(prompt).toContain("crm_quotes (Quotes): number code, customer relation");
    expect(prompt).toContain("The question on screen now:\nselect * from crm_quotes\n\nChange it so that: only the sent ones");
    expect(prompt).toContain("Your last answer was refused: There is no table quotes you can read.");
    expect(askPrompt({ question: "quotes in september", mode: "new" }, tables)).toContain("Question: quotes in september");
  });
});

describe("who reads what", () => {
  it("names roles the way people say them", () => {
    expect(whoReads(["SUPERADMIN", "MANAGER"])).toBe("Owners and managers");
    expect(whoReads(["SUPERADMIN", "MANAGER", "FINANCE_OFFICER"])).toBe("Owners, managers and finance officers");
    expect(canUseExplore("MANAGER")).toBe(true);
    expect(canUseExplore("CLERK")).toBe(false);
  });
});
