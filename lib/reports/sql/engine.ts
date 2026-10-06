import { createTableSql, insertSql, tableRows, type SqlTable } from "@/lib/reports/sql/schema";
import type { ReportRow, ReportValue } from "@/lib/reports/types";

/**
 * Where a report query runs: an in-memory Postgres (PGlite) that holds only
 * the rows its reader was already sent, through the same access checks as the
 * reports they come from. It cannot reach the real database or the network;
 * the worst a query can do is waste its own time, which `client.ts` bounds.
 *
 * Inside it, a query runs as a role that may only read the report tables, in
 * a read-only transaction, wrapped in a row limit. The guard (`guard.ts`) has
 * already refused anything but a single SELECT over those tables.
 *
 * Written against the few PGlite methods it uses, so the same code runs in the
 * browser's worker and in the tests.
 */

export type SqlDatabase = {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; fields: Array<{ name: string; dataTypeID: number }> }>;
  transaction<T>(fn: (tx: Pick<SqlDatabase, "exec" | "query">) => Promise<T>): Promise<T>;
};

export type RawResult = {
  fields: Array<{ name: string; dataTypeID: number }>;
  rows: Array<Record<string, ReportValue>>;
  /** More rows matched than came back. */
  truncated: boolean;
};

export type RunError = { message: string; /** Offset into the query, when Postgres gave one. */ position: number | null };

/** As many rows as one block shows. */
export const MAX_RESULT_ROWS = 50_000;

const ROLE = "report_reader";
/** What the query is wrapped in; its length maps an error's position back to the query. */
const PREFIX = "select * from (\n";

/** Postgres type ids the results are read by. */
const NUMERIC_TYPES = new Set([20, 21, 23, 700, 701, 1700]);
const DATE_TYPES = new Set([1082, 1114, 1184]);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function plain(value: unknown, typeId: number): ReportValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const iso = value.toISOString();
    // A date, or a timestamp at midnight, reads as the day it is.
    return typeId === 1082 || iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
  }
  if (NUMERIC_TYPES.has(typeId)) {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return Number(value);
  // Arrays and records from array_agg and friends read as text.
  return JSON.stringify(value);
}

function dateLiteral(value: string | undefined): string {
  return value && ISO_DAY.test(value) ? `'${value}'::date` : "null::date";
}

export class ReportDatabase {
  private ready: Promise<void> | null = null;
  /** What each table holds, so an unchanged source is not loaded twice. */
  private versions = new Map<string, string>();

  constructor(private readonly db: SqlDatabase) {}

  private setup(): Promise<void> {
    this.ready ??= this.db.exec(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = '${ROLE}') then create role ${ROLE} nologin; end if;
      end $$;
      grant usage on schema public to ${ROLE};
      create or replace function period_start() returns date language sql stable as $f$ select null::date $f$;
      create or replace function period_end() returns date language sql stable as $f$ select null::date $f$;
    `).then(() => undefined);
    return this.ready;
  }

  /** Puts a table's rows in place, unless this version is there already. */
  async load(table: SqlTable, rows: readonly ReportRow[], version: string): Promise<void> {
    await this.setup();
    if (this.versions.get(table.name) === version) return;
    await this.db.exec(createTableSql(table));
    await this.db.query(insertSql(table), [JSON.stringify(tableRows(table, rows))]);
    await this.db.exec(`grant select on "${table.name.replace(/"/g, '""')}" to ${ROLE};`);
    this.versions.set(table.name, version);
  }

  /** A table someone else's result was loaded as: its rows given as the query returned them. */
  async loadResult(table: SqlTable, rows: ReadonlyArray<Record<string, ReportValue>>, version: string): Promise<void> {
    await this.load(table, rows.map((row, index) => ({ id: String(index), ...row })) as ReportRow[], version);
  }

  has(name: string, version: string): boolean {
    return this.versions.get(name) === version;
  }

  /**
   * Runs a checked query. `body` is the guard's: one SELECT, no trailing
   * semicolon. Errors come back with their place in `body`, not thrown.
   */
  async run(body: string, period: { from?: string; to?: string }): Promise<{ ok: true; result: RawResult } | { ok: false; error: RunError }> {
    await this.setup();
    // The report's dates, as functions the query can call. Built from checked
    // dates only, so nothing a person typed reaches this SQL.
    await this.db.exec(`
      create or replace function period_start() returns date language sql stable as $f$ select ${dateLiteral(period.from)} $f$;
      create or replace function period_end() returns date language sql stable as $f$ select ${dateLiteral(period.to)} $f$;
    `);
    const sql = `${PREFIX}${body}\n) as report_result limit ${MAX_RESULT_ROWS + 1}`;
    try {
      const raw = await this.db.transaction(async (tx) => {
        await tx.exec(`set transaction read only; set local role ${ROLE};`);
        return tx.query<Record<string, unknown>>(sql);
      });
      const fields = raw.fields.map((field) => ({ name: field.name, dataTypeID: field.dataTypeID }));
      const truncated = raw.rows.length > MAX_RESULT_ROWS;
      const rows = raw.rows.slice(0, MAX_RESULT_ROWS).map((row) => {
        const out: Record<string, ReportValue> = {};
        for (const field of fields) out[field.name] = plain(row[field.name], field.dataTypeID);
        return out;
      });
      return { ok: true, result: { fields, rows, truncated } };
    } catch (error) {
      const raw = error as { message?: string; position?: string | number };
      const position = raw.position !== undefined ? Number(raw.position) - 1 - PREFIX.length : null;
      return {
        ok: false,
        error: {
          message: raw.message ?? "The query did not run",
          position: position !== null && Number.isFinite(position) && position >= 0 && position <= body.length ? position : null,
        },
      };
    }
  }
}

export function isDateType(typeId: number): boolean {
  return DATE_TYPES.has(typeId);
}

export function isNumericType(typeId: number): boolean {
  return NUMERIC_TYPES.has(typeId);
}
