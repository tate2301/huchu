import { AGGREGATE_LABELS } from "@/lib/reports/view";
import type { Aggregate, Condition, ConditionOp, ReportColumn, ReportValue } from "@/lib/reports/types";
import { isNumeric } from "@/lib/reports/view";

/**
 * A value as it is read — on screen and on paper alike, so a PDF says exactly
 * what the table said. A CSV takes the raw values instead: a spreadsheet wants
 * 1200.5, not "1,200.50".
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}

const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const figure = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** What goes before a sum, as the boards write it: "$1,180.00", "ZiG 1,180.00", "R 1,180.00". */
const PREFIX: Record<string, string> = { USD: "$", ZWG: "ZiG ", ZIG: "ZiG ", ZAR: "R " };

export function formatValue(value: ReportValue | undefined, column: Pick<ReportColumn, "kind" | "currency">): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (column.kind === "money" && typeof value === "number") {
    if (!column.currency) return money.format(value);
    const prefix = PREFIX[column.currency.toUpperCase()] ?? `${column.currency.toUpperCase()} `;
    return `${value < 0 ? "−" : ""}${prefix}${money.format(Math.abs(value))}`;
  }
  if (column.kind === "number" && typeof value === "number") return figure.format(value);
  if (column.kind === "date" && typeof value === "string") return formatDate(value);
  return String(value);
}

/**
 * A total, drawn as its column would draw it — except a count, which is a
 * count of rows whatever the column holds, and a lowest or highest of a date,
 * which is still a date.
 */
export function formatTotal(value: ReportValue | undefined, column: ReportColumn, fn: Aggregate): string {
  if (fn === "count" || fn === "distinct") return formatValue(value, { kind: "number" });
  return formatValue(value, column);
}

export function totalCaption(fn: Aggregate): string {
  return AGGREGATE_LABELS[fn];
}

const OP_LABELS: Record<ConditionOp, string> = {
  is: "is",
  isNot: "is not",
  contains: "contains",
  gt: "more than",
  lt: "less than",
  between: "between",
  empty: "is empty",
  notEmpty: "is not empty",
};

export function opLabel(op: ConditionOp, column: ReportColumn): string {
  if (column.kind === "date" && op === "gt") return "after";
  if (column.kind === "date" && op === "lt") return "before";
  return OP_LABELS[op];
}

export function describeCondition(condition: Condition, column: ReportColumn): string {
  const op = opLabel(condition.op, column);
  if (condition.op === "empty" || condition.op === "notEmpty") return `${column.label} ${op}`;
  const values = Array.isArray(condition.value) ? condition.value : condition.value ? [condition.value] : [];
  const shown = values.map((value) => (value ? formatValue(isNumeric(column.kind) ? Number(value) : value, column) : "…"));
  if (condition.op === "between") return `${column.label} ${shown[0] ?? "…"} – ${shown[1] ?? "…"}`;
  const list = shown.length > 2 ? `${shown.slice(0, 2).join(", ")} +${shown.length - 2}` : shown.join(", ");
  return `${column.label} ${op} ${list}`;
}


/**
 * Money columns that do not name their currency, given the one their sums are in: the rows' own
 * when every row carries the same (`currency`), or the workspace's when the rows carry none.
 * Rows in several currencies leave the columns as they are.
 */
export function withCurrency<T extends Pick<ReportColumn, "kind" | "currency">>(
  columns: readonly T[],
  rows: ReadonlyArray<Record<string, ReportValue | undefined>>,
  workspace: string,
): T[] {
  const given = new Set(rows.map((row) => row.currency).filter((value): value is string => typeof value === "string" && value.length > 0));
  const currency = given.size === 0 ? workspace : given.size === 1 ? [...given][0]! : null;
  if (!currency) return [...columns];
  return columns.map((column) => (column.kind === "money" && !column.currency ? { ...column, currency } : column));
}

/** Month ticks ("Jan 2026", "Mar 2026") say the year once, and again where it turns, so they fit a half-width chart. */
export function shortTicks(labels: string[]): string[] {
  const parts = labels.map((label) => /^([A-Z][a-z]{2}) (\d{4})$/.exec(label));
  if (parts.some((part) => !part)) return labels;
  return parts.map((part, index) => (index === 0 || part![2] !== parts[index - 1]![2] ? `${part![1]} ${part![2]}` : part![1]!));
}
