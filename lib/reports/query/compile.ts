import type { Expr, NamedExpr, SourceRef, Step } from "@/lib/reports/query/ast";
import {
  addDays,
  AGGREGATE_FUNCTIONS,
  asNumber,
  asText,
  compare,
  daysBetween,
  isBlank,
  isNumericKind,
  round4,
  ROW_FUNCTIONS,
  truthy,
  type Value,
  type ValueType,
} from "@/lib/reports/query/functions";
import { QueryError, type Span } from "@/lib/reports/query/lexer";
import { parseQuery } from "@/lib/reports/query/parser";
import type { ReportColumn, ReportRow } from "@/lib/reports/types";

/**
 * A query, checked against the columns its sources have and made ready to run.
 *
 * Checking happens before any row is fetched — a column that is not there, a
 * total of text, a `by` that was forgotten — so the editor can say what is
 * wrong as it is typed. Running is pure: the same query over the same rows
 * gives the same table in the browser and on the server.
 *
 * Rows only ever come in through a report source, which has already been
 * scoped to the workspace and checked against the reader's role. The language
 * reshapes those rows; it cannot reach anything else.
 */

type Row = Record<string, Value>;
type Params = Record<string, string>;
type Ctx = { row: Row; rows: Row[]; params: Params };
type Evaluator = (ctx: Ctx) => Value;
type Compiled = { run: Evaluator; type: ValueType };

/** What a query can be checked against: the columns of each source it may name. */
export type QuerySchemas = {
  reports: ReadonlyMap<string, ReportColumn[]>;
  blocks?: ReadonlyMap<string, ReportColumn[]>;
  /** The values a report is run with, named without their `$`. */
  params?: readonly string[];
};

/** What a query runs over: the rows of each source, and the report's values. */
export type QueryInputs = {
  report: (key: string) => readonly ReportRow[];
  block: (name: string) => readonly ReportRow[];
  params: Params;
};

export type QueryResult = { columns: ReportColumn[]; rows: ReportRow[] };

export type CompiledQuery = {
  columns: ReportColumn[];
  /** Report keys it reads. */
  reports: string[];
  /** Block names it reads. */
  blocks: string[];
  run: (inputs: QueryInputs) => QueryResult;
};

/** A join may multiply rows; past this, it is almost certainly matching on the wrong thing. */
export const MAX_QUERY_ROWS = 50_000;

export const DEFAULT_PARAMS = ["from", "to"] as const;

/* ──────────────────────────────────────────────────────────────────────────
   Names
   ────────────────────────────────────────────────────────────────────────── */

/** `wonValue` and `won_value` read as "Won value". */
export function humanize(name: string): string {
  const words = name
    .replace(/[_.]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return words ? words[0]!.toUpperCase() + words.slice(1) : name;
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
  const lower = typed.toLowerCase();
  let best: string | null = null;
  let bestScore = Infinity;
  for (const option of options) {
    const candidate = option.toLowerCase();
    const score = candidate.startsWith(lower) || lower.startsWith(candidate) ? 0.5 : distance(lower, candidate);
    if (score < bestScore) {
      bestScore = score;
      best = option;
    }
  }
  return best !== null && bestScore <= Math.max(2, Math.floor(typed.length / 3)) ? best : null;
}

function lookup(columns: readonly ReportColumn[], name: string): ReportColumn | undefined {
  const lower = name.toLowerCase();
  return (
    columns.find((column) => column.key === name) ??
    columns.find((column) => column.key.toLowerCase() === lower) ??
    columns.find((column) => column.label.toLowerCase() === lower)
  );
}

function unknownColumn(name: string, columns: readonly ReportColumn[], span: Span): never {
  const near = suggest(name, columns.map((column) => column.key));
  const hint = near ? ` Did you mean ${near}?` : columns.length ? ` Columns here: ${columns.slice(0, 8).map((column) => column.key).join(", ")}${columns.length > 8 ? ", …" : ""}` : "";
  throw new QueryError(`There is no column ${name} here.${hint}`, span);
}

/* ──────────────────────────────────────────────────────────────────────────
   Expressions
   ────────────────────────────────────────────────────────────────────────── */

type Env = {
  columns: readonly ReportColumn[];
  /** Columns an aggregate may read, or null where an aggregate cannot go. */
  aggregateColumns: readonly ReportColumn[] | null;
  /** Why an aggregate cannot go here. */
  noAggregate: string;
  /** A column known to the rows but not to this scope — said differently from one that is not there at all. */
  ungrouped?: readonly ReportColumn[];
  params: ReadonlySet<string>;
};

const NUMBER: ValueType = { kind: "number" };
const TEXT: ValueType = { kind: "text" };

function likePattern(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${escaped}$`, "is");
}

function equal(a: Value, b: Value): boolean {
  return !isBlank(a) && !isBlank(b) && compare(a, b) === 0;
}

function arithmetic(op: string, left: Compiled, right: Compiled, span: Span): Compiled {
  const l = left.type;
  const r = right.type;
  const numeric = isNumericKind(l.kind) && isNumericKind(r.kind);

  if (op === "+" || op === "-") {
    if (l.kind === "date" && isNumericKind(r.kind)) {
      const sign = op === "+" ? 1 : -1;
      return { type: { kind: "date" }, run: (ctx) => addDays(left.run(ctx), (asNumber(right.run(ctx)) ?? NaN) * sign) };
    }
    if (op === "-" && l.kind === "date" && r.kind === "date") {
      return { type: NUMBER, run: (ctx) => daysBetween(right.run(ctx), left.run(ctx)) };
    }
    if (op === "+" && !numeric) {
      // Text joins: "No. " + dealNo.
      return { type: TEXT, run: (ctx) => asText(left.run(ctx)) + asText(right.run(ctx)) };
    }
  }

  if (!numeric) {
    const odd = isNumericKind(l.kind) ? r : l;
    throw new QueryError(`${op} works on numbers, and this side is ${odd.kind}`, span);
  }

  const money = l.kind === "money" ? l : r.kind === "money" ? r : null;
  let type: ValueType = NUMBER;
  if (op === "+" || op === "-") type = money ?? NUMBER;
  else if (op === "*") type = l.kind === "money" && r.kind === "money" ? NUMBER : money ?? NUMBER;
  else if (op === "/") type = l.kind === "money" && r.kind !== "money" ? l : NUMBER;
  else type = l;

  const apply: Record<string, (a: number, b: number) => number | null> = {
    "+": (a, b) => a + b,
    "-": (a, b) => a - b,
    "*": (a, b) => a * b,
    "/": (a, b) => (b === 0 ? null : a / b),
    "%": (a, b) => (b === 0 ? null : a % b),
  };
  const fn = apply[op]!;
  return {
    type,
    run: (ctx) => {
      const a = asNumber(left.run(ctx));
      const b = asNumber(right.run(ctx));
      if (a === null || b === null) return null;
      const result = fn(a, b);
      return result === null || !Number.isFinite(result) ? null : round4(result);
    },
  };
}

function compileExpr(expr: Expr, env: Env): Compiled {
  switch (expr.type) {
    case "literal": {
      const value = expr.value;
      return { type: typeof value === "number" ? NUMBER : TEXT, run: () => value };
    }

    case "column": {
      const column = lookup(env.columns, expr.name);
      if (!column) {
        if (env.ungrouped && lookup(env.ungrouped, expr.name)) {
          throw new QueryError(
            `${expr.name} differs from row to row — put it inside sum(), min(), max() or count(), or add it after by`,
            expr.span,
          );
        }
        unknownColumn(expr.name, env.columns, expr.span);
      }
      const key = column.key;
      return { type: { kind: column.kind, currency: column.currency }, run: (ctx) => ctx.row[key] ?? null };
    }

    case "param": {
      if (!env.params.has(expr.name)) {
        const known = [...env.params].map((name) => `$${name}`).join(" and ");
        throw new QueryError(`There is no $${expr.name}.${known ? ` This report has ${known}.` : ""}`, expr.span);
      }
      const name = expr.name;
      return { type: { kind: "date" }, run: (ctx) => ctx.params[name] || null };
    }

    case "unary": {
      const arg = compileExpr(expr.arg, env);
      if (expr.op === "not") return { type: TEXT, run: (ctx) => !truthy(arg.run(ctx)) };
      if (!isNumericKind(arg.type.kind)) throw new QueryError(`Only a number can be negative, and this is ${arg.type.kind}`, expr.span);
      return {
        type: arg.type,
        run: (ctx) => {
          const value = asNumber(arg.run(ctx));
          return value === null ? null : -value;
        },
      };
    }

    case "binary": {
      const left = compileExpr(expr.left, env);
      const right = compileExpr(expr.right, env);
      switch (expr.op) {
        case "and":
          return { type: TEXT, run: (ctx) => truthy(left.run(ctx)) && truthy(right.run(ctx)) };
        case "or":
          return { type: TEXT, run: (ctx) => truthy(left.run(ctx)) || truthy(right.run(ctx)) };
        case "=":
          return { type: TEXT, run: (ctx) => equal(left.run(ctx), right.run(ctx)) };
        case "!=":
          // A blank is not any value, so it is "not" every one of them.
          return { type: TEXT, run: (ctx) => !equal(left.run(ctx), right.run(ctx)) };
        case "<":
        case "<=":
        case ">":
        case ">=": {
          const test = { "<": (n: number) => n < 0, "<=": (n: number) => n <= 0, ">": (n: number) => n > 0, ">=": (n: number) => n >= 0 }[expr.op];
          return {
            type: TEXT,
            run: (ctx) => {
              const a = left.run(ctx);
              const b = right.run(ctx);
              return !isBlank(a) && !isBlank(b) && test(compare(a, b));
            },
          };
        }
        case "like": {
          const fixed = expr.right.type === "literal" && typeof expr.right.value === "string" ? likePattern(expr.right.value) : null;
          return {
            type: TEXT,
            run: (ctx) => {
              const value = left.run(ctx);
              if (isBlank(value)) return false;
              return (fixed ?? likePattern(asText(right.run(ctx)))).test(asText(value));
            },
          };
        }
        default:
          return arithmetic(expr.op, left, right, expr.span);
      }
    }

    case "in": {
      const arg = compileExpr(expr.arg, env);
      const list = expr.list.map((item) => compileExpr(item, env));
      const negated = expr.negated;
      return {
        type: TEXT,
        run: (ctx) => {
          const value = arg.run(ctx);
          const hit = list.some((item) => equal(value, item.run(ctx)));
          return negated ? !hit : hit;
        },
      };
    }

    case "isNull": {
      const arg = compileExpr(expr.arg, env);
      const negated = expr.negated;
      return { type: TEXT, run: (ctx) => isBlank(arg.run(ctx)) !== negated };
    }

    case "call":
      return compileCall(expr, env);
  }
}

function checkArity(name: string, count: number, spec: { min: number; max: number; signature: string }, span: Span) {
  if (count < spec.min || count > spec.max) throw new QueryError(`Write it as ${spec.signature}`, span);
}

const NUMBERS_ONLY = new Set(["sum", "avg", "median"]);

function compileCall(expr: Extract<Expr, { type: "call" }>, env: Env): Compiled {
  const aggregate = AGGREGATE_FUNCTIONS[expr.name];
  if (aggregate) {
    if (!env.aggregateColumns) throw new QueryError(env.noAggregate, expr.nameSpan);
    checkArity(expr.name, expr.args.length, aggregate, expr.span);
    const inner: Env = {
      columns: env.aggregateColumns,
      aggregateColumns: null,
      noAggregate: "One total cannot sit inside another",
      params: env.params,
    };
    const arg = expr.args[0] ? compileExpr(expr.args[0], inner) : null;
    if (arg && NUMBERS_ONLY.has(expr.name) && !isNumericKind(arg.type.kind)) {
      throw new QueryError(`${expr.name} needs numbers, and this is ${arg.type.kind} — try count() or count_distinct()`, expr.args[0]!.span);
    }
    const type = aggregate.type(arg ? [arg.type] : []);
    // Worked out once per set of rows, not once per row that asks for it.
    const cache = new WeakMap<Row[], Value>();
    return {
      type,
      run: (ctx) => {
        const known = cache.get(ctx.rows);
        if (known !== undefined) return known;
        const value = arg
          ? aggregate.run(ctx.rows.map((row) => arg.run({ row, rows: ctx.rows, params: ctx.params })))
          : ctx.rows.length;
        cache.set(ctx.rows, value);
        return value;
      },
    };
  }

  const fn = ROW_FUNCTIONS[expr.name];
  if (!fn) {
    const near = suggest(expr.name, [...Object.keys(ROW_FUNCTIONS), ...Object.keys(AGGREGATE_FUNCTIONS)]);
    throw new QueryError(`There is no function ${expr.name}.${near ? ` Did you mean ${near}?` : ""}`, expr.nameSpan);
  }
  checkArity(expr.name, expr.args.length, fn, expr.span);
  const args = expr.args.map((arg) => compileExpr(arg, env));
  return {
    type: fn.type(args.map((arg) => arg.type)),
    run: (ctx) => fn.run(args.map((arg) => arg.run(ctx))),
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   Steps
   ────────────────────────────────────────────────────────────────────────── */

type Op = (rows: Row[], inputs: QueryInputs) => Row[];

function rowEnv(columns: readonly ReportColumn[], params: ReadonlySet<string>): Env {
  return { columns, aggregateColumns: columns, noAggregate: "", params };
}

function checkName(item: NamedExpr) {
  if (item.name.toLowerCase() === "id") throw new QueryError("id is kept for the row itself — choose another name", item.span);
}

function newColumn(item: NamedExpr, type: ValueType, from?: ReportColumn): ReportColumn {
  if (item.bare && from) return from;
  return {
    key: item.name,
    label: item.quoted ? item.name : humanize(item.name),
    kind: type.kind,
    ...(type.currency ? { currency: type.currency } : {}),
  };
}

/** Replace a column of the same key, or add it at the end. */
function withColumn(columns: ReportColumn[], column: ReportColumn): ReportColumn[] {
  const index = columns.findIndex((candidate) => candidate.key.toLowerCase() === column.key.toLowerCase());
  if (index === -1) return [...columns, column];
  const next = [...columns];
  next[index] = column;
  return next;
}

function uniqueNames(items: NamedExpr[], keys: string[]) {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const key = keys[index]!.toLowerCase();
    if (seen.has(key)) throw new QueryError(`${keys[index]} is named twice`, item.span);
    seen.add(key);
  });
}

function sourceColumns(source: SourceRef, schemas: QuerySchemas): ReportColumn[] {
  if (source.kind === "report") {
    const columns = schemas.reports.get(source.key);
    if (columns) return columns;
    const near = suggest(source.key, [...schemas.reports.keys()]);
    throw new QueryError(`There is no source ${source.key} you can read.${near ? ` Did you mean ${near}?` : ""}`, source.span);
  }
  const columns = schemas.blocks?.get(source.name);
  if (columns) return columns;
  const near = suggest(source.name, [...(schemas.blocks?.keys() ?? [])]);
  throw new QueryError(`There is no block @${source.name} with a result.${near ? ` Did you mean @${near}?` : ""}`, source.span);
}

function sourceRows(source: SourceRef, inputs: QueryInputs): Row[] {
  // A copy of the list, never of the rows: nothing downstream changes a row in place.
  return Array.from(source.kind === "report" ? inputs.report(source.key) : inputs.block(source.name));
}

/** `a = lead.b and c = lead.d`, as pairs of sides: ours, then theirs. */
function joinPairs(on: Expr, alias: string): Array<[Expr, Expr]> {
  const terms: Expr[] = [];
  const flatten = (expr: Expr) => {
    if (expr.type === "binary" && expr.op === "and") {
      flatten(expr.left);
      flatten(expr.right);
    } else terms.push(expr);
  };
  flatten(on);

  const prefix = `${alias.toLowerCase()}.`;
  const side = (expr: Expr): "ours" | "theirs" | "both" | "none" => {
    const names: string[] = [];
    const walk = (node: Expr) => {
      if (node.type === "column") names.push(node.name.toLowerCase());
      else if (node.type === "unary") walk(node.arg);
      else if (node.type === "binary") [node.left, node.right].forEach(walk);
      else if (node.type === "in") [node.arg, ...node.list].forEach(walk);
      else if (node.type === "isNull") walk(node.arg);
      else if (node.type === "call") node.args.forEach(walk);
    };
    walk(expr);
    if (names.length === 0) return "none";
    const theirs = names.filter((name) => name.startsWith(prefix)).length;
    return theirs === 0 ? "ours" : theirs === names.length ? "theirs" : "both";
  };

  return terms.map((term) => {
    if (term.type !== "binary" || term.op !== "=") {
      throw new QueryError(`A join matches with =, like: on client = ${alias}.client`, term.span);
    }
    const left = side(term.left);
    const right = side(term.right);
    if (left === "ours" && right === "theirs") return [term.left, term.right];
    if (left === "theirs" && right === "ours") return [term.right, term.left];
    throw new QueryError(`One side of = names this table's column, the other ${alias}'s, like: client = ${alias}.client`, term.span);
  });
}

function joinKey(values: Value[]): string | null {
  if (values.some(isBlank)) return null;
  return values.map((value) => (typeof value === "number" ? String(value) : asText(value).trim().toLowerCase())).join("\u0000");
}

function tooMany(span: Span): never {
  throw new QueryError(
    `This makes more than ${MAX_QUERY_ROWS.toLocaleString("en-US")} rows — match the join on something more specific`,
    span,
  );
}

function compileStep(
  step: Step,
  columns: ReportColumn[],
  schemas: QuerySchemas,
  params: ReadonlySet<string>,
): { columns: ReportColumn[]; op: Op } {
  switch (step.type) {
    case "from": {
      const source = step.source;
      return { columns: sourceColumns(source, schemas), op: (_rows, inputs) => sourceRows(source, inputs) };
    }

    case "join": {
      const theirs = sourceColumns(step.source, schemas);
      const alias = step.alias;
      const prefixed = theirs.map((column) => ({
        ...column,
        key: `${alias}.${column.key}`,
        label: `${column.label} · ${alias}`,
        hidden: undefined,
        total: undefined,
      }));
      if (columns.some((column) => column.key.toLowerCase().startsWith(`${alias.toLowerCase()}.`))) {
        throw new QueryError(`${alias} is already joined — name this one with as`, step.source.span);
      }
      const noTotal = "A join matches row by row — totals go in a later step";
      const pairs = joinPairs(step.on, alias).map(([ours, theirsSide]) => [
        compileExpr(ours, { columns, aggregateColumns: null, noAggregate: noTotal, params }),
        compileExpr(theirsSide, { columns: prefixed, aggregateColumns: null, noAggregate: noTotal, params }),
      ]) as Array<[Compiled, Compiled]>;
      const source = step.source;
      const inner = step.inner;
      const span = step.span;
      const blank = Object.fromEntries(prefixed.map((column) => [column.key, null]));

      return {
        columns: [...columns, ...prefixed],
        op: (rows, inputs) => {
          const right = sourceRows(source, inputs).map((row) =>
            Object.fromEntries(theirs.map((column) => [`${alias}.${column.key}`, row[column.key] ?? null])),
          );
          const index = new Map<string, Row[]>();
          for (const row of right) {
            const key = joinKey(pairs.map(([, side]) => side.run({ row, rows: right, params: inputs.params })));
            if (key === null) continue;
            const bucket = index.get(key);
            if (bucket) bucket.push(row);
            else index.set(key, [row]);
          }
          const out: Row[] = [];
          for (const row of rows) {
            const key = joinKey(pairs.map(([side]) => side.run({ row, rows, params: inputs.params })));
            const matches = key === null ? undefined : index.get(key);
            if (matches) for (const match of matches) out.push({ ...row, ...match });
            else if (!inner) out.push({ ...row, ...blank });
            if (out.length > MAX_QUERY_ROWS) tooMany(span);
          }
          return out;
        },
      };
    }

    case "where": {
      const test = compileExpr(step.expr, rowEnv(columns, params));
      return {
        columns,
        op: (rows, inputs) => rows.filter((row) => truthy(test.run({ row, rows, params: inputs.params }))),
      };
    }

    case "derive": {
      uniqueNames(step.items, step.items.map((item) => item.name));
      let next = columns;
      const passes: Array<{ key: string; value: Compiled }> = [];
      for (const item of step.items) {
        checkName(item);
        const value = compileExpr(item.expr, rowEnv(next, params));
        const column = newColumn(item, value.type);
        next = withColumn(next, column);
        passes.push({ key: column.key, value });
      }
      return {
        columns: next,
        // One pass per column, so a later one can total an earlier one.
        op: (rows, inputs) =>
          passes.reduce(
            (current, { key, value }) =>
              current.map((row) => ({ ...row, [key]: value.run({ row, rows: current, params: inputs.params }) })),
            rows,
          ),
      };
    }

    case "select": {
      const env = rowEnv(columns, params);
      const picked = step.items.map((item) => {
        checkName(item);
        const value = compileExpr(item.expr, env);
        const from = item.bare ? lookup(columns, item.name) : undefined;
        // Named in a select, a column is wanted: it shows even if its report folds it away.
        return { column: newColumn(item, value.type, from && { ...from, hidden: undefined }), value };
      });
      uniqueNames(step.items, picked.map((entry) => entry.column.key));
      return {
        columns: picked.map((entry) => entry.column),
        op: (rows, inputs) =>
          rows.map((row) =>
            Object.fromEntries(picked.map(({ column, value }) => [column.key, value.run({ row, rows, params: inputs.params })])),
          ),
      };
    }

    case "drop": {
      const gone = new Set(
        step.columns.map((entry) => (lookup(columns, entry.name) ?? unknownColumn(entry.name, columns, entry.span)).key),
      );
      const kept = columns.filter((column) => !gone.has(column.key));
      if (kept.length === 0) throw new QueryError("That would drop every column", step.span);
      return { columns: kept, op: (rows) => rows };
    }

    case "aggregate": {
      const byEnv: Env = {
        columns,
        aggregateColumns: null,
        noAggregate: "by groups by a value from each row — totals go before by",
        params,
      };
      const by = step.by.map((item) => {
        checkName(item);
        const value = compileExpr(item.expr, byEnv);
        const from = item.bare ? lookup(columns, item.name) : undefined;
        return { column: newColumn(item, value.type, from && { ...from, hidden: undefined, total: undefined }), value };
      });
      const groupColumns = by.map((entry) => entry.column);
      const itemEnv: Env = { columns: groupColumns, aggregateColumns: columns, noAggregate: "", ungrouped: columns, params };
      const items = step.items.map((item) => {
        checkName(item);
        const value = compileExpr(item.expr, itemEnv);
        return { column: newColumn(item, value.type), value };
      });
      const all = [...by, ...items];
      uniqueNames([...step.by, ...step.items], all.map((entry) => entry.column.key));

      return {
        columns: all.map((entry) => entry.column),
        op: (rows, inputs) => {
          const groups = new Map<string, { key: Row; rows: Row[] }>();
          if (by.length === 0) groups.set("", { key: {}, rows });
          else {
            for (const row of rows) {
              const ctx = { row, rows, params: inputs.params };
              const values = by.map(({ value }) => value.run(ctx));
              const id = values.map((value) => (isBlank(value) ? "\u0001" : asText(value))).join("\u0000");
              let group = groups.get(id);
              if (!group) {
                group = { key: Object.fromEntries(by.map(({ column }, index) => [column.key, values[index] ?? null])), rows: [] };
                groups.set(id, group);
              }
              group.rows.push(row);
            }
          }
          return [...groups.values()].map((group) => {
            const out: Row = { ...group.key };
            const ctx = { row: group.key, rows: group.rows, params: inputs.params };
            for (const { column, value } of items) out[column.key] = value.run(ctx);
            return out;
          });
        },
      };
    }

    case "sort": {
      const env = rowEnv(columns, params);
      const keys = step.keys.map((key) => ({ value: compileExpr(key.expr, env), dir: key.dir === "desc" ? -1 : 1 }));
      return {
        columns,
        op: (rows, inputs) => {
          const decorated = rows.map((row, index) => ({
            row,
            index,
            values: keys.map(({ value }) => value.run({ row, rows, params: inputs.params })),
          }));
          decorated.sort((a, b) => {
            for (let i = 0; i < keys.length; i += 1) {
              const va = a.values[i]!;
              const vb = b.values[i]!;
              // Blanks last, whichever way.
              if (isBlank(va) !== isBlank(vb)) return isBlank(va) ? 1 : -1;
              if (isBlank(va)) continue;
              const result = compare(va, vb);
              if (result !== 0) return result * keys[i]!.dir;
            }
            return a.index - b.index;
          });
          return decorated.map((entry) => entry.row);
        },
      };
    }

    case "take": {
      const count = step.count;
      return { columns, op: (rows) => rows.slice(0, count) };
    }
  }
}

/**
 * The query checked and made ready to run. Throws `QueryError` at the first
 * thing wrong, with where it is.
 */
export function compileQuery(text: string, schemas: QuerySchemas): CompiledQuery {
  const { steps } = parseQuery(text);
  const params = new Set(schemas.params ?? DEFAULT_PARAMS);
  let columns: ReportColumn[] = [];
  const ops: Array<{ op: Op; span: Span }> = [];
  const reports = new Set<string>();
  const blocks = new Set<string>();

  for (const step of steps) {
    if (step.type === "from" || step.type === "join") {
      if (step.source.kind === "report") reports.add(step.source.key);
      else blocks.add(step.source.name);
    }
    const compiled = compileStep(step, columns, schemas, params);
    columns = compiled.columns;
    ops.push({ op: compiled.op, span: step.span });
  }

  const final = columns;
  return {
    columns: final,
    reports: [...reports],
    blocks: [...blocks],
    run: (inputs) => {
      let rows: Row[] = [];
      for (const { op, span } of ops) {
        try {
          rows = op(rows, inputs);
        } catch (error) {
          if (error instanceof QueryError) throw error;
          throw new QueryError(error instanceof Error ? error.message : "This step failed", span);
        }
      }
      return {
        columns: final,
        rows: rows.map((row, index) => {
          const out: ReportRow = { id: String(index + 1) };
          for (const column of final) out[column.key] = row[column.key] ?? null;
          return out;
        }),
      };
    },
  };
}

export type QueryProblem = { message: string; span: Span };

/** The query checked, as an answer rather than a throw. */
export function checkQuery(
  text: string,
  schemas: QuerySchemas,
): { ok: true; query: CompiledQuery } | { ok: false; problem: QueryProblem } {
  try {
    return { ok: true, query: compileQuery(text, schemas) };
  } catch (error) {
    if (error instanceof QueryError) return { ok: false, problem: { message: error.message, span: error.span } };
    throw error;
  }
}
