import type { SchoolCalendarEventKindValue } from "../../calendar-kinds";

/**
 * Zimbabwe's statutory public holidays, worked out for a given year.
 *
 * The school calendar's own empty state has always said the right thing —
 * "Add the public holidays first — they are the ones that make registers look
 * missing" — and then left a registrar to type thirteen of them in by hand,
 * one dialog at a time, every January. Every one of those thirteen is fixed in
 * law or computable, so the screen can offer them.
 *
 * This is not sample data. These are the days the Public Holidays and
 * Prohibition of Business Act closes the country, and a school that opens on
 * one of them is a school with a data-entry mistake. What the seeder cannot
 * know — half terms, exam weeks, speech day — stays a hand-entered row, which
 * is why the verb is "Add the public holidays" and not "Fill the calendar".
 */

export type SeededHoliday = {
  title: string;
  kind: SchoolCalendarEventKindValue;
  /** ISO `YYYY-MM-DD`. Single-day, so start and end are the same. */
  date: string;
};

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/**
 * Easter Sunday, by the anonymous Gregorian computus.
 *
 * Good Friday and Easter Monday are statutory here and they move, so they are
 * either computed or left out. Left out is worse: a movable feast is exactly
 * the holiday somebody forgets, and it takes a whole school's registers with
 * it when they do.
 */
function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function shift(from: Date, days: number) {
  const out = new Date(from);
  out.setUTCDate(out.getUTCDate() + days);
  return `${out.getUTCFullYear()}-${String(out.getUTCMonth() + 1).padStart(2, "0")}-${String(
    out.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** The second Monday in August, which is when Heroes’ Day falls. */
function heroesDay(year: number) {
  const first = new Date(Date.UTC(year, 7, 1));
  // 1 = Monday in `getUTCDay()`'s 0-6, Sunday-first numbering.
  const offset = (8 - first.getUTCDay()) % 7;
  return new Date(Date.UTC(year, 7, 1 + offset + 7));
}

export function zimbabwePublicHolidays(year: number): SeededHoliday[] {
  const easter = easterSunday(year);
  const heroes = heroesDay(year);

  return [
    { title: "New Year’s Day", kind: "PUBLIC_HOLIDAY", date: iso(year, 1, 1) },
    {
      title: "Robert Gabriel Mugabe National Youth Day",
      kind: "PUBLIC_HOLIDAY",
      date: iso(year, 2, 21),
    },
    { title: "Good Friday", kind: "PUBLIC_HOLIDAY", date: shift(easter, -2) },
    { title: "Easter Saturday", kind: "PUBLIC_HOLIDAY", date: shift(easter, -1) },
    { title: "Easter Monday", kind: "PUBLIC_HOLIDAY", date: shift(easter, 1) },
    { title: "Independence Day", kind: "PUBLIC_HOLIDAY", date: iso(year, 4, 18) },
    { title: "Workers’ Day", kind: "PUBLIC_HOLIDAY", date: iso(year, 5, 1) },
    { title: "Africa Day", kind: "PUBLIC_HOLIDAY", date: iso(year, 5, 25) },
    { title: "Heroes’ Day", kind: "PUBLIC_HOLIDAY", date: shift(heroes, 0) },
    { title: "Defence Forces Day", kind: "PUBLIC_HOLIDAY", date: shift(heroes, 1) },
    { title: "Unity Day", kind: "PUBLIC_HOLIDAY", date: iso(year, 12, 22) },
    { title: "Christmas Day", kind: "PUBLIC_HOLIDAY", date: iso(year, 12, 25) },
    { title: "Boxing Day", kind: "PUBLIC_HOLIDAY", date: iso(year, 12, 26) },
  ];
}
