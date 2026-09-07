/**
 * Role → allowed-route-prefix restrictions.
 *
 * Some roles are pinned to a single area of the app regardless of which
 * features their company has enabled. A SALES_REP, for example, only ever
 * works inside the CRM; feature gating alone would still let them reach other
 * modules their tenant happens to have. This allowlist is enforced centrally
 * in resolveAccessContext, so it covers every page and every /api/v2 handler
 * that runs through requireApiAuth/validateSession.
 */

const SHARED_ALLOWED_PREFIXES = [
  "/api/auth",
  "/api/notifications",
  "/api/uploads",
  "/help",
  "/access-blocked",
  "/notifications",
  "/settings/profile",
];

export const ROLE_ROUTE_ALLOWLIST: Record<string, string[]> = {
  SALES_REP: ["/crm", "/api/v2/crm", ...SHARED_ALLOWED_PREFIXES],
};

function isWithin(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Returns true when the role has no restriction, or the pathname falls within
 * one of the role's allowed prefixes. Returns false when the role is
 * restricted and the pathname is outside every allowed prefix.
 */
export function isRouteAllowedForRole(role: string | null | undefined, pathname: string): boolean {
  const normalized = String(role ?? "").trim().toUpperCase();
  const allowlist = ROLE_ROUTE_ALLOWLIST[normalized];
  if (!allowlist) return true;
  return allowlist.some((prefix) => isWithin(pathname, prefix));
}

/**
 * Whether the role is subject to any route restriction at all.
 */
export function isRoleRouteRestricted(role: string | null | undefined): boolean {
  const normalized = String(role ?? "").trim().toUpperCase();
  return Boolean(ROLE_ROUTE_ALLOWLIST[normalized]);
}

/**
 * The landing path a restricted role should be redirected to (its first
 * allowed prefix), or null if the role is unrestricted.
 */
export function landingPathForRole(role: string | null | undefined): string | null {
  const normalized = String(role ?? "").trim().toUpperCase();
  const allowlist = ROLE_ROUTE_ALLOWLIST[normalized];
  return allowlist?.[0] ?? null;
}
