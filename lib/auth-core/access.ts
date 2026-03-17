import { canAccessRouteWithToken } from "@/lib/platform/gating/enforcer";
import { canAccessRouteForCompany } from "@/lib/platform/gating/enforcer-server";
import {
  getHostHeaderFromRequestHeaders,
  getPlatformHostContext,
  getTenantClaimsForCompany,
  isAllowedHost,
  isTenantStatusActive,
} from "@/lib/platform/tenant";
import { isAdminPortalHost, isSuperuserRole } from "@/lib/admin-portal";
import { isAuthExpired } from "@/lib/auth-core/session-policy";
import type { AuthGuardResult, AuthenticatedSession } from "@/lib/auth-core/types";

type ResolveAccessContextOptions = {
  session: AuthenticatedSession | null;
  pathname?: string;
  hostHeader?: string | null;
  requireAdmin?: boolean;
  requireTenantContext?: boolean;
  enforceRouteFeatureCheck?: boolean;
  enforceTenantHost?: boolean;
};

export async function resolveAccessContext(options: ResolveAccessContextOptions): Promise<AuthGuardResult> {
  const {
    session,
    pathname,
    hostHeader,
    requireAdmin = false,
    requireTenantContext = true,
    enforceRouteFeatureCheck = true,
    enforceTenantHost = true,
  } = options;

  if (!session?.user) {
    return {
      ok: false,
      reason: "UNAUTHORIZED",
      status: 401,
      message: "Unauthorized",
      path: pathname,
    };
  }

  if (isAuthExpired(session.user.authExpiresAt)) {
    return {
      ok: false,
      reason: "AUTH_EXPIRED",
      status: 401,
      message: "Authentication expired",
      path: pathname,
    };
  }

  if (requireAdmin) {
    if (!isAdminPortalHost(hostHeader)) {
      return {
        ok: false,
        reason: "ADMIN_HOST_REQUIRED",
        status: 403,
        message: "Admin portal host required",
        path: pathname,
      };
    }

    if (!isSuperuserRole(session.user.role)) {
      return {
        ok: false,
        reason: "SUPERUSER_REQUIRED",
        status: 403,
        message: "Superuser access required",
        path: pathname,
      };
    }
  }

  if (requireTenantContext && !session.user.companyId) {
    return {
      ok: false,
      reason: "MISSING_TENANT_CONTEXT",
      status: 401,
      message: "Missing tenant context",
      path: pathname,
    };
  }

  if (session.user.companyId) {
    let tenantStatus = session.user.tenantStatus?.trim();
    if (!tenantStatus) {
      const claims = await getTenantClaimsForCompany(session.user.companyId);
      tenantStatus = claims.tenantStatus?.trim();
    }

    if (!isTenantStatusActive(tenantStatus)) {
      return {
        ok: false,
        reason: "TENANT_INACTIVE",
        status: 403,
        message: "Tenant is inactive",
        path: pathname,
      };
    }

    if (enforceTenantHost) {
      const hostContext = getPlatformHostContext(hostHeader);
      if (hostContext.strictTenantEnforcement && !isAllowedHost(hostHeader, session.user.allowedHosts)) {
        return {
          ok: false,
          reason: "TENANT_HOST_MISMATCH",
          status: 403,
          message: "Tenant host mismatch",
          path: pathname,
        };
      }
    }

    if (pathname && enforceRouteFeatureCheck) {
      let decision = canAccessRouteWithToken(pathname, session.user.enabledFeatures);
      if (!decision.allowed && (!session.user.enabledFeatures || session.user.enabledFeatures.length === 0)) {
        decision = await canAccessRouteForCompany(session.user.companyId, pathname);
      }

      if (!decision.allowed) {
        return {
          ok: false,
          reason: "FEATURE_DISABLED",
          status: decision.code === "UNAUTHORIZED" ? 401 : 403,
          message: decision.message ?? "Feature disabled for this company.",
          featureKey: decision.featureKey,
          path: pathname,
        };
      }
    }
  }

  return {
    ok: true,
    session,
    pathname,
    hostHeader,
  };
}

export function resolveHostHeaderFromRequest(
  headersLike: Headers | Record<string, string | string[] | undefined | null> | null | undefined,
): string | null {
  return getHostHeaderFromRequestHeaders(headersLike);
}
