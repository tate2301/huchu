import { Pool, type PoolClient } from "pg";

import { prisma } from "@/lib/prisma";

import { checkQuestion, EXPLORE_ROW_LIMIT, EXPLORE_TIME_LIMIT_SECONDS, type Refusal } from "./guard";

/**
 * Explore reading Postgres as its own login, `explore_reader` — WAITING FOR
 * APPROVAL (`prisma/migrations/20261015120000_explore_reader`, not applied).
 *
 * Everything in Explore that needs the database itself, rather than the
 * report sources in the person's own tab, goes through `runAsExploreReader`
 * and nothing else: a scheduled question sent at 06:00 with nobody's browser
 * open, the questions-run log Management → Explore reads, and the tables
 * themselves (`site_visits`, not the `crm_site_visits` report). Until the
 * migration is approved and `EXPLORE_READER_DATABASE_URL` is set,
 * `exploreReaderReady()` is false and every caller says so instead.
 *
 * It follows Vane's reader (`lib/vane/reader.ts`, docs/vane.md "What Vane may
 * read"): its own login, never `SET ROLE` on the app's connection, from which
 * a statement could switch the role back. In one transaction on the reader's
 * connection it reads its backend pid, binds that pid to the company and the
 * tables the person's role reads (`ExploreReaderScope`, from the app's
 * connection), runs the question read-only under the statement timeout,
 * logs it (`ExploreQuestionRun`) and unbinds. The row policies the migration
 * adds show the reader only the bound company's rows of the bound tables.
 */

export const EXPLORE_READER_URL = "EXPLORE_READER_DATABASE_URL";

/** Explore's own login is set up: the migration is applied and the connection string is set. */
export function exploreReaderReady(): boolean {
  return Boolean(process.env[EXPLORE_READER_URL]);
}

/** Why Explore cannot read Postgres yet, in a sentence for the person who asked. */
export const READER_WAITING =
  "Sending a question needs Explore's own database login, which is waiting for approval. Until then a question runs in your browser, on the reports you can open.";

export type ExploreRunner = { companyId: string; userId: string; title: string | null };

export type ExploreRun =
  | { ok: true; rows: Record<string, unknown>[]; truncated: boolean; readFrom: string[]; ms: number }
  | { ok: false; refusal: Refusal | { kind: "timeout" | "failed" | "waiting"; message: string } };

let pool: Pool | null = null;

function readerPool(): Pool {
  if (pool) return pool;
  pool = new Pool({ connectionString: process.env[EXPLORE_READER_URL], max: 4, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 });
  pool.on("error", (error) => console.error("[explore] explore_reader connection dropped", error));
  return pool;
}

/**
 * Runs one question for one person as `explore_reader`, over `tables` (the
 * real tables their role reads, `lib/explore/scope.ts`), and logs it.
 */
export async function runAsExploreReader(who: ExploreRunner, sql: string, tables: ReadonlySet<string>): Promise<ExploreRun> {
  if (!exploreReaderReady()) return { ok: false, refusal: { kind: "waiting", message: READER_WAITING } };

  const checked = checkQuestion(sql, new Set([...tables].map((table) => table.toLowerCase())));
  if (!checked.ok) {
    await logRun(who, sql, [], null, null, "REFUSED", checked.refusal.message);
    return { ok: false, refusal: checked.refusal };
  }

  const client: PoolClient = await readerPool().connect();
  let pid: number | null = null;
  const started = Date.now();
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY");
    pid = (await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
    await prisma.$executeRaw`
      INSERT INTO "ExploreReaderScope" ("pid", "companyId", "userId", "tables")
      VALUES (${pid}, ${who.companyId}, ${who.userId}, ${[...tables]}::text[])
      ON CONFLICT ("pid") DO UPDATE SET "companyId" = EXCLUDED."companyId", "userId" = EXCLUDED."userId", "tables" = EXCLUDED."tables", "boundAt" = now()`;
    await client.query(`SET LOCAL statement_timeout = ${EXPLORE_TIME_LIMIT_SECONDS * 1000}`);
    const result = await client.query(`SELECT * FROM (${checked.body}) AS question LIMIT ${EXPLORE_ROW_LIMIT + 1}`);
    await client.query("COMMIT");
    const ms = Date.now() - started;
    const rows = result.rows.slice(0, EXPLORE_ROW_LIMIT);
    await logRun(who, checked.body, checked.tables, rows.length, ms, "OK", null);
    return { ok: true, rows, truncated: result.rows.length > EXPLORE_ROW_LIMIT, readFrom: checked.tables, ms };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    const pgError = error as { code?: string; message?: string };
    const timeout = pgError.code === "57014";
    const message = timeout
      ? `The question ran past ${EXPLORE_TIME_LIMIT_SECONDS} seconds and was stopped.`
      : (pgError.message ?? "The question did not run.");
    await logRun(who, checked.body, checked.tables, null, Date.now() - started, timeout ? "TIMEOUT" : "FAILED", message);
    return { ok: false, refusal: { kind: timeout ? "timeout" : "failed", message } };
  } finally {
    if (pid !== null) await prisma.$executeRaw`DELETE FROM "ExploreReaderScope" WHERE "pid" = ${pid} AND "companyId" = ${who.companyId}`;
    client.release();
  }
}

/** One line of Management → Explore's "Questions run": kept a year, with the SQL and who ran it. */
async function logRun(
  who: ExploreRunner,
  sql: string,
  readFrom: string[],
  rows: number | null,
  ms: number | null,
  result: "OK" | "REFUSED" | "TIMEOUT" | "FAILED",
  reason: string | null,
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "ExploreQuestionRun" ("id", "companyId", "userId", "title", "sql", "readFrom", "rows", "ms", "result", "reason")
    VALUES (gen_random_uuid()::text, ${who.companyId}, ${who.userId}, ${who.title}, ${sql}, ${readFrom}::text[], ${rows}, ${ms},
      ${result}::"ExploreRunResult", ${reason})`.catch((error) => console.error("[explore] could not log a question", error));
}
