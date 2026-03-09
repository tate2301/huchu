import { withAuth } from "next-auth/middleware";
import type { NextRequestWithAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import {
  getHostHeaderFromRequestHeaders,
  getPlatformHostContext,
  isAllowedHost,
  isTenantStatusActive,
  PORTAL_SUBDOMAIN_MAP,
} from "@/lib/platform/tenant";
import { canAccessCapabilityWithToken, canAccessRouteWithToken } from "@/lib/platform/gating/enforcer";
import { ADMIN_PORTAL_HOST, isAdminPortalHost, isSuperuserRole } from "@/lib/admin-portal";

const ACCESS_BLOCKED_PATH = "/access-blocked";
const LOGIN_PATH = "/login";
const PORTAL_BASE_PATHS = ["/portal/parent", "/portal/student", "/portal/teacher", "/portal/pos", "/portal/admin"] as const;
const PORTAL_HOME_BY_ROLE = {
  PARENT: "/portal/parent",
  STUDENT: "/portal/student",
  TEACHER: "/portal/teacher",
} as const;

type PlatformToken = {
  companyId?: string;
  companySlug?: string;
  tenantStatus?: string;
  enabledFeatures?: string[];
  allowedHosts?: string[];
  role?: string;
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

function isPathWithinRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function getPortalBasePathForPathname(pathname: string) {
  return PORTAL_BASE_PATHS.find((portalPath) => isPathWithinRoute(pathname, portalPath)) ?? null;
}

function getPortalHomeForRole(role: string | undefined | null) {
  if (!role) {
    return null;
  }

  if (role === "PARENT" || role === "STUDENT" || role === "TEACHER") {
    return PORTAL_HOME_BY_ROLE[role as keyof typeof PORTAL_HOME_BY_ROLE];
  }

  return null;
}

function redirectToPath(request: NextRequestWithAuth, pathname: string) {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = pathname;
  redirectUrl.search = "";
  return NextResponse.redirect(redirectUrl);
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
    const isAdminHost = isAdminPortalHost(hostHeader);
    const token = request.nextauth.token as PlatformToken | null;
    const normalizedCompanySlug = token?.companySlug?.trim().toLowerCase();
    const portalBasePath = getPortalBasePathForPathname(pathname);
    const portalHomeForRole = getPortalHomeForRole(token?.role);

    if (isPathWithinRoute(pathname, "/portal/admin") || isPathWithinRoute(pathname, "/api/platform-admin")) {
      if (!isAdminHost) {
        return denyAccess(request, `Admin portal is only available on ${ADMIN_PORTAL_HOST}`);
      }

      if (token?.role && !isSuperuserRole(token.role)) {
        return denyAccess(request, "Superuser access required");
      }
    }

    if (isAdminHost && !isApiRequest) {
      if (pathname === LOGIN_PATH) {
        const rewriteUrl = request.nextUrl.clone();
        rewriteUrl.pathname = "/portal/admin/login";
        return NextResponse.rewrite(rewriteUrl);
      }

      if (pathname === "/") {
        const rewriteUrl = request.nextUrl.clone();
        rewriteUrl.pathname = "/portal/admin";
        return NextResponse.rewrite(rewriteUrl);
      }
    }

    if (!isApiRequest && portalBasePath && !token) {
      const portalLoginPath = `${portalBasePath}/login`;
      if (!isPathWithinRoute(pathname, portalLoginPath)) {
        return redirectToPath(request, portalLoginPath);
      }
    }

    if (!isApiRequest && portalHomeForRole) {
      const ownPortalLoginPath = `${portalHomeForRole}/login`;

      if (isPathWithinRoute(pathname, ownPortalLoginPath)) {
        return redirectToPath(request, portalHomeForRole);
      }

      if (!isPathWithinRoute(pathname, portalHomeForRole)) {
        return redirectToPath(request, portalHomeForRole);
      }
    }

    if (!isApiRequest && portalBasePath && pathname === `${portalBasePath}/login`) {
      return NextResponse.next();
    }

    if (hostContext.portalSubdomain && !isApiRequest) {
      const portalPath = PORTAL_SUBDOMAIN_MAP[hostContext.portalSubdomain];
      if (portalPath) {
        if (pathname === LOGIN_PATH) {
          const rewriteUrl = request.nextUrl.clone();
          rewriteUrl.pathname = portalPath + "/login";
          return NextResponse.rewrite(rewriteUrl);
        }
        if (pathname !== portalPath && !pathname.startsWith(portalPath + "/")) {
          const rewriteUrl = request.nextUrl.clone();
          rewriteUrl.pathname = portalPath;
          return NextResponse.rewrite(rewriteUrl);
        }
      }
    }

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

        if (getPortalBasePathForPathname(pathname)) {
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
    "/api/platform-admin/:path*",
    "/api/cctv/:path*",
    "/api/gold/:path*",
    "/api/payroll/:path*",
    "/api/compliance/:path*",
  ],
};
