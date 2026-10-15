import { Parser } from "node-sql-parser/build/postgresql";

import { checkSql, type SelectAst, type SqlProblem } from "@/lib/reports/sql/guard";

/**
 * What every Explore question runs inside (the ExploreGuard board's card,
 * Management → Explore's Guards), and why one is refused before it runs.
 *
 * The report guard (`lib/reports/sql/guard.ts`) already refuses anything but
 * one SELECT over the tables a person can read. Explore says *why* in the
 * person's terms: a change ("Explore only reads"), a second statement, or a
 * table their role does not read ("Only Managers read payroll_pay"). The
 * walls after it are the same as a report's: a read-only role and
 * transaction, and the row and time limits below.
 */

/** Rows a question gives back. Larger answers are cut, and say so. */
export const EXPLORE_ROW_LIMIT = 5_000;

/** Seconds a question may run before it is stopped and reported. */
export const EXPLORE_TIME_LIMIT_SECONDS = 10;

export type Refusal =
  /** It would change something: an update, insert, delete or any statement that is not a read. */
  | { kind: "change"; verb: string; table: string | null; message: string }
  /** More than one statement. */
  | { kind: "second"; message: string }
  /** A table the person's role does not read. */
  | { kind: "locked"; table: string; who: string; message: string }
  /** Not right as SQL, or a table or function there is no such thing as: underlined where it is. */
  | { kind: "problem"; problem: SqlProblem; message: string };

export type CheckedQuestion =
  | { ok: true; body: string; tables: string[]; ast: SelectAst }
  | { ok: false; refusal: Refusal; problem: SqlProblem };

const parser = new Parser();
const OPTIONS = { database: "postgresql" } as const;

/** The first word of each statement, for SQL the parser cannot read (`truncate`, `vacuum`). */
const CHANGE_WORD = /^\s*(?:--[^\n]*\n\s*)*(update|insert|delete|merge|drop|alter|create|truncate|grant|revoke|copy|call|do|set|reset|vacuum|analyze|cluster|reindex|comment|lock|listen|notify|refresh|discard|prepare|execute|begin|commit|rollback)\b/i;

type Statement = { type?: string; table?: unknown; from?: unknown };

/** The table a change statement names, as written. */
function changedTable(statement: Statement): string | null {
  const first = (value: unknown): string | null => {
    const entry = Array.isArray(value) ? value[0] : value;
    if (entry && typeof entry === "object" && "table" in entry) {
      const name = (entry as { table?: unknown }).table;
      return typeof name === "string" ? name : null;
    }
    return null;
  };
  return first(statement.table) ?? first(statement.from);
}

function statements(sql: string): Statement[] | null {
  try {
    const parsed = parser.astify(sql, OPTIONS) as Statement | Statement[];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return null;
  }
}

function whole(sql: string): { from: number; to: number } {
  return { from: 0, to: Math.max(1, sql.trimEnd().length) };
}

/**
 * Checks a question before it runs.
 *
 * `readable` are the tables the person's role reads, by SQL name; `locked`
 * the ones it does not but someone in the workspace does, with who
 * ("Managers").
 */
export function checkQuestion(sql: string, readable: ReadonlySet<string>, locked: ReadonlyMap<string, string> = new Map()): CheckedQuestion {
  const parsed = statements(sql);
  const nonSelect = parsed?.find((statement) => statement.type && statement.type !== "select");
  const word = CHANGE_WORD.exec(sql)?.[1]?.toLowerCase();
  if (nonSelect || (!parsed && word)) {
    const verb = (nonSelect?.type ?? word ?? "change").toLowerCase();
    const table = nonSelect ? changedTable(nonSelect) : null;
    const refusal: Refusal = {
      kind: "change",
      verb,
      table,
      message: "Explore only reads. A change is refused before it runs, and nothing was changed.",
    };
    return { ok: false, refusal, problem: { message: refusal.message, ...whole(sql) } };
  }
  if (parsed && parsed.length > 1) {
    const at = sql.indexOf(";");
    const message = "One statement per question. A second statement is refused before it runs.";
    return { ok: false, refusal: { kind: "second", message }, problem: { message, from: Math.max(0, at), to: sql.length } };
  }

  const checked = checkSql(sql, readable);
  if (checked.ok) return { ok: true, body: checked.body, tables: checked.tables, ast: checked.ast };

  // A table someone else's role reads: say who, rather than "there is no table".
  const missing = /^There is no table ([A-Za-z0-9_.]+) you can read/.exec(checked.problem.message)?.[1]?.toLowerCase();
  const who = missing ? locked.get(missing) : undefined;
  if (missing && who) {
    const message = `Only ${who} read ${missing}. Your role does not, so this question cannot run.`;
    return { ok: false, refusal: { kind: "locked", table: missing, who, message }, problem: { ...checked.problem, message } };
  }
  return {
    ok: false,
    refusal: { kind: "problem", problem: checked.problem, message: plain(checked.problem.message) },
    problem: { ...checked.problem, message: plain(checked.problem.message) },
  };
}

/** The report guard's words, as Explore says them: a question, not a report or a block. */
function plain(message: string): string {
  return message
    .replace("One query per block — split the rest into another block", "One statement per question")
    .replace("Reports only read: start the query with select or with", "Explore only reads: start with select or with")
    .replace("A report query cannot make a table — leave out into", "A question cannot make a table: leave out into")
    .replace("A report query does not lock rows — leave out for update", "A question does not lock rows: leave out for update")
    .replace("one of the functions a report can use", "one of the functions a question can use")
    .replace("Write a query, like: select * from crm_deals", "Write a question, like: select * from crm_deals");
}

/** The limits as Management → Explore and the guard card say them. */
export const GUARDS = {
  statements: "select and with, nothing else",
  tables: "your role’s, this workspace’s rows only",
  rows: EXPLORE_ROW_LIMIT.toLocaleString("en-GB"),
  time: `${EXPLORE_TIME_LIMIT_SECONDS} s`,
} as const;
