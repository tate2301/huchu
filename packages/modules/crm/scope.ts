/**
 * CRM record scoping.
 *
 * Product rule: every CRM user reads the whole company pipeline, but a
 * SALES_REP may only *edit* records assigned to them (and may claim
 * unassigned ones). Managers/admins edit everything.
 */
import type { UserRole } from "@corelithzw/db";

import type { AuthenticatedSession } from "@corelithzw/platform/auth-core/types";

// Mirrors the UserRole enum: "ADMIN" is not a role this platform issues, so
// listing it here only ever looked like it granted something.
const CRM_FULL_ACCESS_ROLES = new Set(["SUPERADMIN", "MANAGER"]);

/**
 * Roles that can own a lead. Auto-assignment only ever hands work to somebody
 * whose job it is — a bursar with a login shouldn't wake up owning a pipeline.
 */
export const CRM_ROLES: UserRole[] = ["SUPERADMIN", "MANAGER", "SALES_REP", "SALES_EXEC"];

export function hasCrmFullAccess(role: string | null | undefined): boolean {
  return CRM_FULL_ACCESS_ROLES.has(String(role ?? "").trim().toUpperCase());
}

/**
 * Whether the session may edit a record currently assigned to `assignedToId`.
 * A null assignee means the record is unassigned and can be claimed.
 */
export function canEditAssignedRecord(
  session: AuthenticatedSession,
  assignedToId: string | null | undefined,
): boolean {
  if (hasCrmFullAccess(session.user.role)) return true;
  if (!assignedToId) return true; // claimable
  return assignedToId === session.user.id;
}

/**
 * Whether the session may manage CRM configuration (forms, API keys,
 * commission rules).
 */
export function canManageCrmSettings(session: AuthenticatedSession): boolean {
  return hasCrmFullAccess(session.user.role);
}

/**
 * Insights scoping: reps see only their own numbers; managers see everyone.
 * Returns the repId to filter by, or null for "all reps".
 */
export function insightsRepFilter(session: AuthenticatedSession): string | null {
  return hasCrmFullAccess(session.user.role) ? null : session.user.id;
}
