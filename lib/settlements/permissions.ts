/**
 * What a member of staff may do with settlements.
 *
 * A separate matrix from `lib/hr/permissions.ts` rather than two more resources
 * bolted onto it, because the two answer different questions about different
 * people. Payroll is the finance function; a settlement is signed off by whoever
 * runs the yard or the shaft, and a gold mine's site manager who approves a
 * settlement has no business in the salary bill.
 *
 * Same shape and same default: deny. A role absent from the table can do nothing.
 */

export const SETTLEMENT_RESOURCES = [
  /// Intakes: what is owed, entered by whoever counted it.
  "settlements.intake",
  /// Runs: the computed settlement.
  "settlements.run",
  /// Batches: money leaving.
  "settlements.batch",
] as const;

export type SettlementResource = (typeof SETTLEMENT_RESOURCES)[number];

export const SETTLEMENT_ACTIONS = [
  "view",
  "create",
  "edit",
  "submit",
  "approve",
  "disburse",
] as const;

export type SettlementAction = (typeof SETTLEMENT_ACTIONS)[number];

const ALL: SettlementAction[] = [...SETTLEMENT_ACTIONS];
const VIEW_ONLY: SettlementAction[] = ["view"];
/** Prepare but do not approve, and do not move money. */
const PREPARE: SettlementAction[] = ["view", "create", "edit", "submit"];

type Matrix = Partial<
  Record<string, Partial<Record<SettlementResource, SettlementAction[]>>>
>;

const MATRIX: Matrix = {
  SUPERADMIN: {
    "settlements.intake": ALL,
    "settlements.run": ALL,
    "settlements.batch": ALL,
  },
  MANAGER: {
    "settlements.intake": ALL,
    "settlements.run": ALL,
    "settlements.batch": ALL,
  },
  CLERK: {
    "settlements.intake": PREPARE,
    "settlements.run": PREPARE,
    "settlements.batch": VIEW_ONLY,
  },
  // An operator counts the scrap and weighs the gold, so they may record an
  // intake and submit it — that is the job. They cannot approve their own count,
  // compute a run from it, or pay it out. `isTwoStepActionAllowed` enforces the
  // same-person half of that separately.
  OPERATOR: {
    "settlements.intake": PREPARE,
    "settlements.run": VIEW_ONLY,
    "settlements.batch": VIEW_ONLY,
  },
};

export function canSettlementRoleDo(
  role: string | null | undefined,
  resource: SettlementResource,
  action: SettlementAction,
): boolean {
  if (!role) return false;
  const grants = MATRIX[role.trim().toUpperCase()];
  if (!grants) return false;
  return grants[resource]?.includes(action) ?? false;
}

export type SessionLike = { user: { role?: string | null } };

/** Returns null when allowed, or the message to refuse with. */
export function settlementPermissionDenial(
  session: SessionLike,
  resource: SettlementResource,
  action: SettlementAction,
): string | null {
  if (canSettlementRoleDo(session.user.role, resource, action)) return null;
  return `Your role cannot ${action} ${resource.replace("settlements.", "")} records`;
}
