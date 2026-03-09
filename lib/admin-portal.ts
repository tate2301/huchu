export const ADMIN_PORTAL_HOST = "portal.admin.pagka.dev";

/**
 * Get the admin root domain from environment or default to "admin.pagka.dev"
 */
export function getAdminRootDomain(): string {
  return process.env.ADMIN_ROOT_DOMAIN?.trim().toLowerCase() || "admin.pagka.dev";
}

/**
 * Check if a host is an admin portal host.
 * Supports both the primary admin portal host and wildcard subdomains (*.admin.pagka.dev)
 */
export function isAdminPortalHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const normalized = host.trim().toLowerCase().split(":")[0];

  // Check exact match for primary admin portal host
  if (normalized === ADMIN_PORTAL_HOST) {
    return true;
  }

  // Check if host ends with admin root domain (supports *.admin.pagka.dev)
  const adminRootDomain = getAdminRootDomain();
  const suffix = `.${adminRootDomain}`;

  // Match both the root domain and any subdomain
  return normalized === adminRootDomain || normalized.endsWith(suffix);
}

export function isSuperuserRole(role: string | null | undefined): boolean {
  if (!role) return false;
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERADMIN";
}
