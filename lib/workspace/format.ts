/**
 * Words, numbers and dates as every frame prints them (00-foundations 5.13).
 *
 * Money as the till prints it ("US$886.85", "ZiG 1,284.60"); a minus is U+2212
 * with no space; a difference is always signed; months are three letters and
 * September is "Sep". Times are 24-hour. Everything that depends on the clock
 * is read in the company's time zone, Harare unless it says otherwise.
 *
 * Pure: no clock, no locale of the machine. The server and the browser print
 * the same characters.
 */

export const DEFAULT_TIME_ZONE = "Africa/Harare";

const MINUS = "−";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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

/** What goes before the figure. A symbol with no gap, a code with one. */
const CURRENCY_PREFIX: Record<string, string> = {
  USD: "US$",
  ZWG: "ZiG ",
  ZIG: "ZiG ",
  ZAR: "R ",
};

function prefixFor(currency: string): string {
  return CURRENCY_PREFIX[currency.toUpperCase()] ?? `${currency.toUpperCase()} `;
}

const twoPlaces = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const onePlace = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Cents, so −0.004 is zero and not "−US$0.00". */
function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "US$1,284.60", "−US$7.15", "ZiG 1,284.60". */
export function formatMoney(n: number, currency = "USD"): string {
  const value = cents(n);
  const body = `${prefixFor(currency)}${twoPlaces.format(Math.abs(value))}`;
  return value < 0 ? `${MINUS}${body}` : body;
}

/** A difference, always signed: "−US$7.15", "+US$3.17", "US$0.00". */
export function formatSigned(n: number, currency = "USD"): string {
  const value = cents(n);
  if (value === 0) return formatMoney(0, currency);
  return value > 0 ? `+${formatMoney(value, currency)}` : formatMoney(value, currency);
}

/** "8,412". */
export function formatCount(n: number): string {
  const value = Math.round(n);
  return value < 0 ? `${MINUS}${whole.format(-value)}` : whole.format(value);
}

/** A count that says which way it went: "+40", "−1", "0". */
export function formatSignedCount(n: number): string {
  const text = formatCount(n);
  return Math.round(n) > 0 ? `+${text}` : text;
}

/** "28.6%"; signed: "+6.1%", "−2.4%". `n` is the percentage, not the fraction. */
export function formatPercent(n: number, { signed = false }: { signed?: boolean } = {}): string {
  const value = Math.round(n * 10) / 10;
  const body = `${onePlace.format(Math.abs(value))}%`;
  if (value < 0) return `${MINUS}${body}`;
  return signed && value > 0 ? `+${body}` : body;
}

/* ──────────────────────────────────────────────────────────────────────────
   Days and times
   ────────────────────────────────────────────────────────────────────────── */

type WallClock = { year: number; month: number; day: number; hour: number; minute: number };

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The wall clock in a zone. A `YYYY-MM-DD` string is already a day, and stays that day. */
function wall(value: Date | string, timeZone: string): WallClock {
  if (typeof value === "string") {
    const day = ISO_DAY.exec(value);
    if (day) return { year: Number(day[1]), month: Number(day[2]), day: Number(day[3]), hour: 0, minute: 0 };
    value = new Date(value);
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(value);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "15 August 2026". */
export function formatDay(value: Date | string, timeZone = DEFAULT_TIME_ZONE): string {
  const w = wall(value, timeZone);
  return `${w.day} ${MONTHS_LONG[w.month - 1]} ${w.year}`;
}

/**
 * A day as a person types it, back to `YYYY-MM-DD`: "31 December 2026",
 * "31 Dec 2026" or "2026-12-31". Null when it is not a real calendar day.
 */
export function parseDay(text: string): string | null {
  const trimmed = text.trim();
  let year: number;
  let month: number;
  let day: number;
  const iso = ISO_DAY.exec(trimmed);
  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else {
    const words = /^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})$/.exec(trimmed);
    if (!words) return null;
    const name = words[2]!.toLowerCase();
    const index = MONTHS_LONG.findIndex(
      (long, i) => long.toLowerCase() === name || MONTHS_SHORT[i]!.toLowerCase() === name,
    );
    if (index < 0) return null;
    [year, month, day] = [Number(words[3]), index + 1, Number(words[1])];
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** "30 Sep". */
export function formatShortDay(value: Date | string, timeZone = DEFAULT_TIME_ZONE): string {
  const w = wall(value, timeZone);
  return `${w.day} ${MONTHS_SHORT[w.month - 1]}`;
}

/** "18:14". */
export function formatTime(value: Date | string, timeZone = DEFAULT_TIME_ZONE): string {
  const w = wall(value, timeZone);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

/** A date and time in a table: "3 Oct 13:12". */
export function formatWhen(value: Date | string, timeZone = DEFAULT_TIME_ZONE): string {
  return `${formatShortDay(value, timeZone)} ${formatTime(value, timeZone)}`;
}

/** The calendar day an instant falls on in a zone, as `YYYY-MM-DD`. */
export function dayKey(value: Date, timeZone = DEFAULT_TIME_ZONE): string {
  const w = wall(value, timeZone);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** Minutes as hours and minutes: "6h 12m", "52h 50m", "7h 00m". */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.floor(minutes));
  return `${Math.floor(total / 60)}h ${pad(total % 60)}m`;
}
