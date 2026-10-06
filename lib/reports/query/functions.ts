import type { ReportColumnKind, ReportValue } from "@/lib/reports/types";

/**
 * What a query can call: functions of one row, and aggregates over many.
 *
 * Each says what it returns given what it is passed, so a query is typed
 * before it runs — a total of money is money, in the same currency, and a
 * month of a date is still a date a trend chart can follow.
 */

export type Value = ReportValue;
export type ValueType = { kind: ReportColumnKind; currency?: string };

const NUMBER: ValueType = { kind: "number" };
const TEXT: ValueType = { kind: "text" };
const DATE: ValueType = { kind: "date" };

export function isNumericKind(kind: ReportColumnKind): boolean {
  return kind === "number" || kind === "money";
}

export function isBlank(value: Value | undefined): value is null | undefined | "" {
  return value === null || value === undefined || value === "";
}

export function asNumber(value: Value | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function asText(value: Value | undefined): string {
  if (isBlank(value)) return "";
  return String(value);
}

export function truthy(value: Value | undefined): boolean {
  if (isBlank(value)) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return true;
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** The day a value names, as `YYYY-MM-DD`, or null. */
export function asDay(value: Value | undefined): string | null {
  if (typeof value !== "string") return null;
  const match = ISO_DAY.exec(value);
  return match ? match[0] : null;
}

const DAY_MS = 86_400_000;

function dayToTime(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function timeToDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export function addDays(value: Value, days: Value): Value {
  const day = asDay(value);
  const count = asNumber(days);
  if (!day || count === null) return null;
  return timeToDay(dayToTime(day) + Math.round(count) * DAY_MS);
}

export function daysBetween(from: Value, to: Value): Value {
  const a = asDay(from);
  const b = asDay(to);
  if (!a || !b) return null;
  return Math.round((dayToTime(b) - dayToTime(a)) / DAY_MS);
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** Order two values: numbers by size, everything else as text, ignoring case. */
export function compare(a: Value, b: Value): number {
  const na = typeof a === "number" ? a : null;
  const nb = typeof b === "number" ? b : null;
  if (na !== null || nb !== null) {
    const x = na ?? asNumber(a);
    const y = nb ?? asNumber(b);
    if (x !== null && y !== null) return x - y;
  }
  if (typeof a === "boolean" || typeof b === "boolean") return Number(truthy(a)) - Number(truthy(b));
  return collator.compare(asText(a), asText(b));
}

/** Money and averages carry float dust; four places is more than any figure shows. */
export function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function numeric(fn: (value: number, ...rest: number[]) => number) {
  return (args: Value[]) => {
    const numbers = args.map(asNumber);
    if (numbers[0] === null || numbers[0] === undefined) return null;
    const result = fn(numbers[0], ...numbers.slice(1).map((value) => value ?? 0));
    return Number.isFinite(result) ? round4(result) : null;
  };
}

function text(fn: (value: string, ...rest: Value[]) => Value) {
  return (args: Value[]) => (isBlank(args[0]) ? null : fn(asText(args[0]), ...args.slice(1)));
}

function day(fn: (day: string) => Value) {
  return (args: Value[]) => {
    const value = asDay(args[0]);
    return value ? fn(value) : null;
  };
}

/** The type of the first argument that is not a bare null, for coalesce and if. */
function firstTyped(types: ValueType[], skip = 0): ValueType {
  return types.slice(skip).find((type) => type.kind !== "text") ?? types[skip] ?? TEXT;
}

const keepType = (types: ValueType[]) => types[0] ?? NUMBER;

export type FunctionSpec = {
  signature: string;
  help: string;
  min: number;
  max: number;
  type: (args: ValueType[]) => ValueType;
};

export type RowFunction = FunctionSpec & { run: (args: Value[]) => Value };

export const ROW_FUNCTIONS: Record<string, RowFunction> = {
  /* Numbers */
  round: { signature: "round(x, places?)", help: "x rounded, to whole numbers unless places is given", min: 1, max: 2, type: keepType,
    run: numeric((x, places = 0) => { const f = 10 ** Math.max(0, Math.min(6, Math.round(places))); return Math.round(x * f) / f; }) },
  floor: { signature: "floor(x)", help: "x rounded down", min: 1, max: 1, type: keepType, run: numeric(Math.floor) },
  ceil: { signature: "ceil(x)", help: "x rounded up", min: 1, max: 1, type: keepType, run: numeric(Math.ceil) },
  abs: { signature: "abs(x)", help: "x without its sign", min: 1, max: 1, type: keepType, run: numeric(Math.abs) },
  number: { signature: "number(x)", help: "x read as a number", min: 1, max: 1, type: () => NUMBER, run: (args) => asNumber(args[0]) },
  percent: { signature: "percent(part, whole)", help: "part as a percentage of whole", min: 2, max: 2, type: () => NUMBER,
    run: (args) => { const part = asNumber(args[0]); const whole = asNumber(args[1]); return part === null || !whole ? null : round4((part / whole) * 100); } },

  /* Text */
  lower: { signature: "lower(text)", help: "text in lower case", min: 1, max: 1, type: () => TEXT, run: text((value) => value.toLowerCase()) },
  upper: { signature: "upper(text)", help: "text in capitals", min: 1, max: 1, type: () => TEXT, run: text((value) => value.toUpperCase()) },
  trim: { signature: "trim(text)", help: "text without spaces at either end", min: 1, max: 1, type: () => TEXT, run: text((value) => value.trim()) },
  len: { signature: "len(text)", help: "how many characters text has", min: 1, max: 1, type: () => NUMBER, run: (args) => asText(args[0]).length },
  text: { signature: "text(x)", help: "x as text", min: 1, max: 1, type: () => TEXT, run: (args) => (isBlank(args[0]) ? null : asText(args[0])) },
  concat: { signature: "concat(a, b, …)", help: "the values joined into one text, blanks skipped", min: 1, max: 20, type: () => TEXT,
    run: (args) => args.map(asText).join("") },
  substr: { signature: "substr(text, start, length?)", help: "part of text, counting from 1", min: 2, max: 3, type: () => TEXT,
    run: text((value, start, length) => { const from = Math.max(0, (asNumber(start) ?? 1) - 1); const count = asNumber(length ?? null); return count === null ? value.slice(from) : value.slice(from, from + Math.max(0, count)); }) },
  replace: { signature: "replace(text, find, with)", help: "text with every find replaced", min: 3, max: 3, type: () => TEXT,
    run: text((value, find, by) => (asText(find) ? value.split(asText(find)).join(asText(by)) : value)) },
  contains: { signature: "contains(text, part)", help: "whether text has part in it, ignoring case", min: 2, max: 2, type: () => TEXT,
    run: (args) => asText(args[0]).toLowerCase().includes(asText(args[1]).toLowerCase()) },
  starts_with: { signature: "starts_with(text, part)", help: "whether text begins with part, ignoring case", min: 2, max: 2, type: () => TEXT,
    run: (args) => asText(args[0]).toLowerCase().startsWith(asText(args[1]).toLowerCase()) },
  ends_with: { signature: "ends_with(text, part)", help: "whether text ends with part, ignoring case", min: 2, max: 2, type: () => TEXT,
    run: (args) => asText(args[0]).toLowerCase().endsWith(asText(args[1]).toLowerCase()) },

  /* Dates */
  day: { signature: "day(date)", help: "the date without its time", min: 1, max: 1, type: () => DATE, run: day((value) => value) },
  week: { signature: "week(date)", help: "the Monday of the date's week", min: 1, max: 1, type: () => DATE,
    run: day((value) => { const time = dayToTime(value); const offset = (new Date(time).getUTCDay() + 6) % 7; return timeToDay(time - offset * DAY_MS); }) },
  month: { signature: "month(date)", help: "the first of the date's month", min: 1, max: 1, type: () => DATE, run: day((value) => `${value.slice(0, 7)}-01`) },
  quarter: { signature: "quarter(date)", help: "the first day of the date's quarter", min: 1, max: 1, type: () => DATE,
    run: day((value) => { const month = Math.floor((Number(value.slice(5, 7)) - 1) / 3) * 3 + 1; return `${value.slice(0, 4)}-${String(month).padStart(2, "0")}-01`; }) },
  year: { signature: "year(date)", help: "the date's year, as a number", min: 1, max: 1, type: () => NUMBER, run: day((value) => Number(value.slice(0, 4))) },
  weekday: { signature: "weekday(date)", help: "the day of the week: Monday, Tuesday, …", min: 1, max: 1, type: () => TEXT,
    run: day((value) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(dayToTime(value)).getUTCDay()]!) },
  days_between: { signature: "days_between(from, to)", help: "days from one date to another", min: 2, max: 2, type: () => NUMBER,
    run: (args) => daysBetween(args[0]!, args[1]!) },
  add_days: { signature: "add_days(date, days)", help: "the date that many days later (or earlier, if negative)", min: 2, max: 2, type: () => DATE,
    run: (args) => addDays(args[0]!, args[1]!) },
  today: { signature: "today()", help: "today's date", min: 0, max: 0, type: () => DATE, run: () => timeToDay(Date.now()) },
  date: { signature: "date(text)", help: "text read as a date, like date(\"2026-01-31\")", min: 1, max: 1, type: () => DATE, run: (args) => asDay(args[0]!) },

  /* Choices */
  if: { signature: "if(condition, then, else?)", help: "then when the condition holds, else otherwise", min: 2, max: 3,
    type: (types) => firstTyped(types, 1), run: (args) => (truthy(args[0]) ? args[1]! : args[2] ?? null) },
  coalesce: { signature: "coalesce(a, b, …)", help: "the first value that is not blank", min: 1, max: 20,
    type: (types) => firstTyped(types), run: (args) => args.find((value) => !isBlank(value)) ?? null },
};

export type AggregateFunction = FunctionSpec & {
  /** The argument, once per row. */
  run: (values: Value[]) => Value;
};

function present(values: Value[]): Value[] {
  return values.filter((value) => !isBlank(value));
}

function numbersOf(values: Value[]): number[] {
  return values.map(asNumber).filter((value): value is number => value !== null);
}

function extreme(values: Value[], sign: 1 | -1): Value {
  const kept = present(values);
  if (kept.length === 0) return null;
  return kept.reduce((best, value) => (compare(value, best) * sign > 0 ? value : best));
}

export const AGGREGATE_FUNCTIONS: Record<string, AggregateFunction> = {
  count: { signature: "count(x?)", help: "how many rows — or, given x, how many rows have it", min: 0, max: 1, type: () => NUMBER,
    // `count()` with nothing in it counts rows; the compiler handles that itself.
    run: (values) => present(values).length },
  count_distinct: { signature: "count_distinct(x)", help: "how many different values of x", min: 1, max: 1, type: () => NUMBER,
    run: (values) => new Set(present(values).map((value) => asText(value).toLowerCase())).size },
  sum: { signature: "sum(x)", help: "x added up", min: 1, max: 1, type: keepType,
    run: (values) => { const numbers = numbersOf(values); return numbers.length ? round4(numbers.reduce((a, b) => a + b, 0)) : null; } },
  avg: { signature: "avg(x)", help: "the average of x", min: 1, max: 1, type: keepType,
    run: (values) => { const numbers = numbersOf(values); return numbers.length ? round4(numbers.reduce((a, b) => a + b, 0) / numbers.length) : null; } },
  median: { signature: "median(x)", help: "the middle value of x", min: 1, max: 1, type: keepType,
    run: (values) => {
      const numbers = numbersOf(values).sort((a, b) => a - b);
      if (numbers.length === 0) return null;
      const middle = Math.floor(numbers.length / 2);
      return numbers.length % 2 ? numbers[middle]! : round4((numbers[middle - 1]! + numbers[middle]!) / 2);
    } },
  min: { signature: "min(x)", help: "the lowest x — the earliest, for a date", min: 1, max: 1, type: keepType, run: (values) => extreme(values, -1) },
  max: { signature: "max(x)", help: "the highest x — the latest, for a date", min: 1, max: 1, type: keepType, run: (values) => extreme(values, 1) },
  first: { signature: "first(x)", help: "x on the first row", min: 1, max: 1, type: keepType, run: (values) => values[0] ?? null },
  last: { signature: "last(x)", help: "x on the last row", min: 1, max: 1, type: keepType, run: (values) => values[values.length - 1] ?? null },
};
