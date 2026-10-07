/**
 * Counting a drawer by note (50-floor W-39, FLR-04): what the notes come to
 * in each currency, the ZiG at the day's rate, the difference against what
 * should be there, and what goes to the safe once tomorrow's float is left.
 *
 * Pure and browser-safe: the close page recomputes it as the notes are typed,
 * and `closeShift` writes the same figures. It works in whole cents (BigInt),
 * so it is exact to the cent without shipping decimal.js to the browser.
 *
 * The board's case: US$167.00 + ZiG 925 at 26.80 = 167.00 + 34.51 = US$201.51
 * against US$201.50 expected reads "None" — a ZiG count rounds to the cent, so
 * a difference under US$0.05 is the rounding, not the drawer.
 */

import { formatMoney } from "@/lib/workspace/format";

export const DENOMINATIONS = {
  USD: ["100", "50", "20", "10", "5", "2", "1"],
  ZWG: ["200", "100", "50", "20", "10", "5"],
} as const;

export type CountCurrency = keyof typeof DENOMINATIONS;
export type CountRow = { denomination: string; count: number };
export type DrawerState = "BALANCED" | "SHORT" | "OVER";

/** A Prisma `Decimal`, a number or its text: anything whose `toString` is a plain decimal. */
export type DecimalLike = string | number | { toString(): string };

export type DrawerCount = {
  countedUsd: string;
  countedZig: string;
  /** The ZiG notes in US$ at the rate, to the cent. */
  zigBase: string;
  counted: string;
  /** Counted less expected; "0.00" within the ZiG rounding tolerance. */
  difference: string;
  state: DrawerState;
  /** Counted less the float left: what goes to the safe. */
  toSafe: string;
};

/** Below this the difference is the ZiG count's rounding: US$0.05. */
const TOLERANCE = BigInt(5);
/** Above this a manager needs to know what happened: US$1.00. */
export const EXPLAIN_ABOVE = "1.00";

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);

/** Fixed-point units of a plain decimal, rounded half away from zero at `places`. */
function units(value: DecimalLike, places: number): bigint {
  const text = String(value).trim();
  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (!match[2] && !match[3])) throw new Error(`Not a decimal: ${text}`);
  const [, minus, whole = "", fraction = ""] = match;
  const kept = (fraction + "0".repeat(places + 1)).slice(0, places + 1);
  let result = BigInt(`${whole || "0"}${kept.slice(0, places)}`);
  if (Number(kept[places]) >= 5) result += BigInt(1);
  return minus ? -result : result;
}

const cents = (value: DecimalLike) => units(value, 2);

/** Cents as "201.51", "-4.50". */
export function fromCents(value: bigint): string {
  const negative = value < ZERO;
  const abs = negative ? -value : value;
  const whole = abs / HUNDRED;
  const part = (abs % HUNDRED).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${part}`;
}

/** What one row of notes comes to: "50.00" for one US$50. */
export function rowTotal(row: CountRow): string {
  return fromCents(cents(row.denomination) * BigInt(Math.max(0, Math.trunc(row.count || 0))));
}

function total(rows: ReadonlyArray<CountRow>): bigint {
  return rows.reduce((sum, row) => sum + cents(row.denomination) * BigInt(Math.max(0, Math.trunc(row.count || 0))), ZERO);
}

/** ZiG cents ÷ (ZiG per US$1), to the US$ cent, half away from zero. */
function zigToUsd(zigCents: bigint, rate: DecimalLike | null): bigint {
  if (zigCents === ZERO) return ZERO;
  if (rate === null) throw new Error("A ZiG count needs a rate.");
  const per = units(rate, 4);
  if (per <= ZERO) throw new Error("A ZiG rate is above zero.");
  // zigCents / (per / 10^4) = zigCents * 10^4 / per; doubled to round half up.
  const twice = (zigCents * BigInt(20000)) / per;
  return (twice + BigInt(1)) / BigInt(2);
}

export function countDrawer(input: {
  usd: ReadonlyArray<CountRow>;
  zig: ReadonlyArray<CountRow>;
  rate: DecimalLike | null;
  expected: DecimalLike;
  floatLeft: DecimalLike;
}): DrawerCount {
  const usd = total(input.usd);
  const zig = total(input.zig);
  const zigBase = zigToUsd(zig, input.rate);
  const counted = usd + zigBase;
  const raw = counted - cents(input.expected);
  const difference = (raw < ZERO ? -raw : raw) < TOLERANCE ? ZERO : raw;
  return {
    countedUsd: fromCents(usd),
    countedZig: fromCents(zig),
    zigBase: fromCents(zigBase),
    counted: fromCents(counted),
    difference: fromCents(difference),
    state: difference === ZERO ? "BALANCED" : difference < ZERO ? "SHORT" : "OVER",
    toSafe: fromCents(counted - cents(input.floatLeft)),
  };
}

/** Whether a difference is big enough that "What happened" must be said: more than US$1.00 either way. */
export function needsExplaining(difference: DecimalLike): boolean {
  const value = cents(difference);
  return (value < ZERO ? -value : value) > cents(EXPLAIN_ABOVE);
}

/** Whether `a` is more than `b`, to the cent. */
export function moreThan(a: DecimalLike, b: DecimalLike): boolean {
  return cents(a) > cents(b);
}

/**
 * The float left for tomorrow is US$ notes out of the drawer, so it can be no
 * more than the US$ counted: the sentence when it is, else null. The server
 * refuses with it, and the close page and the till say it before posting, so
 * a blind count never meets it after the difference.
 */
export function floatLeftProblem(floatLeft: DecimalLike, countedUsd: DecimalLike): string | null {
  return moreThan(floatLeft, countedUsd) ? `Only ${formatMoney(Number(countedUsd))} in US$ notes was counted.` : null;
}
