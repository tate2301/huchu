/**
 * Who a new lead goes to.
 *
 * The rule is deliberately boring: spread the work evenly, and never hand a
 * lead to somebody who is off. Clever routing is easy to build and impossible
 * to argue with when a rep asks why they got nothing this week.
 */
export type AssignmentCandidate = {
  id: string;
  name: string | null;
  /** Open leads already on this person's plate. */
  openLeads: number;
  /** Set when the person is away and shouldn't be given new work. */
  unavailable?: boolean;
};

export type AssignmentStrategy = "ROUND_ROBIN" | "LEAST_LOADED" | "MANUAL";

export type AssignmentDecision = {
  userId: string | null;
  reason: string;
};

/**
 * Pick an owner.
 *
 * `lastAssignedId` makes round-robin stable across requests without needing a
 * counter in the database: the next person after whoever got the last one.
 * Ties in least-loaded break by id so two servers deciding at once agree.
 */
export function pickAssignee(
  candidates: AssignmentCandidate[],
  options: { strategy?: AssignmentStrategy; lastAssignedId?: string | null } = {},
): AssignmentDecision {
  const strategy = options.strategy ?? "LEAST_LOADED";
  if (strategy === "MANUAL") {
    return { userId: null, reason: "Leads are assigned by hand in this workspace" };
  }

  const available = candidates.filter((candidate) => !candidate.unavailable);
  if (available.length === 0) {
    return { userId: null, reason: "Nobody is available to take it" };
  }

  if (strategy === "ROUND_ROBIN") {
    const ordered = [...available].sort((a, b) => a.id.localeCompare(b.id));
    const lastIndex = options.lastAssignedId
      ? ordered.findIndex((candidate) => candidate.id === options.lastAssignedId)
      : -1;
    const next = ordered[(lastIndex + 1) % ordered.length];
    return { userId: next.id, reason: `Next in the rotation after the previous lead` };
  }

  const sorted = [...available].sort(
    (a, b) => a.openLeads - b.openLeads || a.id.localeCompare(b.id),
  );
  const winner = sorted[0];
  return {
    userId: winner.id,
    reason:
      winner.openLeads === 0
        ? `${winner.name ?? "They"} had nothing open`
        : `${winner.name ?? "They"} had the fewest open leads (${winner.openLeads})`,
  };
}
