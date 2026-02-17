// API utility functions for production-ready endpoints
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { Session } from 'next-auth';
import { canAccessRouteWithToken } from "@/lib/platform/gating/enforcer";
import { canAccessRouteForCompany } from "@/lib/platform/gating/enforcer-server";
import {
  getHostHeaderFromRequestHeaders,
  getPlatformHostContext,
  getTenantClaimsForCompany,
  isTenantStatusActive,
} from "@/lib/platform/tenant";

export interface AuthenticatedSession extends Session {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    companyId: string;
    companySlug?: string;
    tenantStatus?: string;
    subscriptionHealth?: string;
    enabledFeatures?: string[];
  };
}

/**
 * Validates user session and returns it or sends 401 response
 */
export async function validateSession(
  request: NextRequest
): Promise<{ session: AuthenticatedSession } | NextResponse> {
  const session = (await getServerSession(authOptions)) as AuthenticatedSession | null;
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!session.user.companyId) {
    return NextResponse.json({ error: "Missing tenant context" }, { status: 401 });
  }

  let tenantStatus = session.user.tenantStatus?.trim();
  if (!tenantStatus) {
    const claims = await getTenantClaimsForCompany(session.user.companyId);
    tenantStatus = claims.tenantStatus?.trim();
  }
  if (!isTenantStatusActive(tenantStatus)) {
    return NextResponse.json(
      {
        error: "Tenant is inactive",
        code: "TENANT_INACTIVE",
        tenantStatus: tenantStatus ?? null,
      },
      { status: 403 },
    );
  }

  const hostHeader = getHostHeaderFromRequestHeaders(request.headers);
  const hostContext = getPlatformHostContext(hostHeader);
  if (hostContext.strictTenantEnforcement) {
    if (!hostContext.isTenantHost || !hostContext.tenantSlug) {
      return NextResponse.json(
        {
          error: "Tenant host required",
          code: "TENANT_HOST_REQUIRED",
        },
        { status: 403 },
      );
    }

    const sessionCompanySlug = session.user.companySlug?.trim().toLowerCase();
    if (!sessionCompanySlug || sessionCompanySlug !== hostContext.tenantSlug) {
      return NextResponse.json(
        {
          error: "Tenant host mismatch",
          code: "TENANT_HOST_MISMATCH",
          expectedTenant: sessionCompanySlug ?? null,
          receivedTenant: hostContext.tenantSlug,
        },
        { status: 403 },
      );
    }
  }

  const pathname = new URL(request.url).pathname;
  let decision = canAccessRouteWithToken(pathname, session.user.enabledFeatures);
  if (!decision.allowed && (!session.user.enabledFeatures || session.user.enabledFeatures.length === 0)) {
    decision = await canAccessRouteForCompany(session.user.companyId, pathname);
  }
  if (!decision.allowed) {
    return NextResponse.json(
      {
        error: decision.message ?? "Feature disabled for this company.",
        code: decision.code ?? "FEATURE_DISABLED",
        feature: decision.featureKey ?? null,
        path: pathname,
      },
      { status: decision.code === "UNAUTHORIZED" ? 401 : 403 },
    );
  }
  
  return { session };
}

/**
 * Validates if user has required role
 */
export function hasRole(session: AuthenticatedSession, allowedRoles: string[]): boolean {
  return allowedRoles.includes(session.user.role);
}

/**
 * Standard error response for API
 */
export function errorResponse(
  message: string,
  status: number = 500,
  details?: unknown,
) {
  return NextResponse.json(
    {
      error: message,
      ...(details !== undefined ? { details } : {}),
    },
    { status }
  );
}

/**
 * Standard success response for API
 */
export function successResponse<T>(data: T, status: number = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Parse pagination params from request
 */
export function getPaginationParams(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));
  const skip = (page - 1) * limit;
  
  return { page, limit, skip };
}

/**
 * Format pagination response
 */
export function paginationResponse<T>(data: T[], total: number, page: number, limit: number) {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  };
}

/**
 * Validates UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Sanitize input string
 */
export function sanitizeString(input: string, maxLength: number = 500): string {
  return input.trim().substring(0, maxLength);
}
