import {
  getPlatformHostContext,
  isTenantStatusActive,
  resolveTenantFromHost,
  type PlatformHostContext,
} from "@/lib/platform/tenant";

/**
 * Which company a sign-in on this host may reach.
 *
 * Under strict tenant enforcement a person signs in on their workspace's own
 * host, never the central one, and only accounts in that workspace can sign in
 * there. Without enforcement (local development on localhost) any account may.
 *
 * Shared by every way of signing in — password, emailed code, signup handoff —
 * and by the endpoint that sends sign-in codes, so they cannot drift apart on
 * who is allowed where.
 */
export type SignInScope =
  | { ok: true; companyId: string | undefined; hostContext: PlatformHostContext }
  | { ok: false; reason: "TENANT_HOST_REQUIRED" | "TENANT_NOT_FOUND" | "TENANT_INACTIVE"; companyId?: string };

export async function resolveSignInScope(hostHeader: string | null | undefined): Promise<SignInScope> {
  const hostContext = getPlatformHostContext(hostHeader);
  if (!hostContext.strictTenantEnforcement) {
    return { ok: true, companyId: undefined, hostContext };
  }

  if (hostContext.isCentralHost) return { ok: false, reason: "TENANT_HOST_REQUIRED" };

  const tenant = await resolveTenantFromHost(hostHeader);
  if (!tenant) return { ok: false, reason: "TENANT_NOT_FOUND" };
  if (!isTenantStatusActive(tenant.tenantStatus)) {
    return { ok: false, reason: "TENANT_INACTIVE", companyId: tenant.companyId };
  }

  return { ok: true, companyId: tenant.companyId, hostContext };
}
