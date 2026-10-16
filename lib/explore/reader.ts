import { Pool, type PoolClient } from "pg";

import { prisma } from "@/lib/prisma";
import { resultColumns } from "@/lib/reports/sql/columns";
import { plain } from "@/lib/reports/sql/engine";
import type { ReportColumn, ReportValue } from "@/lib/reports/types";

import { sourcesFor, whoReads, workspaceRoles } from "./access";
import { checkQuestion, EXPLORE_ROW_LIMIT, EXPLORE_TIME_LIMIT_SECONDS, type Refusal } from "./guard";
import { productOf, type ExploreTable, type LockedTable, type ProductKey } from "./products";
import { overTables, questionDates, tablesInScope, type GrantedTable } from "./tables";

/**
 * Explore reading Postgres as its own login, `explore_reader`
 * (`prisma/migrations/20261016100000_explore_reader`, approved 15 Oct).
 *
 * Everything in Explore that reads the database goes through here: a
 * question asked in the studio, a scheduled question sent at 06:00 with
 * nobody's browser open, and the row counts beside the panel's tables. Until
 * `EXPLORE_READER_DATABASE_URL` is set, `exploreReaderReady()` is false and
 * Explore runs a question in the person's own tab over the report sources
 * they can open, as before.
 *
 * It follows Vane's reader (`lib/vane/reader.ts`, docs/vane.md "What Vane may
 * read"): its own login, never `SET ROLE` on the app's connection, from which
 * a statement could switch the role back. In one read-only transaction on the
 * reader's connection it reads its backend pid, binds that pid to the
 * company, the person and the tables their role reads (`ExploreReaderScope`,
 * written from the app's connection), runs the question under the statement
 * timeout, and unbinds. The row policies show the reader only the bound
 * company's rows of the bound tables. Each question is logged
 * (`ExploreQuestionRun`): Management → Explore's "Questions run today" and the
 * person's own History read it.
 */

export const EXPLORE_READER_URL = "EXPLORE_READER_DATABASE_URL";

/** Explore's own login is set up on this server: the connection string is set. */
export function exploreReaderReady(): boolean {
  return Boolean(process.env[EXPLORE_READER_URL]);
}

/** Why a scheduled question cannot be sent yet, in a sentence for the person who asked. */
export const READER_WAITING =
  "Sending a question needs Explore's own database login, which is not set up on this server yet. Until then a question runs in your browser, on the reports you can open.";

let pool: Pool | null = null;

function readerPool(): Pool {
  if (pool) return pool;
  pool = new Pool({ connectionString: process.env[EXPLORE_READER_URL], max: 4, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 });
  pool.on("error", (error) => console.error("[explore] explore_reader connection dropped", error));
  return pool;
}

let granted: Promise<GrantedTable[]> | null = null;

/** Every table `explore_reader` is granted, with the columns and their types. Read once per server. */
export function exploreGrants(): Promise<GrantedTable[]> {
  if (!granted) {
    granted = prisma
      .$queryRaw<Array<{ table_name: string; column_name: string; udt_name: string }>>`
        SELECT p.table_name, p.column_name, c.udt_name
        FROM information_schema.column_privileges p
        JOIN information_schema.columns c
          ON c.table_schema = p.table_schema AND c.table_name = p.table_name AND c.column_name = p.column_name
        WHERE p.grantee = 'explore_reader' AND p.privilege_type = 'SELECT' AND p.table_schema = 'public'
          AND p.table_name <> 'ExploreReaderScope'
        GROUP BY p.table_name, p.column_name, c.udt_name, c.ordinal_position
        ORDER BY p.table_name, c.ordinal_position`
      .then((rows) => {
        const tables = new Map<string, GrantedTable>();
        for (const row of rows) {
          const table = tables.get(row.table_name) ?? { table: row.table_name, columns: [] };
          table.columns.push({ column: row.column_name, udt: row.udt_name });
          tables.set(row.table_name, table);
        }
        return [...tables.values()];
      });
    granted.catch(() => {
      granted = null;
    });
  }
  return granted;
}

type Access = { role: string; enabledFeatures: string[] | undefined; workspaceProfile?: string | null };

/** The products a role reads: those of the report sources it can open. */
function productsOf(access: { role: string; enabledFeatures: string[] | undefined }): ProductKey[] {
  return [...new Set(sourcesFor(access).map((definition) => productOf(definition.key)))];
}

export type ExploreScope = { tables: ExploreTable[]; locked: LockedTable[] };

/**
 * The real tables a person's role reads (the products of the reports it can
 * open), and the ones only someone else's role reads, with who.
 */
export async function exploreScope(access: Access): Promise<ExploreScope> {
  const own = productsOf(access);
  const roles = workspaceRoles(access.workspaceProfile);
  const others = (["crm", "books", "tender", "people", "schools", "operations"] as const).flatMap((product) => {
    if (own.includes(product)) return [];
    const readers = roles.filter((role) => productsOf({ role, enabledFeatures: access.enabledFeatures }).includes(product));
    return readers.length ? [{ product, who: whoReads(readers) }] : [];
  });
  return tablesInScope(await exploreGrants(), own, others);
}

export type ExploreRunner = { companyId: string; userId: string; title: string | null };

export type ExploreAnswer = {
  columns: ReportColumn[];
  rows: Array<Record<string, ReportValue>>;
  /** More rows matched than Explore gives back. */
  truncated: boolean;
  readFrom: string[];
  ms: number;
};

export type ExploreRun =
  | { ok: true; answer: ExploreAnswer }
  | { ok: false; refusal: Refusal | { kind: "timeout" | "failed" | "waiting"; message: string } };

/** One read-only transaction as `explore_reader`, bound to the company, the person and these real tables. */
async function asReader<T>(who: { companyId: string; userId: string }, tables: readonly string[], seconds: number, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await readerPool().connect();
  let pid: number | null = null;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY");
    pid = (await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
    await prisma.$executeRaw`
      INSERT INTO "ExploreReaderScope" ("pid", "companyId", "userId", "tables")
      VALUES (${pid}, ${who.companyId}, ${who.userId}, ${[...tables]}::text[])
      ON CONFLICT ("pid") DO UPDATE SET "companyId" = EXCLUDED."companyId", "userId" = EXCLUDED."userId", "tables" = EXCLUDED."tables", "boundAt" = now()`;
    await client.query(`SET LOCAL statement_timeout = ${Math.round(seconds * 1000)}`);
    const value = await work(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    if (pid !== null) await prisma.$executeRaw`DELETE FROM "ExploreReaderScope" WHERE "pid" = ${pid} AND "companyId" = ${who.companyId}`.catch(() => {});
    client.release();
  }
}

/**
 * Runs one question for one person as `explore_reader`, over the tables
 * their role reads, and logs it. The guard refuses anything but one SELECT
 * over those tables before anything reaches the database.
 */
export async function runAsExploreReader(
  who: ExploreRunner,
  sql: string,
  scope: ExploreScope,
  period: { from: string; to: string } = questionDates(),
): Promise<ExploreRun> {
  if (!exploreReaderReady()) return { ok: false, refusal: { kind: "waiting", message: READER_WAITING } };

  const checked = checkQuestion(
    sql,
    new Set(scope.tables.map((table) => table.name)),
    new Map(scope.locked.map((table) => [table.name, table.who])),
  );
  if (!checked.ok) {
    await logRun(who, sql.trim(), [], null, null, "REFUSED", checked.refusal.message);
    return { ok: false, refusal: checked.refusal };
  }

  const byName = new Map(scope.tables.map((table) => [table.name, table]));
  const bound = checked.tables.flatMap((name) => (byName.has(name) ? [byName.get(name)!.key] : []));
  const started = Date.now();
  try {
    const result = await asReader(who, bound, EXPLORE_TIME_LIMIT_SECONDS, (client) =>
      client.query(`SELECT * FROM (${overTables(checked.body, checked.tables, scope.tables, period)}) AS question LIMIT ${EXPLORE_ROW_LIMIT + 1}`),
    );
    const ms = Date.now() - started;
    const fields = result.fields.map((field) => ({ name: field.name, dataTypeID: field.dataTypeID }));
    const rows = result.rows.slice(0, EXPLORE_ROW_LIMIT).map((row: Record<string, unknown>) =>
      Object.fromEntries(fields.map((field) => [field.name, plain(row[field.name], field.dataTypeID)])),
    );
    await logRun(who, checked.body, checked.tables, rows.length, ms, "OK", null);
    return {
      ok: true,
      answer: { columns: resultColumns(checked.ast, fields, scope.tables), rows, truncated: result.rows.length > EXPLORE_ROW_LIMIT, readFrom: checked.tables, ms },
    };
  } catch (error) {
    const pgError = error as { code?: string; message?: string };
    const timeout = pgError.code === "57014";
    const message = timeout
      ? `The question ran past ${EXPLORE_TIME_LIMIT_SECONDS} seconds and was stopped.`
      : (pgError.message ?? "The question did not run.");
    await logRun(who, checked.body, checked.tables, null, Date.now() - started, timeout ? "TIMEOUT" : "FAILED", message);
    return { ok: false, refusal: { kind: timeout ? "timeout" : "failed", message } };
  }
}

const counted = new Map<string, { at: number; rows: Promise<Map<string, number>> }>();
const COUNT_FOR_MS = 60_000;

/**
 * How many of the workspace's rows each table holds, as the reader sees them,
 * for the panel. Kept a minute; a count that does not come back in time is
 * left out, and the panel shows the table without one.
 */
export function countRows(who: { companyId: string; userId: string }, tables: readonly ExploreTable[]): Promise<Map<string, number>> {
  if (!exploreReaderReady() || !tables.length) return Promise.resolve(new Map());
  const key = `${who.companyId}:${tables.map((table) => table.key).join(",")}`;
  const kept = counted.get(key);
  if (kept && Date.now() - kept.at < COUNT_FOR_MS) return kept.rows;
  const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;
  const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;
  const sql = tables.map((table) => `SELECT ${literal(table.name)} AS name, count(*)::int AS n FROM ${ident(table.key)}`).join("\nUNION ALL\n");
  const rows = asReader(who, tables.map((table) => table.key), EXPLORE_TIME_LIMIT_SECONDS, (client) => client.query<{ name: string; n: number }>(sql))
    .then((result) => new Map(result.rows.map((row) => [row.name, row.n])))
    .catch((error) => {
      console.error("[explore] could not count the tables' rows", error);
      counted.delete(key);
      return new Map<string, number>();
    });
  counted.set(key, { at: Date.now(), rows });
  return rows;
}

/** One line of the questions-run log: kept a year, with the SQL and who ran it. */
async function logRun(
  who: ExploreRunner,
  sql: string,
  readFrom: string[],
  rows: number | null,
  ms: number | null,
  result: "OK" | "REFUSED" | "TIMEOUT" | "FAILED",
  reason: string | null,
): Promise<void> {
  await prisma.exploreQuestionRun
    .create({ data: { companyId: who.companyId, userId: who.userId, title: who.title, sql, readFrom, rows, ms, result, reason } })
    .catch((error) => console.error("[explore] could not log a question", error));
}
