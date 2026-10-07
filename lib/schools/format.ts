/**
 * How a school surface writes a number down.
 *
 * `docs/design-system/05-rules.md` fixes these formats, and before this module
 * every fee screen invented its own: `value.toFixed(2)` in one place,
 * `toLocaleString` with no currency in another, an ISO date slice in a third.
 * The rules are not decoration — a bursar reading `1234.5` next to
 * `$ 1,234.50` has to stop and work out whether they are the same money.
 *
 *   Money  symbol + non-breaking space + two decimals   `$ 2,816.40`
 *   Date   day month year, no zero padding              `3 June 2026`
 *   Time   24-hour                                      `14:38`
 *
 * Everything here is locale-pinned rather than locale-derived, so the server
 * and the browser render the same string and hydration does not tear.
 */

/** Non-breaking space. The rule is explicit that the symbol does not wrap away. */
const NBSP = " ";

const SYMBOLS: Record<string, string> = {
  USD: "$",
  ZWG: "ZWG",
  ZAR: "R",
  GBP: "£",
  EUR: "€",
};

/**
 * Where the school is. Every tenant on this platform keeps one set of school
 * days, so a single zone is honest; the day this becomes untrue it should come
 * off the tenant rather than growing a second constant here.
 */
const SCHOOL_TIME_ZONE = "Africa/Harare";

const AMOUNT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * The short forms, with the zone pinned as well as the locale.
 *
 * Pinning the locale alone is only half the hydration contract. A sheet
 * submitted at 23:30 UTC is the 21st on a UTC server and the 22nd in a browser
 * two hours east, so the server bytes and the first client paint disagree about
 * the day — and the reader is told a sheet arrived tomorrow. School dates are
 * stored as instants and read as school days, so the school's own zone is the
 * one that answers "which day was that".
 */
const SHORT_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: SCHOOL_TIME_ZONE,
});

const SHORT_TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: SCHOOL_TIME_ZONE,
});

/**
 * `$ 1,234.56`.
 *
 * A currency with no symbol of its own is written with its code, because
 * "1,234.56" alone in a school that bills in two currencies is not an amount,
 * it is a guess.
 */
export function formatSchoolMoney(
  value: number | string | null | undefined,
  currency = "USD",
): string {
  const amount = Number(value ?? 0);
  const safe = Number.isFinite(amount) ? amount : 0;
  const symbol = SYMBOLS[currency.toUpperCase()] ?? currency.toUpperCase();
  const rendered = AMOUNT.format(Math.abs(safe));
  const sign = safe < 0 ? "-" : "";
  return `${sign}${symbol}${NBSP}${rendered}`;
}

/** `3 June 2026`. An unparseable or missing date is an em dash, not "Invalid Date". */
export function formatSchoolDate(value?: string | Date | null): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return DATE.format(date);
}

/** `22 Aug` — the date form a table cell uses, in the school's own day. */
export function formatSchoolDayShort(value?: string | Date | null): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return SHORT_DATE.format(date);
}

/** `22 Aug 08:00` — for the things that open and close at a time of day. */
export function formatSchoolDayTime(value?: string | Date | null): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${SHORT_DATE.format(date)} ${SHORT_TIME.format(date)}`;
}
