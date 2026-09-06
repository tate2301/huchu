/**
 * Calendar-kind rules with no database behind them.
 *
 * Split out of `lib/schools/calendar.ts` for the same reason
 * `timetable-format.ts` is split out of `timetable.ts`: that module imports
 * Prisma, and a client component importing one symbol from it drags `pg` and
 * `dns` into the browser bundle and the page 500s. Anything a form needs lives
 * here; `calendar.ts` re-exports it so server callers have one import.
 */

export type SchoolCalendarEventKindValue =
  | "HOLIDAY"
  | "PUBLIC_HOLIDAY"
  | "HALF_TERM"
  | "EXAM"
  | "EVENT"
  | "STAFF_ONLY";

export const CALENDAR_KIND_LABELS: Record<SchoolCalendarEventKindValue, string> = {
  PUBLIC_HOLIDAY: "Public holiday",
  HOLIDAY: "School holiday",
  HALF_TERM: "Half term",
  STAFF_ONLY: "Staff-only day",
  EXAM: "Examination",
  EVENT: "Event",
};

/**
 * Whether a kind of event closes the school, absent an explicit answer.
 *
 * The flag and the kind are separate columns because they are separate
 * questions — a sports day is an EVENT children attend, a speech day is an
 * EVENT that closes lessons — but a caller who names a kind and says nothing
 * else means the obvious thing. Defaulting every kind to "open" would let
 * someone enter Christmas and still be shown twelve missing registers.
 */
export function defaultIsTeachingDay(kind: SchoolCalendarEventKindValue) {
  switch (kind) {
    case "HOLIDAY":
    case "PUBLIC_HOLIDAY":
    case "HALF_TERM":
    case "STAFF_ONLY":
      return false;
    case "EXAM":
    case "EVENT":
      return true;
  }
}
