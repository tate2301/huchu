/**
 * How Books writes money and days (design/core-modules/spec/reports-and-books.md):
 * currency and both decimals everywhere, US dollars as "$", any other currency
 * by its code ("ZWG 12,393.66"), and days in the workspace's own time zone.
 */

export const BOOKS_TIME_ZONE = "Africa/Harare";

const MINUS = "−";
const twoPlaces = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const cents = (n: number) => Math.round(n * 100) / 100;

/** "$1,240.00", "ZWG 12,393.66", "−$18.00". */
export function money(n: number, currency = "USD"): string {
  const value = cents(n);
  const code = currency.toUpperCase();
  const body = `${code === "USD" ? "$" : `${code} `}${twoPlaces.format(Math.abs(value))}`;
  return value < 0 ? `${MINUS}${body}` : body;
}

/** Money in or out of the bank: "+$1,412.50", "−$312.40". */
export function signedMoney(n: number, currency = "USD"): string {
  const value = cents(n);
  return value > 0 ? `+${money(value, currency)}` : money(value, currency);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** A calendar day, as `YYYY-MM-DD`, in the workspace's time zone. */
export function dayOf(value: Date, timeZone = BOOKS_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * A stored date-only column (`@db.Date`, or a date kept at midnight UTC) as its
 * calendar day. Reading it in Harare would be right too, but reading it in UTC
 * cannot slip a day.
 */
export function storedDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const parse = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}

export function addDays(day: string, n: number): string {
  const date = parse(day);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/** "5 Oct". */
export function shortDay(day: string): string {
  const date = parse(day);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** "Fri 2 Oct". */
export function weekdayDay(day: string): string {
  const date = parse(day);
  return `${WEEKDAYS[date.getUTCDay()]} ${shortDay(day)}`;
}

/** "Friday". */
export function weekday(day: string): string {
  return WEEKDAYS_LONG[parse(day).getUTCDay()];
}

/** "25 October". */
export function longDay(day: string): string {
  const date = parse(day);
  return `${date.getUTCDate()} ${MONTHS_LONG[date.getUTCMonth()]}`;
}

/** "September". */
export function monthName(day: string): string {
  return MONTHS_LONG[parse(day).getUTCMonth()];
}

/** "1 to 6 October": the days of a month so far. */
export function monthSoFar(today: string): string {
  const date = parse(today);
  return date.getUTCDate() === 1
    ? longDay(today)
    : `1 to ${date.getUTCDate()} ${MONTHS_LONG[date.getUTCMonth()]}`;
}

/** The first day of the month `day` is in. */
export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/**
 * When a recent day was, the way a person says it: "Friday" within the last
 * six days, otherwise "2 October".
 */
export function sinceWhen(day: string, today: string): string {
  const gap = daysBetween(day, today);
  if (gap === 0) return "today";
  if (gap === 1) return "yesterday";
  if (gap > 1 && gap < 7) return weekday(day);
  return longDay(day);
}

/** "Today 06:00", "Yesterday 18:20" or "2 Oct 06:00". */
export function asOf(value: Date, now: Date, timeZone = BOOKS_TIME_ZONE): string {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);
  const gap = daysBetween(dayOf(value, timeZone), dayOf(now, timeZone));
  if (gap === 0) return `Today ${time}`;
  if (gap === 1) return `Yesterday ${time}`;
  return `${shortDay(dayOf(value, timeZone))} ${time}`;
}

/** How a payment method is written: a common noun in lower case, a name as itself. */
export function methodWord(method: string): string {
  const plain = method.trim();
  if (/^ecocash$/i.test(plain)) return "EcoCash";
  if (/^(innbucks)$/i.test(plain)) return "InnBucks";
  if (/^(bank[ _-]?transfer|transfer|eft|rtgs)$/i.test(plain)) return "transfer";
  return plain.toLowerCase().replace(/_/g, " ");
}

/** "1 invoice", "3 invoices". */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
}
