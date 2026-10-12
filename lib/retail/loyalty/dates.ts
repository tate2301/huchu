import { addMonths } from "@/lib/retail/vouchers/dates";
import { addDays, todayIn } from "@/lib/workspace/format";

/** Loyalty's days: calendar days in the shop's zone (Africa/Harare, UTC+2 all year), as `YYYY-MM-DD`. */

export const loyaltyToday = (now: Date = new Date()) => todayIn(undefined, now);

/** 00:00 on the day in Harare, as an instant. */
export const harareMidnight = (day: string) => new Date(`${day}T00:00:00+02:00`);

/** The day a year back: what was earned before it expires tonight. */
export const yearBefore = (day: string) => addMonths(day, -12);

/** Monday is 1 … Sunday 7. */
export function isoWeekday(day: string): number {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** The seven days from `day`, as "MM-DD". */
export const weekMonthDays = (day: string) => Array.from({ length: 7 }, (_, index) => addDays(day, index).slice(5));
