import { fillTemplate } from "@/lib/reports/actions";
import type {
  CellKind,
  Condition,
  ListColumn,
  ListFilter,
  ListSpecPublic,
  ReportRow,
  ReportValue,
  ResolvedListQuery,
} from "@/lib/reports/types";
import { filterRows } from "@/lib/reports/view";
import { formatCount, formatMoney, formatPercent, formatSigned } from "@/lib/workspace/format";

/**
 * The ListFrame's arithmetic (00-foundations 5.4), kept out of the components
 * so it can be tested: which columns fit, the grid they make, how a value
 * prints, what the sort and filter buttons say, which pages the pager offers.
 */

/** Cells that hold a figure: right-aligned by default, and totalled. */
const FIGURE_CELLS: ReadonlySet<CellKind> = new Set(["num", "money", "diff", "owed", "zero", "edit-money"]);

export function isFigure(column: Pick<ListColumn, "cell">): boolean {
  return FIGURE_CELLS.has(column.cell);
}

export function alignOf(column: Pick<ListColumn, "cell" | "align">): "start" | "end" {
  return column.align ?? (isFigure(column) ? "end" : "start");
}

/* ──────────────────────────────────────────────────────────────────────────
   Widths (5.4.4 folding, 5.5.3 priorities)
   ────────────────────────────────────────────────────────────────────────── */

/** How the toolbar folds at a width (5.4.4). */
export type Fold = {
  /** ≤1060: Sort, Group and Columns go into View. */
  view: boolean;
  /** ≤860: the primary chips go into Filters; the second selection action into ⋯. */
  chips: boolean;
  /** ≤720: the `/` hint, "Rows per page", "Back to top" words; the third selection action. */
  hints: boolean;
  /** ≤640: the count, Clear, the divider, "Select all". */
  count: boolean;
};

export function foldAt(width: number | null): Fold {
  if (width === null) return { view: false, chips: false, hints: false, count: false };
  return { view: width <= 1060, chips: width <= 860, hints: width <= 720, count: width <= 640 };
}

/** The columns drawn: not hidden by the person, and not dropped for width (3 at ≤1140, 2 at ≤940). */
export function shownColumns(columns: ListColumn[], hidden: readonly string[], width: number | null): ListColumn[] {
  const drop = width === null ? 9 : width <= 940 ? 2 : width <= 1140 ? 3 : 9;
  return columns.filter((column, index) => {
    if (index > 0 && hidden.includes(column.key)) return false;
    return (column.priority ?? 1) < drop;
  });
}

/** The smallest a track can be: "104px" → 104, "minmax(132px,1fr)" → 132. */
export function trackMin(width: string): number {
  const match = /(\d+(?:\.\d+)?)px/.exec(width);
  return match ? Number(match[1]) : 0;
}

/** Tick, the columns, the row menu. */
export function gridTemplate(columns: ListColumn[]): string {
  return ["40px", ...columns.map((column) => column.width), "44px"].join(" ");
}

export function gridMinWidth(columns: ListColumn[]): number {
  return 40 + 44 + columns.reduce((sum, column) => sum + trackMin(column.width), 0);
}

/** How many columns at the end hold figures: the group heading's label spans up to them. */
export function trailingFigures(columns: ListColumn[]): number {
  let count = 0;
  for (let index = columns.length - 1; index > 0 && isFigure(columns[index]!); index -= 1) count += 1;
  return count;
}

/**
 * Figures pad 0 10 like every cell, except the last figure column, which
 * keeps 20px on its right (Main board) — less the 6px a pill already
 * carries, so a row's pill and the total under it end on the same line.
 * `pill` is false for the head, the totals and group subtotals.
 */
export function cellPadding(column: ListColumn, last: boolean, pill = true): string | undefined {
  if (alignOf(column) !== "end" || !last) return undefined;
  return pill && (column.cell === "diff" || column.cell === "owed") ? "0 14px 0 10px" : "0 20px 0 10px";
}

/* ──────────────────────────────────────────────────────────────────────────
   Values (5.4.7)
   ────────────────────────────────────────────────────────────────────────── */

export function isBlank(value: ReportValue | undefined): boolean {
  return value === null || value === undefined || value === "";
}

/** A shift longer than this is a drawer left open from another day (5.4.7 duration). */
export const STALE_MINUTES = 12 * 60;

export type DurationState = "running" | "stale" | "done";

export function durationState(column: ListColumn, row: ReportRow): DurationState {
  const running = column.runningKey ? Boolean(row[column.runningKey]) : false;
  if (!running) return "done";
  return Number(row[column.key] ?? 0) > STALE_MINUTES ? "stale" : "running";
}

/** The words a cell prints, and its `title` (the full value). */
export function cellText(column: ListColumn, row: ReportRow): string {
  const value = row[column.key];
  if (isBlank(value)) return "—";
  const currency = column.currency ?? "USD";
  switch (column.cell) {
    case "money":
    case "zero":
    case "owed":
    case "edit-money":
      return formatMoney(Number(value), currency);
    case "diff":
      return formatSigned(Number(value), currency);
    case "num": {
      if (column.percent) return formatPercent(Number(value));
      const unit = column.unitKey ? row[column.unitKey] : null;
      return isBlank(unit) ? formatCount(Number(value)) : `${formatCount(Number(value))} ${String(unit)}`;
    }
    default:
      return String(value);
  }
}

/** A total or subtotal as the totals band prints it. */
export function totalText(column: ListColumn, value: ReportValue | undefined): string {
  if (isBlank(value)) return "";
  const currency = column.currency ?? "USD";
  if (column.cell === "diff") return formatSigned(Number(value), currency);
  if (column.cell === "num") return column.percent ? formatPercent(Number(value)) : formatCount(Number(value));
  if (isFigure(column)) return formatMoney(Number(value), currency);
  return String(value);
}

/** A signed figure's colour role: negative bad; positive warn (variance) or ok (gain); zero quiet. */
export function diffTone(column: Pick<ListColumn, "diff">, value: ReportValue | undefined): "bad" | "warn" | "ok" | "zero" {
  const n = Number(value ?? 0);
  if (Math.round(n * 100) === 0) return "zero";
  if (n < 0) return "bad";
  return column.diff === "gain" ? "ok" : "warn";
}

/** The ticked rows' totals, worked out in the browser from the rows it holds (5.4.8). */
export function selectionTotals(columns: ListColumn[], rows: ReportRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const column of columns) {
    if (column.total !== "sum") continue;
    out[column.key] = Math.round(rows.reduce((sum, row) => sum + (Number(row[column.key]) || 0), 0) * 100) / 100;
  }
  return out;
}

/** Whether a row matches a row action's `when`. */
export function rowMatches(row: ReportRow, columns: ListColumn[], when: Condition[] | undefined): boolean {
  if (!when?.length) return true;
  return (
    filterRows([row], columns, {
      columns: columns.map((column) => ({ key: column.key, hidden: false })),
      conditions: when,
      search: "",
      sort: [],
      groupBy: null,
      totals: {},
    }).length === 1
  );
}

/** A bulk link from the ticked rows: `{min:key}` / `{max:key}` over them, then any `{key}` from the first. */
export function bulkHref(template: string, rows: ReportRow[]): string | null {
  let complete = true;
  const filled = template.replace(/\{(min|max):(\w+)\}/g, (_, fn: string, key: string) => {
    const values = rows
      .map((row) => row[key])
      .filter((value): value is string | number => !isBlank(value) && typeof value !== "boolean")
      .map(String)
      .sort();
    const value = fn === "min" ? values[0] : values[values.length - 1];
    if (value === undefined) complete = false;
    return encodeURIComponent(value ?? "");
  });
  if (!complete) return null;
  return rows[0] ? fillTemplate(filled, rows[0], true) : filled.includes("{") ? null : filled;
}

/** The row keys a bulk action reads, so "Select all" can fetch them beside the ids. */
export function bulkKeys(spec: Pick<ListSpecPublic, "bulk">): string[] {
  const keys = new Set<string>();
  for (const action of spec.bulk ?? []) {
    if (!("do" in action)) continue;
    if ("copy" in action.do) keys.add(action.do.copy);
    if ("href" in action.do && typeof action.do.href === "string") {
      for (const match of action.do.href.matchAll(/\{(?:(?:min|max):)?(\w+)\}/g)) keys.add(match[1]!);
    }
  }
  return [...keys];
}

/* ──────────────────────────────────────────────────────────────────────────
   Sorting, filters, pages
   ────────────────────────────────────────────────────────────────────────── */

/** The column and direction a sort orders by first. */
export function sortOf(
  spec: Pick<ListSpecPublic, "sorts">,
  sort: string,
): { column: string; dir: "asc" | "desc" } | null {
  const named = spec.sorts.find((candidate) => candidate.key === sort);
  if (named) return named.rules[0] ?? null;
  const match = /^(\w+):(asc|desc)$/.exec(sort);
  return match ? { column: match[1]!, dir: match[2] as "asc" | "desc" } : null;
}

function isTextColumn(column: ListColumn): boolean {
  return !isFigure(column) && column.cell !== "date" && column.cell !== "when" && column.cell !== "duration";
}

/** What the Sort button says: a named sort's label, or "<Column>, A–Z" for a column sort. */
export function sortLabel(spec: Pick<ListSpecPublic, "sorts" | "columns">, sort: string): string {
  const named = spec.sorts.find((candidate) => candidate.key === sort);
  if (named) return named.label;
  const by = sortOf(spec, sort);
  const column = spec.columns.find((candidate) => candidate.key === by?.column);
  if (!by || !column) return spec.sorts[0]?.label ?? "Sort";
  if (isTextColumn(column)) return `${column.label}, ${by.dir === "asc" ? "A–Z" : "Z–A"}`;
  if (column.cell === "date" || column.cell === "when") {
    return `${column.label}, ${by.dir === "desc" ? "newest first" : "oldest first"}`;
  }
  return `${column.label}, ${by.dir === "desc" ? "highest first" : "lowest first"}`;
}

/** A column head click: first text A–Z, figures and dates high to low; again reverses. */
export function nextColumnSort(spec: Pick<ListSpecPublic, "sorts">, sort: string, column: ListColumn): string {
  const by = sortOf(spec, sort);
  if (by?.column === column.key) return `${column.key}:${by.dir === "asc" ? "desc" : "asc"}`;
  return `${column.key}:${isTextColumn(column) ? "asc" : "desc"}`;
}

export const PERIOD_LABELS: Record<string, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "this-month": "This month",
  "last-month": "Last month",
  "this-year": "This year",
};

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return `${date} ${SHORT_MONTHS[(month ?? 1) - 1]} ${year}`;
}

/** What a filter's chip says it is set to. */
export function filterValueLabel(filter: ListFilter, value: string | undefined): string {
  if (filter.type === "parent") return value ?? "";
  if (!value || value === "any") return filter.any;
  if (filter.type === "period") {
    if (PERIOD_LABELS[value]) return PERIOD_LABELS[value]!;
    const [from, to] = value.split("..");
    if (from && to) return from === to ? shortDay(from) : `${shortDay(from)} to ${shortDay(to)}`;
    if (from) return `From ${shortDay(from)}`;
    if (to) return `Up to ${shortDay(to)}`;
    return filter.any;
  }
  return filter.options?.find((option) => option.value === value)?.label ?? filter.any;
}

export type DrawnFilter = Exclude<ListFilter, { type: "parent" }>;

export function drawnFilters(spec: Pick<ListSpecPublic, "filters">): DrawnFilter[] {
  return spec.filters.filter((filter): filter is DrawnFilter => filter.type !== "parent");
}

/** Filters not at their `any`: what the Filters badge counts (the primaries only once they fold in). */
export function filtersOn(spec: Pick<ListSpecPublic, "filters">, filters: Record<string, string>, folded: boolean): number {
  return drawnFilters(spec).filter(
    (filter) => (folded || !filter.primary) && (filters[filter.key] ?? "any") !== "any",
  ).length;
}

/** The filter values a source starts from. */
export function defaultFilters(spec: Pick<ListSpecPublic, "filters">): Record<string, string> {
  return Object.fromEntries(drawnFilters(spec).map((filter) => [filter.key, filter.default ?? "any"]));
}

/** Clear shows when a filter is off its default or the search has text. */
export function canClear(spec: Pick<ListSpecPublic, "filters">, query: Pick<ResolvedListQuery, "filters" | "q">): boolean {
  if (query.q.trim()) return true;
  const defaults = defaultFilters(spec);
  return drawnFilters(spec).some((filter) => (query.filters[filter.key] ?? "any") !== defaults[filter.key]);
}

/** Up to seven pages show all; more show 1, …, current−1, current, current+1, …, last. */
export function pageButtons(page: number, pages: number): Array<number | "gap"> {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const around = [page - 1, page, page + 1].filter((n) => n > 1 && n < pages);
  const out: Array<number | "gap"> = [1];
  if (around[0]! > 2) out.push("gap");
  out.push(...around);
  if (around[around.length - 1]! < pages - 1) out.push("gap");
  out.push(pages);
  return out;
}
