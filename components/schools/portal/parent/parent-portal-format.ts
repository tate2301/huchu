"use client";

import { useSyncExternalStore } from "react";

/**
 * Dates and counters the parent portal writes differently from the rest of the
 * schools surface.
 *
 * `lib/schools/format.ts` owns the house formats — `$ 1,234.56`, `3 June 2026` —
 * and money still goes through it. What is here is the phone's own shorthand: a
 * fee hero has one line for "pay by 10 Oct · 12 days to go" and a register grid
 * has 40px for a date, neither of which fits "3 June 2026".
 *
 * Each field is formatted on its own and joined here rather than asked of one
 * combined formatter. Node's ICU writes "Mon, 6 Aug" where Chrome's writes
 * "Mon 6 Aug", and a client component that renders the difference fails
 * hydration — the teacher shell learned this the same way.
 */

const WEEKDAY_SHORT = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

function parse(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `10 Oct`. The fee hero's due date, where the year is this one. */
export function formatShortDate(value: string | Date | null | undefined): string {
  const date = parse(value);
  return date ? DAY_MONTH.format(date) : "—";
}

/**
 * `Mon · 10 Oct`. Weekday first, because a parent checking a register is
 * remembering a day of the week, not a date.
 */
export function formatWeekdayDate(value: string | Date | null | undefined): string {
  const date = parse(value);
  if (!date) return "—";
  return `${WEEKDAY_SHORT.format(date)} · ${DAY_MONTH.format(date)}`;
}

/**
 * `October 2026`, for grouping past payments. Callers hand it a mid-month date
 * built from a `monthKey`: the first of the month parses as UTC midnight and
 * reads as the month before in any timezone behind it.
 */
export function formatMonthLabel(value: string | Date | null | undefined): string {
  const date = parse(value);
  return date ? MONTH_YEAR.format(date) : "—";
}

/** Sortable month key, so a group heading and its rows agree about order. */
export function monthKey(value: string | Date | null | undefined): string {
  const date = parse(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Monday of the week `value` falls in, as a month-day key. */
export function weekKey(value: string | Date | null | undefined): string {
  const date = parse(value);
  if (!date) return "";
  const monday = new Date(date);
  // getDay() is 0 on Sunday, which belongs to the week that just ended.
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(
    monday.getDate(),
  ).padStart(2, "0")}`;
}

/** Whole days from today until `value`. Negative once the date is past. */
export function daysUntil(value: string | Date | null | undefined): number | null {
  const date = parse(value);
  if (!date) return null;
  const midnight = (at: Date) => Date.UTC(at.getFullYear(), at.getMonth(), at.getDate());
  return Math.round((midnight(date) - midnight(new Date())) / 86_400_000);
}

const NO_RESUBSCRIBE = () => () => {};

/**
 * False on the server and on the first client render, true afterwards.
 *
 * Anything counted from `new Date()` — "12 days to go" most of all — differs
 * between a server in UTC and a phone two hours ahead of it, and a difference
 * in the first paint is a hydration error rather than a cosmetic one. Holding
 * the count back one render is the same trick `components/ui/client-date.tsx`
 * uses, for the same reason.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    NO_RESUBSCRIBE,
    () => true,
    () => false,
  );
}
