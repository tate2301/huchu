import { Parser } from "node-sql-parser/build/postgresql";

import type { SqlTable } from "@/lib/reports/sql/schema";

/**
 * A query as steps — from a table, keep the rows that match, total them by
 * something, sort — for somebody who would rather pick than type.
 *
 * The SQL stays the one thing stored. Steps write it, and SQL in the shape
 * steps write reads back as steps, so the two views never disagree. A query
 * written by hand that steps cannot say (a join, a subquery, a CASE) is
 * simply not shown as steps: it is edited as SQL, as it was written.
 */

export type FilterOp = "is" | "isNot" | "above" | "below" | "contains" | "isEmpty" | "isNotEmpty";
export type StepFilter = { column: string; op: FilterOp; value?: string };
export type TotalFn = "count" | "sum" | "avg" | "min" | "max";
export type StepTotal = { fn: TotalFn; column?: string; as: string };
export type Bucket = "month" | "week" | "year";
export type StepGroup = { column: string; by?: Bucket };

export type QuerySteps = {
  from: string;
  keep: StepFilter[];
  /** Grouped by these. With none and no totals, the rows are shown as they are. */
  groups: StepGroup[];
  totals: StepTotal[];
  /** The columns shown when nothing is totalled. Empty is all of them. */
  columns: string[];
  sort?: { column: string; dir: "asc" | "desc" };
  limit?: number;
};

export const FILTER_OPS: Record<FilterOp, string> = {
  is: "is",
  isNot: "is not",
  above: "is over",
  below: "is under",
  contains: "contains",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
};

export const TOTAL_FNS: Record<TotalFn, string> = { count: "Count", sum: "Sum", avg: "Average", min: "Lowest", max: "Highest" };

const NUMERIC = new Set(["number", "money"]);
const IDENT = /^[a-z_][a-z0-9_]*$/;

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** A value as the column compares it: a number for a number, text otherwise. */
function valueFor(table: SqlTable | undefined, column: string, value: string): string {
  const kind = table?.columns.find((candidate) => candidate.sql === column)?.kind;
  return kind && NUMERIC.has(kind) && value.trim() !== "" && Number.isFinite(Number(value)) ? String(Number(value)) : literal(value);
}

function filterSql(filter: StepFilter, table: SqlTable | undefined): string {
  const value = filter.value ?? "";
  switch (filter.op) {
    case "is":
      return `${filter.column} = ${valueFor(table, filter.column, value)}`;
    case "isNot":
      return `${filter.column} <> ${valueFor(table, filter.column, value)}`;
    case "above":
      return `${filter.column} > ${valueFor(table, filter.column, value)}`;
    case "below":
      return `${filter.column} < ${valueFor(table, filter.column, value)}`;
    case "contains":
      return `${filter.column} ilike ${literal(`%${value}%`)}`;
    case "isEmpty":
      return `${filter.column} is null`;
    case "isNotEmpty":
      return `${filter.column} is not null`;
  }
}

/** What a grouping is called in the result: the bucket's name, or the column's. */
export function groupName(group: StepGroup): string {
  return group.by ?? group.column;
}

function groupSql(group: StepGroup): string {
  return group.by ? `cast(date_trunc('${group.by}', ${group.column}) as date) as ${group.by}` : group.column;
}

function totalSql(total: StepTotal): string {
  const of = total.fn === "count" && !total.column ? "*" : (total.column ?? "*");
  return `${total.fn}(${of}) as ${total.as}`;
}

/** The SQL the steps say, laid out to be read. */
export function stepsToSql(steps: QuerySteps, tables: readonly SqlTable[] = []): string {
  const table = tables.find((candidate) => candidate.name === steps.from);
  const totalled = steps.totals.length > 0 || steps.groups.length > 0;
  const shown = totalled ? [...steps.groups.map(groupSql), ...steps.totals.map(totalSql)] : steps.columns.length ? steps.columns : ["*"];
  const lines = [shown.length > 2 ? `select\n  ${shown.join(",\n  ")}` : `select ${shown.join(", ")}`, `from ${steps.from}`];
  if (steps.keep.length) lines.push(`where ${steps.keep.map((filter) => filterSql(filter, table)).join("\n  and ")}`);
  if (totalled && steps.groups.length && steps.totals.length) lines.push(`group by ${steps.groups.map((_, index) => index + 1).join(", ")}`);
  if (steps.sort) lines.push(`order by ${steps.sort.column} ${steps.sort.dir}`);
  if (steps.limit) lines.push(`limit ${steps.limit}`);
  return `${lines.join("\n")}\n`;
}

/* ──────────────────────────────────────────────────────────────────────────
   Reading SQL back as steps
   ────────────────────────────────────────────────────────────────────────── */

type Node = Record<string, unknown> & { type?: string };

const parser = new Parser();

function columnOf(node: unknown): string | null {
  const ref = node as Node | null;
  if (!ref || ref.type !== "column_ref" || ref.table) return null;
  const column = ref.column as unknown;
  const name = typeof column === "string" ? column : ((column as { expr?: { value?: unknown } })?.expr?.value as string | undefined);
  return typeof name === "string" && IDENT.test(name) ? name : null;
}

function literalOf(node: unknown): string | null {
  const value = node as Node | null;
  if (!value) return null;
  if (value.type === "number") return String(value.value);
  // The parser keeps a quote inside a string as it was written, doubled.
  if (value.type === "single_quote_string" || value.type === "string") return String(value.value).replace(/''/g, "'");
  return null;
}

function filtersOf(node: unknown, into: StepFilter[]): boolean {
  const expr = node as Node | null;
  if (!expr || expr.type !== "binary_expr") return false;
  const operator = String(expr.operator).toUpperCase();
  if (operator === "AND") return filtersOf(expr.left, into) && filtersOf(expr.right, into);
  const column = columnOf(expr.left);
  if (!column) return false;
  if (operator === "IS" || operator === "IS NOT") {
    if ((expr.right as Node | null)?.type !== "null") return false;
    into.push({ column, op: operator === "IS" ? "isEmpty" : "isNotEmpty" });
    return true;
  }
  const value = literalOf(expr.right);
  if (value === null) return false;
  if (operator === "ILIKE") {
    if (!(value.startsWith("%") && value.endsWith("%") && value.length >= 2)) return false;
    into.push({ column, op: "contains", value: value.slice(1, -1) });
    return true;
  }
  const op: FilterOp | undefined = ({ "=": "is", "<>": "isNot", "!=": "isNot", ">": "above", "<": "below" } as const)[operator as "=" | "<>" | "!=" | ">" | "<"];
  if (!op) return false;
  into.push({ column, op, value });
  return true;
}

function bucketOf(node: unknown): { column: string; by: Bucket } | null {
  let expr = node as Node | null;
  if (expr?.type === "cast") {
    const target = (expr.target as Array<{ dataType?: string }> | { dataType?: string } | undefined);
    const type = Array.isArray(target) ? target[0]?.dataType : target?.dataType;
    if (String(type).toUpperCase() !== "DATE") return null;
    expr = expr.expr as Node;
  }
  if (expr?.type !== "function") return null;
  const name = (expr.name as { name?: Array<{ value?: string }> })?.name?.[0]?.value;
  if (String(name).toLowerCase() !== "date_trunc") return null;
  const args = ((expr.args as { value?: unknown[] })?.value ?? []) as unknown[];
  const by = literalOf(args[0]);
  const column = columnOf(args[1]);
  return column && (by === "month" || by === "week" || by === "year") ? { column, by } : null;
}

function totalOf(node: unknown, as: unknown): StepTotal | null {
  const expr = node as Node | null;
  // A FILTER, a window or an ORDER BY inside the total says more than a step
  // can: read as a plain total, editing the steps would silently drop it.
  if (expr?.type !== "aggr_func" || expr.over || expr.filter) return null;
  if ((expr.args as { orderby?: unknown } | undefined)?.orderby) return null;
  const fn = String(expr.name).toLowerCase() as TotalFn;
  if (!(fn in TOTAL_FNS)) return null;
  const args = expr.args as { expr?: Node; distinct?: unknown } | undefined;
  if (args?.distinct) return null;
  const alias = typeof as === "string" && IDENT.test(as) ? as : null;
  if (!alias) return null;
  if (args?.expr?.type === "star") return fn === "count" ? { fn, as: alias } : null;
  const column = columnOf(args?.expr);
  return column ? { fn, column, as: alias } : null;
}

/** The steps a query is, or null when it says more than steps can. */
export function stepsFromSql(sql: string, tables: readonly SqlTable[]): QuerySteps | null {
  let parsed: unknown;
  try {
    parsed = parser.astify(sql, { database: "postgresql" });
  } catch {
    return null;
  }
  const select = (Array.isArray(parsed) ? (parsed.length === 1 ? parsed[0] : null) : parsed) as Node | null;
  if (!select || select.type !== "select" || select.with || select.having || select.window || select._next || (select.distinct as Node | null)?.type) return null;

  const from = select.from as Array<{ table?: string; join?: unknown; expr?: unknown; as?: unknown }> | null;
  if (!from || from.length !== 1 || from[0].join || from[0].expr || from[0].as || !from[0].table) return null;
  const table = tables.find((candidate) => candidate.name === from[0].table);
  if (!table) return null;
  const known = new Set(table.columns.map((column) => column.sql));
  const isKnown = (column: string | undefined) => column === undefined || known.has(column);

  const steps: QuerySteps = { from: table.name, keep: [], groups: [], totals: [], columns: [] };
  if (select.where && !filtersOf(select.where, steps.keep)) return null;

  const columns = (select.columns ?? []) as Array<{ expr: Node; as: unknown }>;
  const star = columns.length === 1 && columnOf(columns[0].expr) === null && (columns[0].expr as { column?: unknown }).column === "*";
  if (!star) {
    for (const column of columns) {
      const total = totalOf(column.expr, column.as);
      if (total) {
        steps.totals.push(total);
        continue;
      }
      const bucket = bucketOf(column.expr);
      if (bucket) {
        if (column.as !== bucket.by) return null;
        steps.groups.push(bucket);
        continue;
      }
      const plain = columnOf(column.expr);
      if (!plain || (column.as && column.as !== plain)) return null;
      steps.columns.push(plain);
    }
  }

  const groupBy = ((select.groupby as { columns?: unknown[] } | null)?.columns ?? null) as Node[] | null;
  if (steps.totals.length || steps.groups.length || groupBy) {
    // Totalled: every plain column is a grouping, and the grouping is exactly them.
    const order = columns.filter((column) => !totalOf(column.expr, column.as));
    steps.groups = order.map((column) => bucketOf(column.expr) ?? { column: columnOf(column.expr)! });
    steps.columns = [];
    const expected = steps.groups.length && steps.totals.length ? steps.groups.length : 0;
    const given = groupBy ?? [];
    if (given.length !== expected) return null;
    for (const [index, entry] of given.entries()) {
      const position = entry.type === "number" ? Number(entry.value) : null;
      const named = columnOf(entry);
      const group = steps.groups[index];
      const matches = position === index + 1 || (named !== null && !group.by && named === group.column);
      if (!matches) return null;
    }
  }

  const orderby = select.orderby as Array<{ expr: Node; type?: string }> | null;
  if (orderby) {
    if (orderby.length !== 1) return null;
    const column = columnOf(orderby[0].expr);
    if (!column) return null;
    steps.sort = { column, dir: String(orderby[0].type ?? "ASC").toUpperCase() === "DESC" ? "desc" : "asc" };
  }

  const limit = select.limit as { value?: Node[] } | null;
  if (limit?.value?.length) {
    if (limit.value.length !== 1 || limit.value[0].type !== "number") return null;
    steps.limit = Number(limit.value[0].value);
  }

  // Everything it names must be a column of the table (or, for sorting, a result's name).
  const results = new Set([...steps.groups.map(groupName), ...steps.totals.map((total) => total.as)]);
  if (!steps.keep.every((filter) => isKnown(filter.column))) return null;
  if (!steps.groups.every((group) => isKnown(group.column))) return null;
  if (!steps.totals.every((total) => isKnown(total.column))) return null;
  if (!steps.columns.every((column) => isKnown(column))) return null;
  if (steps.sort && !known.has(steps.sort.column) && !results.has(steps.sort.column)) return null;
  return steps;
}

/** The names a step can sort by: what the result has. */
export function resultNames(steps: QuerySteps, table: SqlTable | undefined): string[] {
  if (steps.totals.length || steps.groups.length) return [...steps.groups.map(groupName), ...steps.totals.map((total) => total.as)];
  return steps.columns.length ? steps.columns : (table?.columns.map((column) => column.sql) ?? []);
}
