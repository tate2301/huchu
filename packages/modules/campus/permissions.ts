import { hasPersonaPermission, personaForRole } from "@corelithzw/platform/personas";

/**
 * What a member of school staff may do.
 *
 * The persona catalogue has always described this, but nothing mapped a role
 * onto a persona, so `hasPersonaPermission` had no call sites and the grants
 * were decoration. This is the school's entry point into it.
 *
 * The route registry is a separate axis and does not substitute for this. It
 * answers "is this module switched on for this tenant" — `requireApiAuth` runs
 * `canAccessRouteWithToken` for `/api/v2/**` (`lib/auth-core/access.ts`), so a
 * company without `schools.fees` gets a 403 before the handler. What it never
 * asks is which signed-in member of staff is calling. Feature-enabled plus
 * signed-in is the whole of its answer, and that describes a teacher as
 * accurately as it describes the bursar. The check below is what stands
 * between the two and the fee ledger.
 */

export const SCHOOL_RESOURCES = [
  "schools.academics",
  "schools.admissions",
  "schools.students",
  "schools.teachers",
  "schools.attendance",
  "schools.fees",
  "schools.boarding",
  "schools.results",
  "schools.reports",
] as const;

export type SchoolResource = (typeof SCHOOL_RESOURCES)[number];

/**
 * The tenant's own administrators, who are not scoped by a vertical persona.
 * Everyone else is answered from the persona grants.
 */
const TENANT_ADMIN_ROLES = new Set(["SUPERADMIN", "MANAGER"]);

export function canSchoolRoleDo(
  role: string | null | undefined,
  resource: SchoolResource,
  action: string,
): boolean {
  if (!role) return false;
  const normalized = role.trim().toUpperCase();
  if (TENANT_ADMIN_ROLES.has(normalized)) return true;

  const persona = personaForRole(normalized);
  if (!persona) return false;

  return hasPersonaPermission([persona], resource, action);
}

export type SessionLike = { user: { role?: string | null } };

/**
 * Whether this is one of the tenant's own administrators.
 *
 * Some acts belong to the office's head rather than to a persona grant — how a
 * record is *presented* (its photograph, its emoji, its accent) is one, because
 * a display image shows on every list every role reads, and the school decided
 * only its administrators set those.
 */
export function isSchoolAdmin(role: string | null | undefined): boolean {
  if (!role) return false;
  const normalized = role.trim().toUpperCase();
  // The head's own account is SCHOOL_ADMIN, not a tenant-wide role; for the
  // school's presentation decisions the head is exactly who "admin" means.
  return TENANT_ADMIN_ROLES.has(normalized) || normalized === "SCHOOL_ADMIN";
}

/**
 * Returns null when allowed, or the message to refuse with.
 *
 * A message rather than a thrown error, because every school route already
 * returns through `errorResponse` and a throw would be caught by the generic
 * handler and reported as a 500.
 */
export function schoolPermissionDenial(
  session: SessionLike,
  resource: SchoolResource,
  action: string,
): string | null {
  if (canSchoolRoleDo(session.user.role, resource, action)) return null;
  return `Your role cannot ${action.replace(/-/g, " ")} ${resource.replace("schools.", "")}`;
}
