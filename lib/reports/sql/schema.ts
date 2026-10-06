import type { ReportColumn, ReportColumnKind, ReportRow, ReportValue } from "@/lib/reports/types";

/**
 * Report sources as SQL tables.
 *
 * A report's key and its columns' keys are written for code (`crm-deals`,
 * `dealNo`); in SQL they are written the way Postgres reads an unquoted name —
 * `crm_deals`, `deal_no` — so nobody has to quote anything to write a query.
 * Each column keeps its kind, label and currency, so a result can be drawn the
 * way the report draws it.
 */

export type SqlColumn = ReportColumn & {
  /** The name a query uses. */
  sql: string;
};

export type SqlTable = {
  /** The name a query uses. */
  name: string;
  /** What it is called on screen. */
  title: string;
  columns: SqlColumn[];
};

/** `crm-deals` → `crm_deals`; `dealNo` → `deal_no`. Lower case, so it needs no quotes. */
export function sqlName(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

const SQL_TYPES: Record<ReportColumnKind, string> = {
  text: "text",
  status: "text",
  code: "text",
  relation: "text",
  email: "text",
  phone: "text",
  date: "date",
  number: "numeric",
  money: "numeric",
};

export function sourceTable(source: { key: string; title: string; columns: ReportColumn[] }): SqlTable {
  return {
    name: sqlName(source.key),
    title: source.title,
    columns: source.columns.map((column) => ({ ...column, sql: sqlName(column.key) })),
  };
}

/** Another block's result, read by name. Its columns are already SQL names. */
export function blockTable(name: string, columns: ReportColumn[]): SqlTable {
  return {
    name: sqlName(name),
    title: `@${name}`,
    columns: columns.map((column) => ({ ...column, sql: column.key })),
  };
}

function quote(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function createTableSql(table: SqlTable): string {
  const columns = table.columns.map((column) => `${quote(column.sql)} ${SQL_TYPES[column.kind]}`);
  return `drop table if exists ${quote(table.name)};\ncreate table ${quote(table.name)} (${columns.join(", ")});`;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

function cell(value: ReportValue | undefined, kind: ReportColumnKind): ReportValue {
  if (value === null || value === undefined || value === "") return null;
  if (kind === "number" || kind === "money") {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : null;
  }
  if (kind === "date") return typeof value === "string" && ISO_DAY.test(value) ? value.slice(0, 10) : null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/** Rows as Postgres will read them through `json_populate_recordset`: keyed by SQL name, typed by kind. */
export function tableRows(table: SqlTable, rows: readonly ReportRow[]): Array<Record<string, ReportValue>> {
  return rows.map((row) => {
    const out: Record<string, ReportValue> = {};
    for (const column of table.columns) out[column.sql] = cell(row[column.key], column.kind);
    return out;
  });
}

export function insertSql(table: SqlTable): string {
  return `insert into ${quote(table.name)} select * from json_populate_recordset(null::${quote(table.name)}, $1)`;
}
