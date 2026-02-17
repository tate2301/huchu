import { withAuth } from "next-auth/middleware";
import type { NextRequestWithAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import {
  getHostHeaderFromRequestHeaders,
  getPlatformHostContext,
  isAllowedHost,
  isTenantStatusActive,
} from "@/lib/platform/tenant";
import { canAccessCapabilityWithToken, canAccessRouteWithToken } from "@/lib/platform/gating/enforcer";

const ACCESS_BLOCKED_PATH = "/access-blocked";
const LOGIN_PATH = "/login";

type PlatformToken = {
  companyId?: string;
  companySlug?: string;
  tenantStatus?: string;
  enabledFeatures?: string[];
  allowedHosts?: string[];
};

function redirectToAccessBlocked(request: NextRequestWithAuth) {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = ACCESS_BLOCKED_PATH;
  redirectUrl.search = "";
  return NextResponse.redirect(redirectUrl);
}

function denyAccess(request: NextRequestWithAuth, message = "Access blocked") {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: message }, { status: 403 });
  }
  return redirectToAccessBlocked(request);
}

function denyFeature(request: NextRequestWithAuth, decision: { message?: string; featureKey?: string; path?: string }) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: decision.message ?? "Feature disabled for this company.",
        code: "FEATURE_DISABLED",
        feature: decision.featureKey ?? null,
        path: decision.path ?? request.nextUrl.pathname,
      },
      { status: 403 },
    );
  }
  return redirectToAccessBlocked(request);
}

function getRootDomain() {
  return process.env.PLATFORM_ROOT_DOMAIN?.trim().toLowerCase() || null;
}

function redirectToTenantHost(request: NextRequestWithAuth, companySlug: string) {
  const rootDomain = getRootDomain();
  if (!rootDomain) {
    return NextResponse.next();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.hostname = `${companySlug}.${rootDomain}`;
  return NextResponse.redirect(redirectUrl);
}

export default withAuth(
  function middleware(request) {
    const { pathname } = request.nextUrl;
    const isApiRequest = pathname.startsWith("/api/");

    if (pathname === ACCESS_BLOCKED_PATH) {
      return NextResponse.next();
    }

    const hostHeader = getHostHeaderFromRequestHeaders(request.headers);
    const hostContext = getPlatformHostContext(hostHeader);
    const token = request.nextauth.token as PlatformToken | null;
    const normalizedCompanySlug = token?.companySlug?.trim().toLowerCase();

    if (pathname === LOGIN_PATH) {
      if (!hostContext.strictTenantEnforcement) {
        return NextResponse.next();
      }
      if (!hostContext.isCentralHost) {
        return NextResponse.next();
      }
      if (hostContext.isCentralHost && normalizedCompanySlug) {
        return redirectToTenantHost(request, normalizedCompanySlug);
      }
      return redirectToAccessBlocked(request);
    }

    const tenantHostEnforcementDecision = canAccessCapabilityWithToken(
      "core.multitenancy.host-enforcement",
      token?.enabledFeatures,
    );
    const tenantHostEnforcementEnabled = tenantHostEnforcementDecision.allowed;

    if (isApiRequest) {
      if (!token?.companyId) {
        return denyAccess(request, "Missing tenant context");
      }
      if (!isTenantStatusActive(token.tenantStatus)) {
        return denyAccess(request, "Tenant is inactive");
      }
      if (tenantHostEnforcementEnabled && hostContext.strictTenantEnforcement) {
        if (!isAllowedHost(hostHeader, token.allowedHosts)) {
          return denyAccess(request, "Tenant host mismatch");
        }
      }
      const apiFeatureDecision = canAccessRouteWithToken(pathname, token.enabledFeatures);
      if (!apiFeatureDecision.allowed) {
        return denyFeature(request, apiFeatureDecision);
      }
      return NextResponse.next();
    }

    if (tenantHostEnforcementEnabled && hostContext.strictTenantEnforcement && hostContext.isCentralHost && normalizedCompanySlug) {
      return redirectToTenantHost(request, normalizedCompanySlug);
    }

    if (!tenantHostEnforcementEnabled || !hostContext.strictTenantEnforcement) {
      const pageFeatureDecision = canAccessRouteWithToken(pathname, token?.enabledFeatures);
      if (!pageFeatureDecision.allowed) {
        return denyFeature(request, pageFeatureDecision);
      }
      return NextResponse.next();
    }

    if (!token?.companyId) {
      return denyAccess(request, "Missing tenant context");
    }

    if (!isAllowedHost(hostHeader, token.allowedHosts)) {
      return denyAccess(request, "Tenant host mismatch");
    }

    if (!isTenantStatusActive(token.tenantStatus)) {
      return denyAccess(request, "Tenant is inactive");
    }

    const pageFeatureDecision = canAccessRouteWithToken(pathname, token.enabledFeatures);
    if (!pageFeatureDecision.allowed) {
      return denyFeature(request, pageFeatureDecision);
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname;
        if (pathname === LOGIN_PATH || pathname === ACCESS_BLOCKED_PATH) {
          return true;
        }
        return !!token;
      },
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/((?!api/auth|api|_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)",
    "/api/cctv/:path*",
    "/api/gold/:path*",
    "/api/payroll/:path*",
    "/api/compliance/:path*",
  ],
};
