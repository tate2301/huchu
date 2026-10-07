import { fillTemplate } from "@/lib/reports/actions";
import { periodDefault } from "@/lib/reports/types";
import type {
  CellKind,
  Condition,
  ListColumn,
  ListFilter,
  ListSpecPublic,
  ReportColumn,
  ReportRow,
  ReportValue,
  ResolvedListQuery,
  Tone,
} from "@/lib/reports/types";
import { marginOf, marginTone } from "@/lib/reports/margin";
import { centsOf } from "@/lib/retail/prices/figure";
import { filterRows, ratioOf } from "@/lib/reports/view";
import {
  dayRangeWords,
  formatCount,
  formatDay,
  formatMediumDay,
  formatMoney,
  formatPercent,
  formatRelativeDay,
  formatSigned,
  formatSignedCount,
  todayIn,
} from "@/lib/workspace/format";

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
/** The value a row is grouped by; a blank one is the group with no value. */
export const groupValue = (row: ReportRow, key: string): string => {
  const value: ReportValue | undefined = row[key];
  return isBlank(value) ? "" : String(value);
};

export const STALE_MINUTES = 12 * 60;

export type DurationState = "running" | "stale" | "done";

export function durationState(column: ListColumn, row: ReportRow): DurationState {
  const running = column.runningKey ? Boolean(row[column.runningKey]) : false;
  if (!running) return "done";
  return Number(row[column.key] ?? 0) > STALE_MINUTES ? "stale" : "running";
}

/** A state or dot cell's tone: from the row's own key when the words vary, else by the words. */
export function toneOf(column: Pick<ListColumn, "key" | "tones" | "toneKey">, row: ReportRow): Tone | null {
  if (column.toneKey) {
    const tone = row[column.toneKey];
    return isBlank(tone) ? null : (String(tone) as Tone);
  }
  return column.tones?.[String(row[column.key] ?? "")] ?? null;
}

/** The words a cell prints, and its `title` (the full value). */
/** A `date` cell's day in its column's format ("2 Nov 2026", "Today"), else "15 August 2026". */
export function dayText(column: Pick<ListColumn, "dayFormat">, value: string, now: Date = new Date()): string {
  if (column.dayFormat === "relative") return formatRelativeDay(value, now);
  if (column.dayFormat === "medium") return formatMediumDay(value);
  return formatDay(value);
}

/** What a cell with no value reads: "—", or "–" where the column's board draws that. */
export const noValue = (column: ListColumn) => (column.empty === "dash" ? "–" : "—");

export function cellText(column: ListColumn, row: ReportRow): string {
  const value = row[column.key];
  if (isBlank(value)) return noValue(column);
  const currency = column.currency ?? "USD";
  switch (column.cell) {
    case "money":
    case "zero":
    case "edit-money":
      return formatMoney(Number(value), currency);
    case "owed":
      // A count that is owed attention ("2" lists below cost) rather than money.
      if (column.kind === "number") return formatCount(Number(value));
      return Number(value) < 0 ? `${formatMoney(-Number(value), currency)} credit` : formatMoney(Number(value), currency);
    case "diff":
      return formatSigned(Number(value), currency);
    case "date":
      return column.dayFormat ? dayText(column, String(value)) : String(value);
    case "num": {
      if (column.sign) return formatSignedCount(Number(value));
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
  if (column.cell === "num" && column.sign) return formatSignedCount(Number(value));
  if (column.cell === "num") {
    const figure = column.percent ? formatPercent(Number(value)) : formatCount(Number(value));
    return column.totalSuffix ? `${figure} ${column.totalSuffix}` : figure;
  }
  if (column.cell === "owed" && column.kind === "number") return formatCount(Number(value));
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

/**
 * The ticked rows' totals, worked out in the browser from the rows it holds
 * (5.4.8): sums, and a ratio column over the ticked set as the Σ row does it.
 */
export function selectionTotals(columns: ListColumn[], rows: ReportRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const column of columns) {
    if (column.ratio && column.total === "avg") {
      const ratio = ratioOf(rows, column.ratio);
      if (ratio !== null) out[column.key] = Number(ratio);
      continue;
    }
    if (column.total !== "sum") continue;
    out[column.key] = Math.round(rows.reduce((sum, row) => sum + (Number(row[column.key]) || 0), 0) * 100) / 100;
  }
  return out;
}

/** Whether a row matches a row action's `when`. */
export function rowMatches(row: ReportRow, columns: ListColumn[], when: Condition[] | undefined): boolean {
  if (!when?.length) return true;
  // A row key the list does not draw ("saleId") is still something to ask about.
  const declared = new Set(columns.map((column) => column.key));
  const extra = when
    .filter((condition) => !declared.has(condition.column))
    .map((condition): ReportColumn => ({ key: condition.column, label: condition.column, kind: "text", hidden: true }));
  const all: ReportColumn[] = [...columns, ...extra];
  return (
    filterRows([row], all, {
      columns: all.map((column) => ({ key: column.key, hidden: false })),
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

/**
 * Where a `run` action posts. A row's own endpoint (`/tills/{id}/unpair`)
 * fills from its one row; with several rows, or a hole the row leaves blank,
 * there is nowhere to post (null).
 */
export function runEndpoint(endpoint: string, rows: ReportRow[]): string | null {
  if (!endpoint.includes("{")) return endpoint;
  return rows.length === 1 ? fillTemplate(endpoint, rows[0]!) : null;
}

/** A template's `{key}` holes filled from the list's filters (a worksheet's `{list}`); null while one is not set. */
export function fillFromFilters(template: string, filters: Record<string, string>): string | null {
  let complete = true;
  const filled = template.replace(/\{(\w+)\}/g, (hole, key: string) => {
    const value = filters[key];
    if (value === undefined || value === "" || value === "any") {
      complete = false;
      return hole;
    }
    return value;
  });
  return complete ? filled : null;
}

/** A typed price ("US$ 18.99") as a number, read as the server reads it (`centsOf`); null when it is not one. */
export function typedNumber(typed: string): number | null {
  const cents = centsOf(typed);
  return cents === null ? null : cents / 100;
}

/**
 * A row as it reads while its edited column holds `typed` and is not saved:
 * the typed figure in the column, every `derive`d figure worked out again from
 * it (the margin and its pill), and the changed column's flag.
 */
export function typedRow(
  row: ReportRow,
  typed: string | undefined,
  columns: ListColumn[],
  edit: { column: string; changedColumn?: string },
): ReportRow {
  if (typed === undefined) return row;
  const price = typedNumber(typed);
  const next: ReportRow = { ...row };
  if (price !== null) next[edit.column] = price;
  for (const column of columns) {
    const derive = column.derive;
    if (!derive || derive.from !== edit.column || price === null) continue;
    const cost = typeof row[derive.costKey] === "number" ? (row[derive.costKey] as number) : null;
    const target = typeof row[derive.targetKey] === "number" ? (row[derive.targetKey] as number) : null;
    const margin = marginOf(price, cost);
    next[column.key] = margin;
    if (column.pillKey) next[column.pillKey] = marginTone(margin, target, cost !== null && price < cost);
  }
  if (edit.changedColumn) next[edit.changedColumn] = UNSAVED;
  return next;
}

/** Leaving a list with typed values not saved (FND's `leaveprices`): "3 changes on Retail are not saved." */
export function leaveAsk(count: number, title: string) {
  return {
    title: "Leave without saving?",
    body: `${formatCount(count)} ${count === 1 ? "change" : "changes"} on ${title} ${count === 1 ? "is" : "are"} not saved.`,
    keep: "Keep editing",
    go: "Discard changes",
    fill: "bad" as const,
  };
}

/** What an edited row's changed column reads until it is saved. */
export const UNSAVED = "Not saved";

/** The row keys a bulk action reads, so "Select all" can fetch them beside the ids. */
export function bulkKeys(spec: Pick<ListSpecPublic, "bulk">): string[] {
  const keys = new Set<string>();
  for (const action of spec.bulk ?? []) {
    if (!("do" in action)) continue;
    if ("copy" in action.do) keys.add(action.do.copy);
    for (const condition of action.when ?? []) keys.add(condition.column);
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
  "this-week": "This week",
  "last-weekend": "Last weekend",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "this-month": "This month",
  "last-month": "Last month",
  "this-year": "This year",
};

/** What a filter's chip says it is set to. A chosen range reads as `dayRangeWords` ("1 to 3 October"). */
export function filterValueLabel(filter: ListFilter, value: string | undefined, today: string = todayIn()): string {
  if (filter.type === "parent") return value ?? "";
  if (!value || value === "any") return filter.any;
  if (filter.type === "period") {
    if (PERIOD_LABELS[value]) return PERIOD_LABELS[value]!;
    const [from, to] = value.split("..");
    return dayRangeWords({ from: from || null, to: to || null }, today) || filter.any;
  }
  return filter.options?.find((option) => option.value === value)?.label ?? filter.any;
}

export type DrawnFilter = Exclude<ListFilter, { type: "parent" }>;

export function drawnFilters(spec: Pick<ListSpecPublic, "filters">): DrawnFilter[] {
  return spec.filters.filter((filter): filter is DrawnFilter => filter.type !== "parent");
}

/**
 * The filters inside the Filters popover: the ones not on the toolbar, and
 * the primaries once they fold in. A list whose every filter is primary keeps
 * them there too, so Filters is never an empty button (People: Role and Site).
 */
export function heldFilters(filters: DrawnFilter[], folded: boolean): DrawnFilter[] {
  const allPrimary = filters.every((filter) => filter.primary);
  return filters.filter((filter) => folded || allPrimary || !filter.primary);
}

/** Filters not at their `any`: what the Filters badge counts (the ones the popover holds). */
export function filtersOn(spec: Pick<ListSpecPublic, "filters">, filters: Record<string, string>, folded: boolean): number {
  return heldFilters(drawnFilters(spec), folded).filter((filter) => (filters[filter.key] ?? "any") !== "any").length;
}

/** A count with its noun, as the phone's totals line reads it: "7 people", "1 person", "1 category". */
export function countWords(count: number, noun: string): string {
  if (count !== 1) return `${formatCount(count)} ${noun}`;
  const one = noun === "people" ? "person" : noun.endsWith("ies") ? `${noun.slice(0, -3)}y` : noun.replace(/s$/, "");
  return `1 ${one}`;
}

/**
 * The filter values a source starts from, given the choices made (`chosen`):
 * a chosen `anyTime` option starts the periods from "any".
 */
export function defaultFilters(spec: Pick<ListSpecPublic, "filters">, chosen: Record<string, string> = {}): Record<string, string> {
  return Object.fromEntries(
    drawnFilters(spec).map((filter) => [
      filter.key,
      filter.type === "period" ? periodDefault(spec.filters, filter, chosen) : (filter.default ?? "any"),
    ]),
  );
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

/**
 * The source's spec as this page draws it: with `rowFilters`, those filters
 * sit on the toolbar row and every other one inside Filters (an area page puts
 * "Made by" beside "Seen by"; Every template keeps it inside).
 */
export function pageSpec(spec: ListSpecPublic | null, rowFilters?: readonly string[]): ListSpecPublic | null {
  if (!spec || !rowFilters) return spec;
  return {
    ...spec,
    filters: spec.filters.map((filter) =>
      filter.type === "parent" ? filter : { ...filter, primary: rowFilters.includes(filter.key) },
    ),
  };
}

/**
 * The columns the page already says (`impliedBy`): the column the list is
 * grouped by, or the one a set parent filter narrows to one value. They are
 * not drawn on every row, nor offered under Columns.
 */
export function impliedColumns(
  spec: Pick<ListSpecPublic, "columns"> | null,
  query: Pick<ResolvedListQuery, "group" | "filters"> | null,
): string[] {
  if (!spec || !query) return [];
  return spec.columns
    .filter(({ key, impliedBy }) =>
      Boolean(impliedBy && ((impliedBy.group && query.group === key) || (impliedBy.parent && query.filters[impliedBy.parent]))),
    )
    .map((column) => column.key);
}
