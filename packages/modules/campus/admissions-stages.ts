/**
 * The admissions pipeline as a state machine, with no database behind it.
 *
 * Pure and separate from `admissions.ts` for the reason `calendar-kinds.ts` is
 * separate from `calendar.ts`: the board draws the columns and the "what can I
 * do next" buttons from these tables, and importing one of them from a module
 * that imports Prisma pulls `pg` into the browser bundle.
 */

export type ApplicationStage =
  | "ENQUIRY"
  | "APPLIED"
  | "ASSESSMENT"
  | "WAITLISTED"
  | "OFFERED"
  | "ACCEPTED"
  | "ENROLLED"
  | "DECLINED"
  | "WITHDRAWN";

/** Left to right, the way a board is read. */
export const PIPELINE_STAGES: ApplicationStage[] = [
  "ENQUIRY",
  "APPLIED",
  "ASSESSMENT",
  "WAITLISTED",
  "OFFERED",
  "ACCEPTED",
  "ENROLLED",
];

/** Off the board, but not deleted — the school still has to be able to look. */
export const CLOSED_STAGES: ApplicationStage[] = ["DECLINED", "WITHDRAWN"];

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  ENQUIRY: "Enquiry",
  APPLIED: "Applied",
  ASSESSMENT: "Assessment",
  WAITLISTED: "Waiting list",
  OFFERED: "Offered",
  ACCEPTED: "Accepted",
  ENROLLED: "Enrolled",
  DECLINED: "Turned down",
  WITHDRAWN: "Withdrawn",
};

/**
 * Where each stage may go next.
 *
 * `DECLINED` means the school said no; a family that turns an offer down is
 * `WITHDRAWN`. Keeping them apart is the difference between "we had forty
 * applicants and rejected six" and "six families chose another school", which
 * are different problems with different fixes.
 *
 * Both closed stages can be reopened to `APPLIED`. A withdrawal is often a
 * family changing its mind twice, and forcing a second application would lose
 * the trail on the first.
 */
export const ALLOWED_TRANSITIONS: Record<ApplicationStage, ApplicationStage[]> = {
  ENQUIRY: ["APPLIED", "DECLINED", "WITHDRAWN"],
  APPLIED: ["ASSESSMENT", "OFFERED", "WAITLISTED", "DECLINED", "WITHDRAWN"],
  ASSESSMENT: ["OFFERED", "WAITLISTED", "DECLINED", "WITHDRAWN"],
  WAITLISTED: ["OFFERED", "DECLINED", "WITHDRAWN"],
  OFFERED: ["ACCEPTED", "WAITLISTED", "DECLINED", "WITHDRAWN"],
  ACCEPTED: ["ENROLLED", "WITHDRAWN"],
  // Terminal. A child on the roll leaves through the student record, not by
  // being walked backwards through admissions.
  ENROLLED: [],
  DECLINED: ["APPLIED"],
  WITHDRAWN: ["APPLIED"],
};

export function canMoveTo(from: ApplicationStage, to: ApplicationStage) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Why a move is refused, written for the person clicking rather than for a log.
 * Null when it is allowed.
 */
export function transitionRefusal(
  from: ApplicationStage,
  to: ApplicationStage,
): string | null {
  if (from === to) return null;
  if (canMoveTo(from, to)) return null;
  if (from === "ENROLLED") {
    return "This child is on the roll. Changes go through the student record now.";
  }
  const options = ALLOWED_TRANSITIONS[from];
  if (options.length === 0) {
    return `${STAGE_LABELS[from]} is the end of the line.`;
  }
  return `From ${STAGE_LABELS[from]} the next step is ${options
    .map((stage) => STAGE_LABELS[stage])
    .join(", ")} — not ${STAGE_LABELS[to]}.`;
}

/** True when an offer made on `offeredAt` has run out by `now`. */
export function offerHasLapsed(
  application: { stage: ApplicationStage; offerExpiresAt: Date | string | null },
  now: Date,
) {
  if (application.stage !== "OFFERED") return false;
  if (!application.offerExpiresAt) return false;
  return new Date(application.offerExpiresAt).getTime() < now.getTime();
}
