/**
 * Where a project can be, and where it can go next.
 *
 * Kept apart from `projects.ts` because the project page needs it too: that
 * module reserves identifiers and opens cost centres, and pulling it into a
 * client bundle to learn the word for ON_HOLD would drag the database client
 * along with it. One copy of the rules, read by the route that enforces them
 * and by the page that offers them, so the two cannot disagree about what a
 * cancelled project may do.
 */

export const PROJECT_STATUSES = [
  "PLANNING",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/**
 * Which moves are allowed.
 *
 * A completed project can be reopened — unlike a completed job, which carries
 * a signature against work that was done on a particular day. A project is a
 * container, and a snag list arriving a fortnight later is the same project,
 * not a new one. Cancelled is final: cancelling is a decision, and undoing it
 * quietly would lose the fact that it was ever made.
 */
const TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  PLANNING: ["ACTIVE", "ON_HOLD", "CANCELLED"],
  ACTIVE: ["ON_HOLD", "COMPLETED", "CANCELLED"],
  ON_HOLD: ["ACTIVE", "COMPLETED", "CANCELLED"],
  COMPLETED: ["ACTIVE"],
  CANCELLED: [],
};

export function canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: ProjectStatus): readonly ProjectStatus[] {
  return TRANSITIONS[from];
}

export class ProjectTransitionError extends Error {
  constructor(from: ProjectStatus, to: ProjectStatus) {
    super(
      TRANSITIONS[from].length === 0
        ? `A ${PROJECT_STATUS_LABELS[from].toLowerCase()} project cannot be changed.`
        : `A ${PROJECT_STATUS_LABELS[from].toLowerCase()} project can only move to ${TRANSITIONS[
            from
          ]
            .map((status) => PROJECT_STATUS_LABELS[status].toLowerCase())
            .join(" or ")}, not ${PROJECT_STATUS_LABELS[to].toLowerCase()}.`,
    );
    this.name = "ProjectTransitionError";
  }
}

export function assertTransition(from: ProjectStatus, to: ProjectStatus): void {
  if (!canTransition(from, to)) throw new ProjectTransitionError(from, to);
}

/** A project is done taking new cost once it is closed one way or the other. */
export function isClosed(status: ProjectStatus): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}
