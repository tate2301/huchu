import { requirePageAuth } from "../auth-core/guards";

export async function requireAdminPortalSession() {
  return requirePageAuth({
    requireAdmin: true,
    loginPath: "/admin/login",
    accessBlockedPath: "/access-blocked",
    requireTenantContext: false,
    enforceRouteFeatureCheck: false,
    enforceTenantHost: false,
  });
}
