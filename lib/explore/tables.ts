import type { ReportColumnKind } from "@/lib/reports/types";
import { humanize } from "@/lib/reports/sql/columns";
import { sqlName } from "@/lib/reports/sql/schema";

import type { ExploreTable, LockedTable, ProductKey } from "./products";

/**
 * The workspace's real tables, as Explore shows and reads them through its
 * own login (`explore_reader`, `lib/explore/reader.ts`).
 *
 * Postgres names them the way the app's code does (`CrmDeal`, `dealNo`), which
 * a question would have to quote. Explore writes them the way the report
 * sources are written, lower case with underscores, so nobody quotes
 * anything: `crm_deal`, `deal_no`. A question names those; before it runs,
 * each table it reads becomes a `with` over the real one that selects only
 * the columns `explore_reader` is granted, under their Explore names. The
 * names stay singular, as the tables are, so they never collide with a report
 * source (`crm_deals`).
 */

/** What `explore_reader` is granted on one table, with each column's Postgres type. */
export type GrantedTable = { table: string; columns: Array<{ column: string; udt: string }> };

/** The real tables behind each product, by name: a role that reads a product's reports reads these. */
const PRODUCT_TABLES: Record<ProductKey, RegExp> = {
  crm: /^Crm/,
  books: /^(Sales|Journal|Bank|Customer$|Accounting|Tax|Purchase|Supplier|Fiscal|Expense|ChartOfAccount)/,
  tender: /^Retail/,
  people: /^(Employee|Payroll|Leave|Department|JobGrade|Position)/,
  schools: /^School/,
  operations: /^(Gold|Shift|Plant|Downtime|Equipment|WorkOrder|Stock|Inventory|Fuel|Compliance|Incident|Site|Section)/,
};

const PRODUCT_ORDER: readonly ProductKey[] = ["crm", "books", "tender", "people", "schools", "operations"];

/** The product a real table belongs to, or null for one no product reads (`Company`, `Notification`). */
export function productOfTable(table: string): ProductKey | null {
  return PRODUCT_ORDER.find((product) => PRODUCT_TABLES[product].test(table)) ?? null;
}

/** The tables to bind for a person whose role reads these products, out of what `explore_reader` is granted. */
export function scopeTables(products: readonly ProductKey[], readable: readonly string[]): string[] {
  return readable.filter((table) => products.some((product) => PRODUCT_TABLES[product].test(table))).sort();
}

const NUMBER_TYPES = new Set(["int2", "int4", "int8", "float4", "float8", "numeric", "money"]);
const DATE_TYPES = new Set(["date", "timestamp", "timestamptz"]);

function kindOf(udt: string): ReportColumnKind {
  if (NUMBER_TYPES.has(udt)) return "number";
  if (DATE_TYPES.has(udt)) return "date";
  return "text";
}

/** A granted table as the panel lists it and a question reads it: `CrmDeal` → `crm_deal`, its columns `deal_no`… */
export function realTable(granted: GrantedTable, rows?: number): ExploreTable & { rows?: number } {
  const name = sqlName(granted.table);
  const seen = new Set<string>();
  const columns = granted.columns.flatMap(({ column, udt }) => {
    const sql = sqlName(column);
    // Two columns that read the same once lower-cased: the first keeps the name.
    if (seen.has(sql)) return [];
    seen.add(sql);
    return [{ key: column, sql, label: humanize(column), kind: kindOf(udt) }];
  });
  return {
    key: granted.table,
    name,
    title: humanize(granted.table),
    columns,
    product: productOfTable(granted.table) ?? "operations",
    ...(rows === undefined ? {} : { rows }),
  };
}

/** The tables the person's products read, and the ones someone else's role reads, with who. */
export function tablesInScope(
  granted: readonly GrantedTable[],
  own: readonly ProductKey[],
  others: ReadonlyArray<{ product: ProductKey; who: string }>,
): { tables: ExploreTable[]; locked: LockedTable[] } {
  const names = granted.map((table) => table.table);
  const mine = new Set(scopeTables(own, names));
  const tables = granted.filter((table) => mine.has(table.table)).map((table) => realTable(table));
  const locked = granted.flatMap((table) => {
    if (mine.has(table.table)) return [];
    const product = productOfTable(table.table);
    const other = product ? others.find((entry) => entry.product === product) : undefined;
    return other ? [{ name: sqlName(table.table), key: table.table, product: other.product, who: other.who }] : [];
  });
  return { tables, locked };
}

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

const LEADING_WITH = /^(\s*(?:--[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*)with\s+(recursive\s+)?/i;

/**
 * The SQL that runs for a question the guard passed: each table it reads as a
 * `with` over the real table, then the question. `period_start()` and
 * `period_end()` (a report's dates) read as the question's year.
 */
export function overTables(body: string, reads: readonly string[], tables: readonly ExploreTable[], period: { from: string; to: string }): string {
  const byName = new Map(tables.map((table) => [table.name, table]));
  const views = reads.flatMap((name) => {
    const table = byName.get(name);
    if (!table) return [];
    const columns = table.columns.map((column) => `${ident(column.key)} as ${ident(column.sql)}`).join(", ");
    return [`${ident(table.name)} as not materialized (select ${columns || "null as nothing"} from ${ident(table.key)})`];
  });
  const dated = body
    .replace(/\bperiod_start\s*\(\s*\)/gi, `date '${period.from}'`)
    .replace(/\bperiod_end\s*\(\s*\)/gi, `date '${period.to}'`);
  if (!views.length) return dated;
  const own = LEADING_WITH.exec(dated);
  if (own) return `${own[1]}with ${own[2] ?? ""}${views.join(",\n  ")},\n${dated.slice(own[0].length)}`;
  return `with ${views.join(",\n  ")}\n${dated}`;
}

/** A year back to today: the dates a question's `period_start()` and `period_end()` read. */
export function questionDates(now = new Date()): { from: string; to: string } {
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { from, to };
}
