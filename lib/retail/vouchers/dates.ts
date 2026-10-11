import { todayIn } from "@/lib/workspace/format";

/** Vouchers' days: calendar days in the shop's zone (Africa/Harare), as `YYYY-MM-DD`. */

export const voucherToday = (now: Date = new Date()) => todayIn(undefined, now);

/** The same day `n` months on; the last day of the month when that month is shorter (31 Jan + 1 → 28 Feb). */
export function addMonths(day: string, n: number): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const index = year * 12 + (month - 1) + n;
  const toYear = Math.floor(index / 12);
  const toMonth = (index % 12) + 1;
  const last = new Date(Date.UTC(toYear, toMonth, 0)).getUTCDate();
  return `${toYear}-${String(toMonth).padStart(2, "0")}-${String(Math.min(date, last)).padStart(2, "0")}`;
}

/** A `@db.Date` value for a day. */
export const dateOf = (day: string) => new Date(`${day}T00:00:00.000Z`);

/** Days from today to a day: 313 to 14 Aug 2027 on 5 Oct 2026; 0 on the day. */
export const daysUntil = (today: string, day: string) => Math.round((dateOf(day).getTime() - dateOf(today).getTime()) / 86_400_000);

/** The latest day a voucher may run to from today. */
export const latestExpiry = (today: string) => addMonths(today, 36);

/** A voucher works through its expiry day and is expired from the day after. */
export const expiredOn = (expiresOn: string, today: string) => expiresOn < today;
