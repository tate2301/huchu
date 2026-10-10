import { Parser } from "node-sql-parser/build/postgresql";

/**
 * What a report query may be, checked before it runs.
 *
 * A query is read by a real SQL parser (node-sql-parser, Postgres dialect)
 * and refused unless it is one SELECT, reading only the tables the report
 * offers, calling only functions on the list below. This is the first of four
 * walls; the others are where it runs — an in-browser Postgres holding only
 * the rows its reader could already see (`engine.ts`) — the read-only role and
 * transaction it runs under, and the time and row limits around it.
 *
 * Checking is synchronous and quick, so the editor runs it on every keystroke
 * and underlines what is wrong before anything is sent anywhere.
 */

export type SqlProblem = { message: string; from: number; to: number };

export type CheckedSql =
  | {
      ok: true;
      /** The query without a trailing semicolon or comment, ready to wrap. */
      body: string;
      /** The tables it reads, by SQL name. Names its own WITH defines are not among them. */
      tables: string[];
      /** The parsed statement, for typing the result's columns. */
      ast: SelectAst;
    }
  | { ok: false; problem: SqlProblem };

/** The parts of node-sql-parser's SELECT node this module reads. */
export type SelectAst = {
  type: "select";
  columns: Array<{ expr: AstNode; as: string | null }> | "*";
  with?: Array<{ name: { value: string } | string }> | null;
  into?: { expr?: unknown; position?: unknown } | null;
  locking_read?: unknown;
  [key: string]: unknown;
};

export type AstNode = { type?: string; [key: string]: unknown };

/**
 * Every function a report query may call. Aggregates, windows, arithmetic,
 * text and dates — what a report is made of — and nothing that reads a file,
 * changes a setting, sleeps or runs a query of its own.
 */
export const SQL_FUNCTIONS: Readonly<Record<string, string>> = {
  // Aggregates
  count: "count(*) or count(x): how many rows, or how many have x",
  sum: "sum(x): x added up",
  avg: "avg(x): the average of x",
  min: "min(x): the lowest x",
  max: "max(x): the highest x",
  string_agg: "string_agg(x, ', '): every x, joined",
  array_agg: "array_agg(x): every x, as a list",
  bool_and: "bool_and(x): whether x holds on every row",
  bool_or: "bool_or(x): whether x holds on any row",
  every: "every(x): whether x holds on every row",
  stddev: "stddev(x): how spread out x is",
  variance: "variance(x): the variance of x",
  percentile_cont: "percentile_cont(0.5) within group (order by x): the median of x",
  percentile_disc: "percentile_disc(0.5) within group (order by x)",
  mode: "mode() within group (order by x): the most common x",
  // Windows
  row_number: "row_number() over (…): 1, 2, 3 down the rows",
  rank: "rank() over (…): position, with ties sharing a place",
  dense_rank: "dense_rank() over (…): position, with no gaps after ties",
  percent_rank: "percent_rank() over (…)",
  cume_dist: "cume_dist() over (…)",
  ntile: "ntile(4) over (…): which quarter a row falls in",
  lag: "lag(x) over (…): x on the row before",
  lead: "lead(x) over (…): x on the row after",
  first_value: "first_value(x) over (…)",
  last_value: "last_value(x) over (…)",
  nth_value: "nth_value(x, n) over (…)",
  // Numbers
  round: "round(x, places): x rounded",
  floor: "floor(x): x rounded down",
  ceil: "ceil(x): x rounded up",
  ceiling: "ceiling(x): x rounded up",
  trunc: "trunc(x, places): x cut short",
  abs: "abs(x): x without its sign",
  sign: "sign(x): -1, 0 or 1",
  mod: "mod(a, b): what is left of a after dividing by b",
  power: "power(a, b): a to the power of b",
  sqrt: "sqrt(x): the square root of x",
  greatest: "greatest(a, b, …): the largest",
  least: "least(a, b, …): the smallest",
  // Choices
  coalesce: "coalesce(a, b, …): the first that is not null",
  nullif: "nullif(a, b): null when a equals b — for dividing safely",
  // Text
  lower: "lower(text)",
  upper: "upper(text)",
  initcap: "initcap(text): Each Word Capitalised",
  length: "length(text): how many characters",
  char_length: "char_length(text)",
  trim: "trim(text)",
  btrim: "btrim(text)",
  ltrim: "ltrim(text)",
  rtrim: "rtrim(text)",
  concat: "concat(a, b, …): joined into one text",
  concat_ws: "concat_ws(', ', a, b, …): joined with a separator",
  substring: "substring(text from 1 for 3)",
  substr: "substr(text, start, length)",
  left: "left(text, n): the first n characters",
  right: "right(text, n): the last n characters",
  replace: "replace(text, find, with)",
  split_part: "split_part(text, ',', 1): one piece of text",
  position: "position(part in text)",
  strpos: "strpos(text, part)",
  lpad: "lpad(text, length, fill)",
  rpad: "rpad(text, length, fill)",
  repeat: "repeat(text, n)",
  reverse: "reverse(text)",
  format: "format('%s · %s', a, b)",
  to_char: "to_char(x, 'FMMonth YYYY'): a date or number as text",
  to_number: "to_number(text, '999.99')",
  regexp_replace: "regexp_replace(text, pattern, with)",
  regexp_match: "regexp_match(text, pattern)",
  // Dates
  date_trunc: "date_trunc('month', date): the first of its month (or week, quarter, year)",
  date_part: "date_part('year', date)",
  extract: "extract(year from date)",
  age: "age(a, b): the time between two dates",
  now: "now(): this moment",
  make_date: "make_date(year, month, day)",
  to_date: "to_date(text, 'YYYY-MM-DD')",
  generate_series: "generate_series(start, stop, step): one row per step — for a calendar",
  // The report's own dates
  period_start: "period_start(): the first date the report is open on",
  period_end: "period_end(): the last date the report is open on",
};

const parser = new Parser();
const OPTIONS = { database: "postgresql", parseOptions: { includeLocations: true } } as const;

const MAX_LENGTH = 20_000;

function at(sql: string, from: number, to = from + 1): { from: number; to: number } {
  const clamp = (n: number) => Math.max(0, Math.min(sql.length, n));
  return { from: clamp(from), to: clamp(Math.max(to, from + 1)) };
}

/** Where a name first appears as a word, for underlining a table the parser does not locate. */
function findWord(sql: string, word: string): { from: number; to: number } {
  const match = new RegExp(`(?<![A-Za-z0-9_."])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_])`, "i").exec(sql);
  return match ? { from: match.index, to: match.index + word.length } : { from: 0, to: Math.min(sql.length, 1) };
}

/** The query with its trailing semicolon, comments and spaces taken off, so it can be wrapped. */
export function trimEnd(sql: string): string {
  let end = sql.length;
  for (;;) {
    const before = end;
    while (end > 0 && /\s/.test(sql[end - 1]!)) end -= 1;
    if (sql[end - 1] === ";") end -= 1;
    // A trailing `-- comment` runs to the end of its line.
    const lineStart = sql.lastIndexOf("\n", end - 1) + 1;
    const line = sql.slice(lineStart, end);
    const dash = commentStart(line);
    if (dash !== -1) end = lineStart + dash;
    if (sql.slice(0, end).endsWith("*/")) {
      const open = sql.lastIndexOf("/*", end - 2);
      if (open !== -1) end = open;
    }
    if (end === before) return sql.slice(0, end);
  }
}

/** Where `--` starts a comment in one line, outside quotes; -1 when it does not. */
function commentStart(line: string): number {
  let quote: string | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === "'" || char === '"') quote = char;
    else if (char === "-" && line[index + 1] === "-") return index;
  }
  return -1;
}

function functionName(node: AstNode): string | null {
  if (node.type === "aggr_func" && typeof node.name === "string") return node.name.toLowerCase();
  if (node.type === "function") {
    const name = node.name as { name?: Array<{ value?: string }> } | string | undefined;
    if (typeof name === "string") return name.toLowerCase();
    const parts = name?.name?.map((part) => part.value ?? "").filter(Boolean) ?? [];
    return parts.length ? parts.join(".").toLowerCase() : null;
  }
  if (node.type === "extract") return "extract";
  if (node.type === "window_func" && typeof node.name === "string") return node.name.toLowerCase();
  return null;
}

type Located = { loc?: { start: { offset: number }; end: { offset: number } } };

/** Every function the statement calls, wherever it sits. */
function functionsIn(node: unknown, out: Array<{ name: string; node: AstNode & Located }> = []) {
  if (Array.isArray(node)) {
    for (const item of node) functionsIn(item, out);
  } else if (node && typeof node === "object") {
    const record = node as AstNode & Located;
    const name = functionName(record);
    if (name) out.push({ name, node: record });
    for (const [key, value] of Object.entries(record)) if (key !== "loc") functionsIn(value, out);
  }
  return out;
}

function cteNames(ast: SelectAst): Set<string> {
  const names = new Set<string>();
  for (const entry of ast.with ?? []) {
    const name = typeof entry.name === "string" ? entry.name : entry.name?.value;
    if (name) names.add(name.toLowerCase());
  }
  return names;
}

export function checkSql(sql: string, allowed: ReadonlySet<string>): CheckedSql {
  if (!sql.trim()) return { ok: false, problem: { message: "Write a query, like: select * from crm_deals", ...at(sql, 0) } };
  if (sql.length > MAX_LENGTH) {
    return { ok: false, problem: { message: `A query can be up to ${MAX_LENGTH.toLocaleString("en-US")} characters`, ...at(sql, MAX_LENGTH) } };
  }

  let parsed: unknown;
  try {
    parsed = parser.astify(sql, OPTIONS);
  } catch (error) {
    const location = (error as { location?: { start?: { offset?: number } } }).location?.start?.offset ?? 0;
    const near = sql.slice(location, location + 20).split(/\s/)[0];
    const message = location >= trimEnd(sql).length ? "The query stops before it is finished" : `This does not read as SQL${near ? ` near "${near}"` : ""}`;
    return { ok: false, problem: { message, ...at(sql, location, location + Math.max(1, near?.length ?? 1)) } };
  }

  const statements = (Array.isArray(parsed) ? parsed : [parsed]) as SelectAst[];
  if (statements.length !== 1) {
    const second = sql.indexOf(";");
    return { ok: false, problem: { message: "One query per block — split the rest into another block", ...at(sql, second, sql.length) } };
  }
  const ast = statements[0]!;
  if (ast.type !== "select") {
    return { ok: false, problem: { message: "Reports only read: start the query with select or with", ...findWord(sql, String(ast.type ?? "")) } };
  }
  if (ast.into && (ast.into.expr || ast.into.position)) {
    return { ok: false, problem: { message: "A report query cannot make a table — leave out into", ...findWord(sql, "into") } };
  }
  if (ast.locking_read) {
    return { ok: false, problem: { message: "A report query does not lock rows — leave out for update", ...findWord(sql, "for") } };
  }

  const ctes = cteNames(ast);
  const tables: string[] = [];
  for (const entry of parser.tableList(sql, OPTIONS)) {
    const [, schema, name] = entry.split("::") as [string, string, string];
    const table = name.toLowerCase();
    if (ctes.has(table)) continue;
    if ((schema !== "null" && schema !== "public") || !allowed.has(table)) {
      const shown = schema !== "null" ? `${schema}.${name}` : name;
      const near = suggest(table, [...allowed]);
      return {
        ok: false,
        problem: { message: `There is no table ${shown} you can read.${near ? ` Did you mean ${near}?` : ""}`, ...findWord(sql, name) },
      };
    }
    if (!tables.includes(table)) tables.push(table);
  }

  for (const { name, node } of functionsIn(ast)) {
    const bare = name.replace(/^pg_catalog\./, "");
    if (!(bare in SQL_FUNCTIONS)) {
      const span = node.loc ? { from: node.loc.start.offset, to: node.loc.start.offset + name.length } : findWord(sql, name);
      const near = suggest(bare, Object.keys(SQL_FUNCTIONS));
      return {
        ok: false,
        problem: { message: `${name} is not one of the functions a report can use.${near ? ` Did you mean ${near}?` : ""}`, ...at(sql, span.from, span.to) },
      };
    }
  }

  return { ok: true, body: trimEnd(sql), tables, ast };
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}

/** The nearest of `options` to what was typed, if any is near. */
export function suggest(typed: string, options: readonly string[]): string | null {
  let best: string | null = null;
  let score = Infinity;
  for (const option of options) {
    const next = option.startsWith(typed) || typed.startsWith(option) ? 0.5 : distance(typed, option);
    if (next < score) {
      score = next;
      best = option;
    }
  }
  return best !== null && score <= Math.max(2, Math.floor(typed.length / 3)) ? best : null;
}
