import { Pool, type PoolClient } from "pg";

import { prisma } from "@/lib/prisma";
import { checkSql } from "@/lib/reports/sql/guard";

/**
 * How Vane reads a workspace: one question, as SQL, for one company
 * (`docs/vane.md`, "What Vane may read").
 *
 * Vane never reads as the app. The question runs on a connection signed in as
 * `vane_reader`, or as `vane_reader_private` when the workspace has turned on
 * "People's pay and personal details". The database decides what that role
 * sees: per-column grants, and a row policy that shows only the company bound
 * to the connection's backend in `VaneReaderScope`. Before that, the question
 * is checked here, so a mistake comes back as a sentence Vane can act on
 * rather than as a permission error.
 *
 * Everything happens in one transaction on the reader's connection: read its
 * backend pid, bind that pid to the company from the app's connection, run the
 * question read-only under a statement timeout, unbind. One transaction,
 * because Neon's pooler may move a connection to another backend between
 * transactions, and the binding is by backend.
 */

/** Rows a question may return. One more is read to know there were more. */
export const ROW_LIMIT = 500;

export type ReaderAnswer = {
  /** At most `ROW_LIMIT` rows, as Postgres returned them. */
  rows: Record<string, unknown>[];
  /** There were more rows than `ROW_LIMIT`. */
  moreThanLimit: boolean;
  /** The question as it ran, kept on every card Vane writes from it. */
  sql: string;
  /** The tables it read, by SQL name. */
  readFrom: string[];
};

export type ReaderErrorCode =
  /** The question is not something Vane may run: not one SELECT, an unknown table or a function off the list. */
  | "refused"
  /** It ran past the statement timeout. */
  | "timeout"
  /** Postgres turned it down while running it: a column that does not exist, one the role may not read, bad syntax. */
  | "failed"
  /** The reader's connection string is not set. A person has to fix the configuration. */
  | "misconfigured";

export class ReaderError extends Error {
  readonly code: ReaderErrorCode;

  constructor(code: ReaderErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ReaderError";
    this.code = code;
  }
}

type Role = "vane_reader" | "vane_reader_private";

const ROLE_URL: Record<Role, string> = {
  vane_reader: "VANE_READER_DATABASE_URL",
  vane_reader_private: "VANE_READER_PRIVATE_DATABASE_URL",
};

const pools = new Map<Role, Pool>();

function poolFor(role: Role): Pool {
  const existing = pools.get(role);
  if (existing) return existing;
  const connectionString = process.env[ROLE_URL[role]];
  if (!connectionString) {
    throw new ReaderError("misconfigured", `${ROLE_URL[role]} is not set, so Vane has no connection to read through.`);
  }
  const pool = new Pool({ connectionString, max: 2, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 });
  // An idle connection the server drops must not take the process with it.
  pool.on("error", (error) => console.error(`[vane] ${role} connection dropped`, error));
  pools.set(role, pool);
  return pool;
}

/** A table the role may read: its SQL name and the columns granted on it. */
export type ReadableTable = { name: string; columns: string[] };

const readable = new Map<Role, Promise<Map<string, ReadableTable>>>();

/**
 * The tables the role has been granted any column of, keyed by lower-case SQL
 * name as the guard compares them, with the columns it may select.
 */
function readableTables(role: Role): Promise<Map<string, ReadableTable>> {
  let tables = readable.get(role);
  if (!tables) {
    tables = prisma
      .$queryRaw<Array<{ table_name: string; column_name: string }>>`
        SELECT DISTINCT table_name, column_name FROM information_schema.column_privileges
        WHERE grantee IN (${role}, 'vane_reader') AND privilege_type = 'SELECT' AND table_schema = 'public'
        ORDER BY table_name, column_name`
      .then((rows) => {
        const byName = new Map<string, ReadableTable>();
        for (const row of rows) {
          const key = row.table_name.toLowerCase();
          const table = byName.get(key) ?? { name: row.table_name, columns: [] };
          table.columns.push(row.column_name);
          byName.set(key, table);
        }
        return byName;
      });
    tables.catch(() => readable.delete(role));
    readable.set(role, tables);
  }
  return tables;
}

async function roleFor(companyId: string): Promise<Role> {
  const settings = await prisma.vaneSettings.findUnique({ where: { companyId }, select: { readsPeoplePrivate: true } });
  return settings?.readsPeoplePrivate ? "vane_reader_private" : "vane_reader";
}

/** The tables Vane may read for this company, by its settings: for describing them to Claude. */
export async function tablesFor(companyId: string): Promise<Map<string, ReadableTable>> {
  return readableTables(await roleFor(companyId));
}

/** What a piece of reading work gets: the bound reader connection, and the tables its role may read. */
export type ReaderSession = { client: PoolClient; tables: Map<string, ReadableTable> };

/**
 * Runs `work` on a reader connection bound to one company, in one read-only
 * transaction under the statement timeout, and unbinds afterwards. Postgres's
 * errors come back as `ReaderError`s.
 */
export async function withReader<T>(
  companyId: string,
  work: (session: ReaderSession) => Promise<T>,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const role = await roleFor(companyId);
  const pool = poolFor(role);
  const tables = await readableTables(role);

  const timeoutMs = options.timeoutMs ?? 5_000;
  const client: PoolClient = await pool.connect();
  let pid: number | null = null;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY");
    const [backend] = (await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows;
    pid = backend!.pid;
    await prisma.vaneReaderScope.upsert({
      where: { pid },
      create: { pid, companyId },
      update: { companyId },
    });
    await client.query(`SET LOCAL statement_timeout = ${Math.trunc(timeoutMs)}`);
    const result = await work({ client, tables });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error instanceof ReaderError) throw error;
    const pgError = error as { code?: string; message?: string };
    if (pgError.code === "57014") {
      throw new ReaderError("timeout", `The question ran past ${timeoutMs / 1000} seconds and was stopped.`, { cause: error });
    }
    throw new ReaderError("failed", pgError.message ?? String(error), { cause: error });
  } finally {
    if (pid !== null) await prisma.vaneReaderScope.deleteMany({ where: { pid, companyId } });
    client.release();
  }
}

/** Runs one question for one company, as the reader role its settings allow, and returns what it read. */
export async function readWorkspace(
  companyId: string,
  question: string,
  options: { timeoutMs?: number } = {},
): Promise<ReaderAnswer> {
  return withReader(
    companyId,
    async ({ client, tables }) => {
      const checked = checkSql(question, new Set(tables.keys()));
      if (!checked.ok) throw new ReaderError("refused", checked.problem.message);
      const result = await client.query(`SELECT * FROM (${checked.body}) AS question LIMIT ${ROW_LIMIT + 1}`);
      return {
        rows: result.rows.slice(0, ROW_LIMIT),
        moreThanLimit: result.rows.length > ROW_LIMIT,
        sql: checked.body,
        readFrom: checked.tables,
      };
    },
    options,
  );
}
