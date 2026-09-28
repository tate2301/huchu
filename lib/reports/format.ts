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

export function formatValue(value: ReportValue | undefined, column: Pick<ReportColumn, "kind" | "currency">): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (column.kind === "money" && typeof value === "number") {
    return column.currency ? `${column.currency} ${money.format(value)}` : money.format(value);
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

