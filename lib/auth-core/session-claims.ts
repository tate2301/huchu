import {
  getAllowedHostsForCompany,
  getTenantClaimsForCompany,
} from "@/lib/platform/tenant";
import { getEnabledFeatureKeys } from "@/lib/platform/entitlements";
import { getEffectiveFeaturesForUser } from "@/lib/platform/user-entitlements";
import { getSubscriptionHealth } from "@/lib/platform/subscription";
import { buildAuthExpiresAt, resolvePolicyForStrategy } from "@/lib/auth-core/session-policy";
import type { AuthenticatedSession, PlatformJwtClaims } from "@/lib/auth-core/types";

function toTenantStatus(rawStatus: string | undefined, subscriptionActive: boolean): string {
  const normalizedStatus = rawStatus?.trim().toUpperCase();

  if (normalizedStatus && normalizedStatus !== "ACTIVE") {
    return normalizedStatus;
  }

  return subscriptionActive ? "ACTIVE" : "SUBSCRIPTION_INACTIVE";
}

function isLegacyScrapClerkRole(role: string | undefined, enabledFeatures: string[]) {
  if (role?.trim().toUpperCase() !== "CLERK") return false;
  return enabledFeatures.some((feature) =>
    feature.trim().toLowerCase().startsWith("scrap-metal."),
  );
}

export function buildInitialTokenClaims(input: {
  id: string;
  role?: string;
  companyId?: string;
  authStrategy?: "credentials" | "admin-email-link" | "email-link" | "otp";
  rememberMe?: boolean;
}): PlatformJwtClaims {
  const sessionPolicy = resolvePolicyForStrategy(input.authStrategy, input.rememberMe === true);

  return {
    id: input.id,
    ...(input.role ? { role: input.role } : {}),
    ...(input.companyId ? { companyId: input.companyId } : {}),
    ...(input.authStrategy ? { authStrategy: input.authStrategy } : {}),
    sessionPolicy,
    rememberMe: sessionPolicy === "remember",
    authExpiresAt: buildAuthExpiresAt(sessionPolicy),
  };
}

export async function enrichTokenClaims(token: PlatformJwtClaims): Promise<PlatformJwtClaims> {
  if (!token.companyId) {
    return token;
  }

  const tenantClaims = await getTenantClaimsForCompany(token.companyId);
  const [subscriptionHealth, enabledFeatures, allowedHosts] = await Promise.all([
    getSubscriptionHealth(token.companyId),
    token.id && token.role
      ? getEffectiveFeaturesForUser({
          companyId: token.companyId,
          userId: token.id,
          role: token.role,
        })
      : getEnabledFeatureKeys(token.companyId),
    getAllowedHostsForCompany(token.companyId),
  ]);
  const subscriptionActive = !subscriptionHealth.shouldBlock;

  token.companySlug = tenantClaims.companySlug;
  token.tenantStatus = toTenantStatus(tenantClaims.tenantStatus, subscriptionActive);
  token.workspaceProfile = tenantClaims.workspaceProfile;
  if (isLegacyScrapClerkRole(token.role, enabledFeatures)) {
    token.role = "OPERATOR";
  }
  token.subscriptionHealth = subscriptionHealth.state;
  token.enabledFeatures = enabledFeatures;
  token.allowedHosts = allowedHosts;

  return token;
}

export function applyTokenToSessionClaims(
  session: AuthenticatedSession,
  token: PlatformJwtClaims,
): AuthenticatedSession {
  session.user = {
    ...session.user,
    id: token.id ?? session.user.id,
    role: token.role ?? session.user.role,
    companyId: token.companyId ?? session.user.companyId,
    authStrategy: token.authStrategy,
    sessionPolicy: token.sessionPolicy,
    authExpiresAt: token.authExpiresAt,
    rememberMe: token.rememberMe,
    companySlug: token.companySlug,
    tenantStatus: token.tenantStatus,
    workspaceProfile: token.workspaceProfile,
    enabledFeatures: token.enabledFeatures,
    subscriptionHealth: token.subscriptionHealth,
    allowedHosts: token.allowedHosts,
  };

  return session;
}
