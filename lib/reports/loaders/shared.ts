import type { Prisma } from "@prisma/client";

import { REPORT_ROW_LIMIT, type ReportLoadResult, type ReportRow } from "@/lib/reports/types";

/**
 * What every source does to a value on its way into a row.
 *
 * Rows carry plain values — ISO dates, numbers, words — never formatted
 * strings. Formatting is the table's job; a figure stored as "1,200.00" can no
 * longer be summed, sorted or compared.
 */

/** `SITE_VISIT` → `Site visit`. Stored codes are not words. */
export function label(code: string | null | undefined): string | null {
  if (!code) return null;
  const words = code.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function day(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function num(value: number | Prisma.Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function personName(user: { name?: string | null; email?: string | null } | null | undefined): string | null {
  return user?.name?.trim() || user?.email || null;
}

/** One more than the limit, so a loader can tell there were more. */
export const TAKE = REPORT_ROW_LIMIT + 1;

export function result(rows: ReportRow[]): ReportLoadResult {
  return { rows: rows.slice(0, REPORT_ROW_LIMIT), truncated: rows.length > REPORT_ROW_LIMIT };
}
