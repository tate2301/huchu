import { getAuthRuntimeConfig } from "@/lib/auth-core/config";

const DEFAULT_ADMIN_ROOT_DOMAIN = "admin.pagka.dev";
const DEFAULT_ADMIN_PORTAL_HOST = "portal.admin.pagka.dev";

function normalizeHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .split(":")[0];
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

/**
 * Get the admin root domain from environment or default to "admin.pagka.dev"
 */
export function getAdminRootDomain(): string {
  return (
    process.env.ADMIN_ROOT_DOMAIN?.trim().toLowerCase() || DEFAULT_ADMIN_ROOT_DOMAIN
  );
}

export function getAdminPortalHost(): string {
  const configured = process.env.ADMIN_PORTAL_HOST ? normalizeHost(process.env.ADMIN_PORTAL_HOST) : "";
  if (configured) {
    return configured;
  }

  const rootDomain = getAdminRootDomain();
  if (!rootDomain || rootDomain === DEFAULT_ADMIN_ROOT_DOMAIN) {
    return DEFAULT_ADMIN_PORTAL_HOST;
  }

  return `portal.${rootDomain}`;
}

export const ADMIN_PORTAL_HOST = getAdminPortalHost();

/**
 * Check if a host is an admin portal host.
 * Supports both the primary admin portal host and wildcard subdomains (*.admin.pagka.dev)
 */
export function isAdminPortalHost(host: string | null | undefined): boolean {
  if (!host) return false;

  const normalized = host.trim().toLowerCase().split(":")[0];
  const adminPortalHost = getAdminPortalHost();

  // Check exact match for primary admin portal host
  if (normalized === adminPortalHost) {
    return true;
  }

  // Check if host ends with admin root domain (supports *.admin.pagka.dev)
  const adminRootDomain = getAdminRootDomain();
  const suffix = `.${adminRootDomain}`;

  // Match both the root domain and any subdomain
  if (normalized === adminRootDomain || normalized.endsWith(suffix)) {
    return true;
  }

  // Allow localhost development without requiring custom DNS mappings.
  if (process.env.NODE_ENV !== "production" && isLoopbackHost(normalized)) {
    return true;
  }

  return false;
}

/**
 * The platform superuser is an identity, not a role.
 *
 * SUPERADMIN is also the role every tenant's owner holds —
 * `provisionTenant` creates the first admin with it, and self-serve signup
 * hands it to whoever signs up. Only the host kept those owners out of the
 * admin portal, and in development `isAdminPortalHost` is true for localhost,
 * so a signed-up workspace owner on localhost opened /admin/dashboard and
 * read every tenant's companies, commercials and metrics.
 *
 * So the role alone proves nothing. The session's email has to be on the same
 * allow-list the admin magic-link provider signs in against
 * (ADMIN_PORTAL_ALLOWED_EMAILS / ADMIN_PORTAL_EMAIL), read on every request so
 * taking an address off the list takes effect without waiting for its token to
 * expire.
 */
export function isPlatformSuperuser(
  identity: { role?: string | null; email?: string | null } | null | undefined,
): boolean {
  const role = identity?.role?.trim().toUpperCase();
  const email = identity?.email?.trim().toLowerCase();
  if (role !== "SUPERADMIN" || !email) return false;
  return getAuthRuntimeConfig().adminPortalAllowedEmails.includes(email);
}
