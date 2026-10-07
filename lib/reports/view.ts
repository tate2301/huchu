import { z } from "zod";

import {
  AGGREGATES,
  CONDITION_OPS,
  type Aggregate,
  type Condition,
  type ReportColumn,
  type ReportColumnKind,
  type ReportMeta,
  type ReportRow,
  type ReportValue,
  type ReportView,
} from "@/lib/reports/types";

/**
 * A view applied to rows: filtered, sorted, grouped and totalled.
 *
 * Pure, and the only place any of it happens. The screen runs it over the rows
 * it holds and the export runs it again over the same rows on the server, so a
 * PDF is exactly the table somebody was looking at — not a second opinion of
 * what they asked for.
 */

const NUMERIC: ReadonlySet<ReportColumnKind> = new Set(["number", "money"]);

export function isNumeric(kind: ReportColumnKind): boolean {
  return NUMERIC.has(kind);
}

/** The totals that mean something for a kind of column. */
export function aggregatesFor(kind: ReportColumnKind): Aggregate[] {
  if (isNumeric(kind)) return [...AGGREGATES];
  if (kind === "date") return ["min", "max", "count", "distinct"];
  return ["count", "distinct"];
}

export const AGGREGATE_LABELS: Record<Aggregate, string> = {
  sum: "Sum",
  avg: "Average",
  min: "Lowest",
  max: "Highest",
  count: "Count",
  distinct: "Distinct",
};

/* ──────────────────────────────────────────────────────────────────────────
   Defaults and repair
   ────────────────────────────────────────────────────────────────────────── */

export function defaultView(meta: Pick<ReportMeta, "columns" | "defaults" | "defaultView">): ReportView {
  // A view the workspace saved is everyone's starting point, fitted to today's columns.
  if (meta.defaultView) return fitView(meta.defaultView, meta.columns);
  return {
    columns: meta.columns.map((column) => ({ key: column.key, hidden: column.hidden === true })),
    conditions: [],
    search: "",
    sort: meta.defaults.sort ?? [],
    groupBy: meta.defaults.groupBy ?? null,
    totals: Object.fromEntries(
      meta.columns.filter((column) => column.total).map((column) => [column.key, column.total!]),
    ),
  };
}

/**
 * A view made to fit the columns a source has today.
 *
 * Views outlive code: one saved last month may name a column that has since
 * gone, and will not know about one added since. Unknown columns are dropped;
 * new ones join at the end in their default visibility.
 */
export function fitView(view: ReportView, columns: ReportColumn[]): ReportView {
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const seen = new Set<string>();
  const ordered = view.columns.filter((entry) => {
    if (!byKey.has(entry.key) || seen.has(entry.key)) return false;
    seen.add(entry.key);
    return true;
  });
  for (const column of columns) {
    if (!seen.has(column.key)) ordered.push({ key: column.key, hidden: column.hidden === true });
  }
  return {
    columns: ordered,
    conditions: view.conditions.filter((condition) => byKey.has(condition.column)),
    search: view.search,
    sort: view.sort.filter((rule) => byKey.has(rule.column)),
    groupBy: view.groupBy && byKey.has(view.groupBy) ? view.groupBy : null,
    totals: Object.fromEntries(
      Object.entries(view.totals).filter(
        ([key, fn]) => byKey.has(key) && aggregatesFor(byKey.get(key)!.kind).includes(fn),
      ),
    ),
  };
}

/** The columns a view shows, in its order. */
export function visibleColumns(view: ReportView, columns: ReportColumn[]): ReportColumn[] {
  const byKey = new Map(columns.map((column) => [column.key, column]));
  return view.columns
    .filter((entry) => !entry.hidden)
    .map((entry) => byKey.get(entry.key))
    .filter((column): column is ReportColumn => Boolean(column));
}

/* ──────────────────────────────────────────────────────────────────────────
   Values
   ────────────────────────────────────────────────────────────────────────── */

function isBlank(value: ReportValue | undefined): boolean {
  return value === null || value === undefined || value === "";
}

function asNumber(value: ReportValue | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function asText(value: ReportValue | undefined): string {
  if (isBlank(value)) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** Blanks last whichever way the column is sorted: nothing is not a value. */
export function compareValues(a: ReportValue | undefined, b: ReportValue | undefined, kind: ReportColumnKind): number {
  const blankA = isBlank(a);
  const blankB = isBlank(b);
  if (blankA || blankB) return blankA === blankB ? 0 : blankA ? 1 : -1;
  if (isNumeric(kind)) return (asNumber(a) ?? 0) - (asNumber(b) ?? 0);
  // Dates are ISO strings, which sort as text.
  return collator.compare(asText(a), asText(b));
}

/* ──────────────────────────────────────────────────────────────────────────
   Filtering
   ────────────────────────────────────────────────────────────────────────── */

function matches(value: ReportValue | undefined, condition: Condition, kind: ReportColumnKind): boolean {
  const { op } = condition;
  if (op === "empty") return isBlank(value);
  if (op === "notEmpty") return !isBlank(value);

  const wanted = condition.value;
  if (wanted === undefined) return true;
  const list = Array.isArray(wanted) ? wanted : [wanted];

  if (op === "is" || op === "isNot") {
    if (list.length === 0) return true;
    const hit = list.some((candidate) =>
      isNumeric(kind)
        ? asNumber(value) !== null && asNumber(value) === asNumber(candidate)
        : collator.compare(asText(value), candidate) === 0,
    );
    return op === "is" ? hit : !hit;
  }

  if (op === "contains") {
    const needle = list[0]?.trim().toLowerCase() ?? "";
    return needle === "" || asText(value).toLowerCase().includes(needle);
  }

  if (isBlank(value)) return false;
  const [low, high] = list;
  const cmp = (bound: string | undefined) =>
    bound === undefined || bound === "" ? null : compareValues(value, isNumeric(kind) ? asNumber(bound) : bound, kind);

  if (op === "gt") {
    const result = cmp(low);
    return result === null || result > 0;
  }
  if (op === "lt") {
    const result = cmp(low);
    return result === null || result < 0;
  }
  // between: inclusive at both ends, either end optional.
  const fromLow = cmp(low);
  const fromHigh = cmp(high);
  return (fromLow === null || fromLow >= 0) && (fromHigh === null || fromHigh <= 0);
}

export function filterRows(rows: ReportRow[], columns: ReportColumn[], view: ReportView): ReportRow[] {
  const kinds = new Map(columns.map((column) => [column.key, column.kind]));
  const shown = visibleColumns(view, columns);
  const needle = view.search.trim().toLowerCase();
  return rows.filter((row) => {
    for (const condition of view.conditions) {
      const kind = kinds.get(condition.column);
      if (kind && !matches(row[condition.column], condition, kind)) return false;
    }
    if (!needle) return true;
    // Search reads what is on screen, not columns somebody hid.
    return shown.some((column) => asText(row[column.key]).toLowerCase().includes(needle));
  });
}

/* ──────────────────────────────────────────────────────────────────────────
   Sorting
   ────────────────────────────────────────────────────────────────────────── */

export function sortRows(rows: ReportRow[], columns: ReportColumn[], view: ReportView): ReportRow[] {
  if (view.sort.length === 0) return rows;
  const kinds = new Map(columns.map((column) => [column.key, column.kind]));
  return [...rows].sort((a, b) => {
    for (const rule of view.sort) {
      const kind = kinds.get(rule.column) ?? "text";
      const va = a[rule.column];
      const vb = b[rule.column];
      // Blanks stay last in both directions.
      if (isBlank(va) !== isBlank(vb)) return isBlank(va) ? 1 : -1;
      const result = compareValues(va, vb, kind);
      if (result !== 0) return rule.dir === "asc" ? result : -result;
    }
    return 0;
  });
}

/* ──────────────────────────────────────────────────────────────────────────
   Totals
   ────────────────────────────────────────────────────────────────────────── */

export function aggregate(rows: ReportRow[], column: ReportColumn, fn: Aggregate): ReportValue {
  const values = rows.map((row) => row[column.key]).filter((value) => !isBlank(value));
  if (fn === "count") return values.length;
  if (fn === "distinct") return new Set(values.map(asText)).size;
  if (values.length === 0) return null;

  if (isNumeric(column.kind)) {
    const numbers = values.map(asNumber).filter((value): value is number => value !== null);
    if (numbers.length === 0) return null;
    if (fn === "sum") return round(numbers.reduce((total, value) => total + value, 0));
    if (fn === "avg") return round(numbers.reduce((total, value) => total + value, 0) / numbers.length);
    return fn === "min" ? Math.min(...numbers) : Math.max(...numbers);
  }

  if (fn === "min" || fn === "max") {
    const sorted = [...values].sort((a, b) => compareValues(a, b, column.kind));
    return fn === "min" ? sorted[0]! : sorted[sorted.length - 1]!;
  }
  return null;
}

/** Money and averages carry float dust; four places is more than any figure shows. */
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** Σnum ÷ Σden × 100 over the rows, one place; null when the denominator is nothing. */
export function ratioOf(rows: ReportRow[], ratio: { num: string; den: string }): ReportValue {
  let num = 0;
  let den = 0;
  for (const row of rows) {
    num += asNumber(row[ratio.num] ?? null) ?? 0;
    den += asNumber(row[ratio.den] ?? null) ?? 0;
  }
  return den === 0 ? null : Math.round((num / den) * 1000) / 10;
}

export function totalsFor(rows: ReportRow[], columns: ReportColumn[], view: ReportView): Record<string, ReportValue> {
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const totals: Record<string, ReportValue> = {};
  for (const [key, fn] of Object.entries(view.totals)) {
    const column = byKey.get(key);
    if (column?.ratio && fn === "avg") totals[key] = ratioOf(rows, column.ratio);
    else if (column) totals[key] = aggregate(rows, column.totalOf ? { ...column, key: column.totalOf } : column, fn);
  }
  return totals;
}

/* ──────────────────────────────────────────────────────────────────────────
   The whole thing
   ────────────────────────────────────────────────────────────────────────── */

export type ReportGroup = {
  /** The grouped column's value; blank groups are one group, drawn as "None". */
  value: ReportValue;
  rows: ReportRow[];
  totals: Record<string, ReportValue>;
};

export type AppliedView = {
  columns: ReportColumn[];
  rows: ReportRow[];
  /** Null when the view is not grouped. Groups follow the sort of their first row. */
  groups: ReportGroup[] | null;
  totals: Record<string, ReportValue>;
};

export function applyView(rows: ReportRow[], columns: ReportColumn[], view: ReportView): AppliedView {
  const fitted = fitView(view, columns);
  const shown = visibleColumns(fitted, columns);
  const sorted = sortRows(filterRows(rows, columns, fitted), columns, fitted);
  const totals = totalsFor(sorted, columns, fitted);

  if (!fitted.groupBy) return { columns: shown, rows: sorted, groups: null, totals };

  const key = fitted.groupBy;
  const buckets = new Map<string, ReportGroup>();
  for (const row of sorted) {
    const value = isBlank(row[key]) ? null : row[key]!;
    const id = value === null ? "\u0000" : asText(value);
    let group = buckets.get(id);
    if (!group) {
      group = { value, rows: [], totals: {} };
      buckets.set(id, group);
    }
    group.rows.push(row);
  }
  const groups = [...buckets.values()].map((group) => ({
    ...group,
    totals: totalsFor(group.rows, columns, fitted),
  }));
  return { columns: shown, rows: sorted, groups, totals };
}

/* ──────────────────────────────────────────────────────────────────────────
   Carrying a view: URL and request body
   ────────────────────────────────────────────────────────────────────────── */

export const reportViewSchema = z.object({
  columns: z.array(z.object({ key: z.string().max(64), hidden: z.boolean() })).max(80),
  conditions: z
    .array(
      z.object({
        column: z.string().max(64),
        op: z.enum(CONDITION_OPS),
        value: z.union([z.string().max(200), z.array(z.string().max(200)).max(50)]).optional(),
      }),
    )
    .max(20),
  search: z.string().max(200),
  sort: z.array(z.object({ column: z.string().max(64), dir: z.enum(["asc", "desc"]) })).max(5),
  groupBy: z.string().max(64).nullable(),
  totals: z.record(z.string().max(64), z.enum(AGGREGATES)),
});

/** A view as a URL-safe string, so a report can be linked as it is seen. */
export function encodeView(view: ReportView): string {
  const json = JSON.stringify(view);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeView(encoded: string | null | undefined): ReportView | null {
  if (!encoded) return null;
  try {
    const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = reportViewSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * The rows drawn under a limit, taken in order across groups (or from the flat
 * list), so a report of forty groups does not put every row in the page at once.
 * One list per group, or one list when ungrouped; folded groups take nothing.
 */
export function rowsWithin(
  applied: AppliedView,
  limit: number,
  folded: (group: ReportGroup) => boolean = () => false,
): ReportRow[][] {
  let left = limit;
  const take = (rows: ReportRow[]) => {
    const slice = rows.slice(0, Math.max(0, left));
    left -= slice.length;
    return slice;
  };
  return applied.groups ? applied.groups.map((group) => (folded(group) ? [] : take(group.rows))) : [take(applied.rows)];
}
