import type { ReportParam, ReportParams } from "@/lib/reports/types";

/**
 * The narrowing a report is fetched with, before any view is applied.
 *
 * Pure so the browser can show the dates the server will use: a report opened
 * with nothing in the URL and one opened with the same dates typed in must
 * return the same rows.
 */

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function resolveDateDefault(value: NonNullable<Extract<ReportParam, { type: "date" }>["default"]>, now: Date): string {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (value === "today") return iso(today);
  if (value === "monthStart") return iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
  if (value === "yearStart") return iso(new Date(Date.UTC(today.getUTCFullYear(), 0, 1)));
  const days = Number(value.slice(1, -1));
  return iso(new Date(today.getTime() - days * 86_400_000));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Only the params a source declares, each checked, each defaulted. */
export function resolveParams(declared: ReportParam[], given: ReportParams, now = new Date()): ReportParams {
  const resolved: ReportParams = {};
  for (const param of declared) {
    const value = given[param.key]?.trim() ?? "";
    if (param.type === "date") {
      if (ISO_DATE.test(value)) resolved[param.key] = value;
      // Never asked for: the default. Asked for with no value: open-ended, and
      // kept as an empty value so an export sent these back reads it the same.
      else if (param.key in given && value === "") resolved[param.key] = "";
      else if (param.default) resolved[param.key] = resolveDateDefault(param.default, now);
    } else if (value && param.options.some((option) => option.value === value)) {
      resolved[param.key] = value;
    }
  }
  return resolved;
}

/**
 * A `from`/`to` pair as a Prisma date range, `to` inclusive of its whole day.
 * Either end may be missing.
 */
export function dateRange(params: ReportParams, fromKey = "from", toKey = "to"): { gte?: Date; lte?: Date } | undefined {
  const from = params[fromKey];
  const to = params[toKey];
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
    ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
  };
}

/** The usual pair: a window ending today. */
export function periodParams(days: number, label = "Date"): ReportParam[] {
  return [
    { key: "from", label, type: "date", default: `-${days}d` },
    { key: "to", label: "To", type: "date", default: "today" },
  ];
}
