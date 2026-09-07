// Lean API guard — the static-import-light twin of requireApiAuth.
//
// Contract: for any request, this returns exactly what
// guards.ts#requireApiAuth returns — same success shape, same denial bodies,
// same reason codes in the same precedence order, same audit events. What
// changes is the import graph: requireApiAuth statically imports lib/auth.ts
// (and through it prisma, the adapter and the strategy registry) into all ~545
// API routes that call validateSession. This module reads the JWT directly and
// keeps every database-backed fallback behind a dynamic import, so the static
// closure stops at the claims helpers.
//
// The token's authorization claims are re-enriched from the database on every
// read (token-session.ts), matching the old jwt-callback behavior, so the
// checks below run against fresh values. The delegation fallbacks to the
// unchanged resolveAccessContext remain as belt-and-braces for any token an
// enrichment edge case leaves without a claim.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getTokenAuthSession } from "./token-session";
import { isRouteAllowedForRole } from "./role-routes";
import {
  getHostHeaderFromRequestHeaders,
  getPlatformHostContext,
  isAllowedHost,
  isTenantStatusActive,
} from "../tenant";
import { canAccessRouteWithToken } from "../gating/enforcer";
import { isAdminPortalHost, isSuperuserRole } from "../admin-portal";
import type {
  AuthenticatedSession,
  AuthFailureReason,
} from "./types";

type ApiAuthOptions = {
  request: Request;
  requireAdmin?: boolean;
  requireTenantContext?: boolean;
  enforceRouteFeatureCheck?: boolean;
  enforceTenantHost?: boolean;
};

type Denial = {
  reason: AuthFailureReason;
  status: 401 | 403 | 429;
  message: string;
  featureKey?: string;
};

async function deny(
  session: AuthenticatedSession | null,
  pathname: string,
  hostHeader: string | null,
  denial: Denial,
) {
  // Audit logging is a hardening feature (docs/audits/auth-system-audit-2026-03):
  // every guard denial is recorded. Dynamically imported — the logger reaches
  // prisma — so the denial path pays for it, not the module graph.
  const { logAuthEvent } = await import("./events");
  await logAuthEvent({
    eventType: "auth.guard.denied",
    actor: session?.user?.email ?? null,
    companyId: session?.user?.companyId ?? null,
    reason: denial.reason,
    entityType: "api",
    entityId: pathname,
    payload: {
      hostHeader,
      status: denial.status,
      featureKey: denial.featureKey ?? null,
    },
  });

  return NextResponse.json(
    {
      error: denial.message,
      code: denial.reason,
      feature: denial.featureKey ?? null,
      path: pathname,
    },
    { status: denial.status },
  );
}

/**
 * Delegate the whole decision to the unchanged guards.ts path. Used whenever
 * the token lacks a claim the checks need, so degraded/stale tokens behave
 * exactly as they always have (including their DB lookups).
 */
async function delegateToFullGuard(options: ApiAuthOptions) {
  const { requireApiAuth } = await import("./guards");
  return requireApiAuth(options);
}

export async function requireApiAuthLean(
  options: ApiAuthOptions,
): Promise<{ session: AuthenticatedSession } | NextResponse> {
  const {
    request,
    requireAdmin = false,
    requireTenantContext = !requireAdmin,
    enforceRouteFeatureCheck = !requireAdmin,
    enforceTenantHost = !requireAdmin,
  } = options;

  const session = await getTokenAuthSession(request as NextRequest);
  const pathname = new URL(request.url).pathname;
  const hostHeader = getHostHeaderFromRequestHeaders(request.headers);

  // UNAUTHORIZED / AUTH_EXPIRED: getTokenAuthSession returns null for both an
  // absent token and an auth-expired one — exactly the two cases where
  // resolveAccessContext answers 401. The old path's session callback also
  // yields no user for a decode-rejected token, so the observable result
  // (401 UNAUTHORIZED) matches.
  if (!session?.user) {
    return deny(session, pathname, hostHeader, {
      reason: "UNAUTHORIZED",
      status: 401,
      message: "Unauthorized",
    });
  }

  if (requireAdmin) {
    if (!isAdminPortalHost(hostHeader)) {
      return deny(session, pathname, hostHeader, {
        reason: "ADMIN_HOST_REQUIRED",
        status: 403,
        message: "Admin portal host required",
      });
    }

    if (!isSuperuserRole(session.user.role)) {
      return deny(session, pathname, hostHeader, {
        reason: "SUPERUSER_REQUIRED",
        status: 403,
        message: "Superuser access required",
      });
    }
  }

  if (requireTenantContext && !session.user.companyId) {
    return deny(session, pathname, hostHeader, {
      reason: "MISSING_TENANT_CONTEXT",
      status: 401,
      message: "Missing tenant context",
    });
  }

  if (session.user.companyId) {
    // TENANT_INACTIVE — claims-first; blank claim means the token predates the
    // claim enrichment, so the full guard (with its DB lookup) decides.
    const tenantStatus = session.user.tenantStatus?.trim();
    if (!tenantStatus) {
      return delegateToFullGuard(options);
    }
    if (!isTenantStatusActive(tenantStatus)) {
      return deny(session, pathname, hostHeader, {
        reason: "TENANT_INACTIVE",
        status: 403,
        message: "Tenant is inactive",
      });
    }

    // TENANT_HOST_MISMATCH — a failed claims check falls back to the full
    // guard, which re-checks against the database before denying.
    if (enforceTenantHost) {
      const hostContext = getPlatformHostContext(hostHeader);
      if (hostContext.strictTenantEnforcement) {
        if (!isAllowedHost(hostHeader, session.user.allowedHosts)) {
          return delegateToFullGuard(options);
        }
      }
    }

    // ROLE_ROUTE_RESTRICTED — pure claims, same order as resolveAccessContext
    // (before the feature check, independent of it).
    if (pathname && !isRouteAllowedForRole(session.user.role, pathname)) {
      return deny(session, pathname, hostHeader, {
        reason: "ROLE_ROUTE_RESTRICTED",
        status: 403,
        message: "This area is not available for your role.",
      });
    }

    // FEATURE_DISABLED — the route-registry resolver is the API-level
    // enforcement point (docs/platform-pricing-feature-flags-and-modules.md).
    // A denial with no feature claims on the token delegates to the full
    // guard, which consults the company's entitlements in the database.
    if (pathname && enforceRouteFeatureCheck) {
      const decision = canAccessRouteWithToken(pathname, session.user.enabledFeatures);
      if (!decision.allowed) {
        if (!session.user.enabledFeatures || session.user.enabledFeatures.length === 0) {
          return delegateToFullGuard(options);
        }
        return deny(session, pathname, hostHeader, {
          reason: "FEATURE_DISABLED",
          status: decision.code === "UNAUTHORIZED" ? 401 : 403,
          message: decision.message ?? "Feature disabled for this company.",
          featureKey: decision.featureKey,
        });
      }
    }
  }

  return { session };
}
