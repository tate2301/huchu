import { SHOP_TIME_ZONE } from "@/lib/retail/shop-profile-rules";
import { addDays, daysBetween, todayIn } from "@/lib/workspace/format";

/**
 * A range of days an insight can read instead of a preset period, and the
 * ranges the picker offers. No database here: the insight page imports it.
 */

/** Harare days, `YYYY-MM-DD`, both counted. */
export type InsightRange = { from: string; to: string };

/** The longest range an insight reads, in days. */
export const INSIGHT_MAX_DAYS = 366;

/**
 * The ranges the picker offers that the period segment does not: yesterday,
 * the Monday-to-Sunday week before this one, last calendar month, and this
 * year so far.
 */
export const INSIGHT_RANGE_PRESETS: ReadonlyArray<{ key: string; label: string; range: (today: string) => InsightRange }> = [
  { key: "yesterday", label: "Yesterday", range: (today) => ({ from: addDays(today, -1), to: addDays(today, -1) }) },
  {
    key: "last-week",
    label: "Last week",
    range: (today) => {
      const monday = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
      return { from: addDays(monday, -7), to: addDays(monday, -1) };
    },
  },
  {
    key: "last-month",
    label: "Last month",
    range: (today) => {
      const first = `${today.slice(0, 7)}-01`;
      const last = addDays(first, -1);
      return { from: `${last.slice(0, 7)}-01`, to: last };
    },
  },
  { key: "this-year", label: "This year", range: (today) => ({ from: `${today.slice(0, 4)}-01-01`, to: today }) },
];

/** Why a range cannot be read, or null when it can. The route answers 400 with it. */
export function insightRangeRefusal(range: InsightRange, now = new Date()): string | null {
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const real = (value: string) => day.test(value) && addDays(value, 0) === value;
  if (!real(range.from) || !real(range.to) || range.from > range.to) return "That period could not be read";
  if (daysBetween(range.from, range.to) > INSIGHT_MAX_DAYS) return "Choose dates no more than a year apart";
  if (range.from > todayIn(SHOP_TIME_ZONE, now)) return "Choose dates up to today";
  return null;
}
