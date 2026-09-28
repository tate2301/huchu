/**
 * A period of calendar days, read from a query string.
 *
 * Days in the UTC terms a daily log is keyed on, so a period and the logs in
 * it agree about which day is which. Without `from` and `to` it is this month
 * so far — the question a manager opens a money page to ask.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function day(value: string | null): Date | null {
  if (!value || !DAY.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `YYYY-MM-DD` for a day's UTC midnight. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The period the query asks for, or null when it ends before it starts. */
export function periodFromQuery(
  searchParams: URLSearchParams,
  now: Date = new Date(),
): { from: Date; to: Date } | null {
  const from = day(searchParams.get("from")) ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to =
    day(searchParams.get("to")) ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return from > to ? null : { from, to };
}
