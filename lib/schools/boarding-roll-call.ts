/**
 * Taking a roll call.
 *
 * ## The rule this file exists to enforce
 *
 * A roll call opens with everybody already accounted for *who the school
 * already knows about*. A child signed out at the gate is not a child the
 * warden failed to find, and a child in the sick bay is two doors away with a
 * temperature — making somebody tick past them is how the count becomes a
 * ritual instead of a check.
 *
 * So `NOT_SEEN` means only one thing: nobody has looked yet. That is what makes
 * the screen's "N to go" number worth driving to zero.
 *
 * ## Why the derived statuses are written down
 *
 * `SIGNED_OUT` and `SICK_BAY` could be computed at read time by joining the
 * gate book. They are not. A leave record can be edited, cancelled or deleted
 * after the fact, and the register has to keep saying what was true that night
 * — otherwise amending an exeat silently rewrites a safeguarding record three
 * weeks after the event.
 */

import type { SchoolRollCallEntryStatus } from "@prisma/client";

/** A boarder as the roll call needs them. */
export type RollCallBoarder = {
  studentId: string;
  name: string;
  studentNo: string;
  bedId: string | null;
  bedCode: string | null;
  bay: number | null;
  roomId: string | null;
  roomName: string | null;
};

/**
 * The status an entry should open at, given what the school already knows.
 *
 * Signed out beats the sick bay: a child who is away on an exeat is not in the
 * building at all, which is the more important fact of the two and the one the
 * gate is responsible for.
 */
export function openingStatus(input: {
  studentId: string;
  signedOutStudentIds: ReadonlySet<string>;
  sickBayStudentIds: ReadonlySet<string>;
}): SchoolRollCallEntryStatus {
  if (input.signedOutStudentIds.has(input.studentId)) return "SIGNED_OUT";
  if (input.sickBayStudentIds.has(input.studentId)) return "SICK_BAY";
  return "NOT_SEEN";
}

export type RollCallTally = {
  total: number;
  present: number;
  signedOut: number;
  sickBay: number;
  absent: number;
  notSeen: number;
};

export function tally(statuses: readonly SchoolRollCallEntryStatus[]): RollCallTally {
  const count = (status: SchoolRollCallEntryStatus) =>
    statuses.filter((value) => value === status).length;
  return {
    total: statuses.length,
    present: count("PRESENT"),
    signedOut: count("SIGNED_OUT"),
    sickBay: count("SICK_BAY"),
    absent: count("ABSENT"),
    notSeen: count("NOT_SEEN"),
  };
}

/**
 * Can this roll call be signed off?
 *
 * Only when nobody is left unlooked-at. `ABSENT` does not block it — a child
 * who has been looked for and not found is an answer, and a bad one, but it is
 * the warden's answer to give and the phone call starts from there. `NOT_SEEN`
 * blocks, because submitting it would record "we checked" when nobody did.
 */
export function canSubmit(statuses: readonly SchoolRollCallEntryStatus[]): boolean {
  return statuses.length > 0 && !statuses.includes("NOT_SEEN");
}

/**
 * The sentence the screen puts at the top of a finished count.
 *
 * Written here rather than in the component so the wording is the same on the
 * house page, the roll-call page and anywhere else that summarises a night.
 */
export function rollCallSummary(counts: RollCallTally): string {
  if (counts.notSeen > 0) {
    return `${counts.notSeen} still to account for`;
  }
  if (counts.absent > 0) {
    return `${counts.absent} unaccounted for — ${counts.present} in, ${counts.signedOut} signed out, ${counts.sickBay} in the sick bay`;
  }
  return `Everybody accounted for — ${counts.present} in, ${counts.signedOut} signed out, ${counts.sickBay} in the sick bay`;
}

/**
 * The night a roll call belongs to, normalised to midnight.
 *
 * A count taken at 21:05 and an amendment made at 06:00 the next morning are
 * the same night's register. Without this they are two rows and the unique
 * constraint does not bite.
 */
export function rollCallDate(at: Date): Date {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date;
}
