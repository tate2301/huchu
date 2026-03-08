export const ADMIN_PORTAL_HOST = "portal.admin.pagka.dev";

export function isAdminPortalHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const normalized = host.trim().toLowerCase().split(":")[0];
  return normalized === ADMIN_PORTAL_HOST;
}

export function isSuperuserRole(role: string | null | undefined): boolean {
  if (!role) return false;
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERADMIN";
}
