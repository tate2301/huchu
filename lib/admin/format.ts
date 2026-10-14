/**
 * How the portal writes times and money. Harare time, because every operator
 * and every customer is on it, whatever the server's clock says.
 */

const ZONE = "Africa/Harare";
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: ZONE });
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: ZONE });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: ZONE });
const DATE_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE });

function dayKey(date: Date) {
  return DATE_KEY.format(date);
}

/** "Today 14:05", "Yesterday 17:40", "8 Oct", "12 Mar 2025". */
export function formatWhen(value: Date | string | null | undefined, now = new Date()): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (dayKey(date) === dayKey(now)) return `Today ${TIME.format(date)}`;
  if (dayKey(date) === dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))) return `Yesterday ${TIME.format(date)}`;
  return date.getFullYear() === now.getFullYear() ? DAY_MONTH.format(date) : DAY_MONTH_YEAR.format(date);
}

/** "13 Oct 2026". */
export function formatDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return DAY_MONTH_YEAR.format(typeof value === "string" ? new Date(value) : value);
}

export function formatTime(value: Date | string): string {
  return TIME.format(typeof value === "string" ? new Date(value) : value);
}

/** "$758.40". Every price in the catalogue is in US dollars. */
export function formatMoney(amount: number | string, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount));
}
