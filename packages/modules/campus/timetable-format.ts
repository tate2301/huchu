/**
 * Timetable values a browser needs, with no database behind them.
 *
 * Split from `lib/schools/timetable.ts` because that module imports `prisma`,
 * and a client component importing `formatMinute` from it dragged `pg` — and
 * therefore `dns` and `fs` — into the browser bundle. The page returned a 500
 * with a module-not-found on `dns`, which is the build telling you the import
 * graph is wrong rather than anything being missing.
 *
 * Anything here must stay free of server-only imports. The server module
 * re-exports it, so call sites on that side are unaffected.
 */

/** ISO-8601: Monday is 1, Sunday is 7. */
export const DAYS_OF_WEEK = [1, 2, 3, 4, 5, 6, 7] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export const DAY_NAMES: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

export function isDayOfWeek(value: number): value is DayOfWeek {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

/**
 * Minutes from midnight as "07:30".
 *
 * Periods are stored as integers because a period is a wall-clock fact about a
 * school day, not an instant — see the note on `SchoolPeriod` in the schema.
 */
export function formatMinute(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** "07:30" as minutes from midnight, or null when it is not a time. */
export function parseMinute(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function isValidPeriodRange(startMinute: number, endMinute: number) {
  return (
    Number.isInteger(startMinute) &&
    Number.isInteger(endMinute) &&
    startMinute >= 0 &&
    endMinute <= 1440 &&
    startMinute < endMinute
  );
}

/** True when [startA, endA) and [startB, endB) share any minute. */
export function periodsOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
) {
  return startA < endB && startB < endA;
}
