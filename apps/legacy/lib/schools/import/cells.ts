/**
 * Reading one cell out of a school's old spreadsheet.
 *
 * Every function here returns either a value or a sentence a registrar can act
 * on. "Row 42: 'Frm 1 Blue' isn't a class here — did you mean 'Form 1 Blue'?"
 * is the difference between an afternoon and a fortnight; "invalid foreign key"
 * is not.
 */
import { Prisma } from "@corelithzw/db";

import { money } from "@/lib/schools/money";

export type CellResult<T> = { ok: true; value: T } | { ok: false; message: string };

/**
 * Money, as a Decimal, without ever touching a JS number.
 *
 * `money()` accepts a string and hands it straight to Decimal, so the only job
 * here is stripping what a spreadsheet puts around the digits: currency
 * symbols, thousands separators, the non-breaking spaces Excel likes, and the
 * accounting convention of wrapping a negative in brackets.
 */
export function parseMoneyCell(raw: string): CellResult<Prisma.Decimal> {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, message: "is blank" };

  // (1,250.00) means -1250.00 on every finance export I have ever seen.
  const bracketed = /^\((.*)\)$/.exec(trimmed);
  const body = bracketed ? bracketed[1] : trimmed;

  const cleaned = body
    .replace(/[  \s]/g, "")
    .replace(/,/g, "")
    .replace(/[^0-9.\-]/g, "");

  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") {
    return { ok: false, message: `"${raw.trim()}" isn't an amount` };
  }
  if ((cleaned.match(/\./g) ?? []).length > 1) {
    return { ok: false, message: `"${raw.trim()}" has more than one decimal point` };
  }

  let decimal: Prisma.Decimal;
  try {
    decimal = money(cleaned);
  } catch {
    return { ok: false, message: `"${raw.trim()}" isn't an amount` };
  }

  return { ok: true, value: bracketed ? decimal.negated() : decimal };
}

const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const DMY_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

/**
 * A date, read conservatively.
 *
 * Only ISO and unambiguous day-first forms are accepted. 03/04/2019 is
 * deliberately REFUSED rather than guessed: this repo's schools are
 * Zimbabwean and would read it as 3 April, an American export means 4 March,
 * and a birthday silently wrong by a month is worse than a row a registrar has
 * to look at. A four-digit year and a day above twelve resolve it.
 */
export function parseDateCell(raw: string): CellResult<Date> {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, message: "is blank" };

  const iso = ISO_DATE.exec(trimmed);
  if (iso) {
    const [, year, month, day] = iso;
    return buildDate(Number(year), Number(month), Number(day), trimmed);
  }

  const dmy = DMY_DATE.exec(trimmed);
  if (dmy) {
    const [, first, second, year] = dmy;
    const firstNumber = Number(first);
    const secondNumber = Number(second);
    if (firstNumber > 12 && secondNumber <= 12) {
      return buildDate(Number(year), secondNumber, firstNumber, trimmed);
    }
    if (secondNumber > 12 && firstNumber <= 12) {
      return buildDate(Number(year), firstNumber, secondNumber, trimmed);
    }
    if (firstNumber <= 12 && secondNumber <= 12) {
      return {
        ok: false,
        message: `"${trimmed}" could be ${firstNumber} ${monthName(secondNumber)} or ${secondNumber} ${monthName(firstNumber)} — write it as YYYY-MM-DD`,
      };
    }
    return { ok: false, message: `"${trimmed}" isn't a date` };
  }

  return { ok: false, message: `"${trimmed}" isn't a date — write it as YYYY-MM-DD` };
}

function buildDate(year: number, month: number, day: number, raw: string): CellResult<Date> {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { ok: false, message: `"${raw}" isn't a real date` };
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls 31 February forward into March rather than complaining.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { ok: false, message: `"${raw}" isn't a real date` };
  }
  return { ok: true, value: date };
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
function monthName(month: number): string {
  return MONTHS[month - 1] ?? String(month);
}

/** Loose comparison for names a school types slightly differently each year. */
export function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Phone numbers arrive as +263 77 123 4567, 077-123-4567, 0771234567. */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  // A Zimbabwean mobile is written both as 0771234567 and 263771234567; treat
  // them as one number so a parent listed twice is caught.
  if (digits.startsWith("263") && digits.length > 9) return `0${digits.slice(3)}`;
  return digits;
}

/**
 * The closest candidate to a value that did not match, or null if nothing is
 * close enough to be worth suggesting.
 *
 * Only ever a SUGGESTION. Applying it silently is how a child ends up in the
 * wrong class, so the caller puts it in the message and leaves the decision to
 * the person reading it.
 */
export function closestMatch(input: string, candidates: string[]): string | null {
  const needle = normalizeName(input);
  if (!needle) return null;

  let best: { candidate: string; distance: number } | null = null;
  for (const candidate of candidates) {
    const distance = editDistance(needle, normalizeName(candidate));
    if (!best || distance < best.distance) best = { candidate, distance };
  }
  if (!best) return null;

  // A third of the length, so "Form 1 Blue" catches "Frm 1 Blue" but not
  // "Form 4 Green".
  const tolerance = Math.max(1, Math.floor(needle.length / 3));
  return best.distance <= tolerance ? best.candidate : null;
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}
