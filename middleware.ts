import { withAuth } from "next-auth/middleware";
import type { NextRequestWithAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import {
  getHostHeaderFromRequestHeaders,
  getPlatformHostContext,
  isAllowedHost,
  isTenantStatusActive,
} from "@/lib/platform/tenant";
import {
  buildPortalHost,
  getPortalHostDescriptorByPath,
  getPortalInternalPathForPublicPath,
  getPortalPublicPathForInternalPath,
} from "@/lib/platform/portal-hosts";
import { canAccessCapabilityWithToken, canAccessRouteWithToken } from "@/lib/platform/gating/enforcer";
import { getAdminRootDomain, isAdminPortalHost, isSuperuserRole } from "@/lib/admin-portal";
import { buildCallbackLoginPath } from "@/lib/auth-core/redirects";
import { isAuthExpired } from "@/lib/auth-core/session-policy";
import { getPosHostForCompany, isCashierRole, isPublicPosPath } from "@/lib/retail/pos-host";

const ACCESS_BLOCKED_PATH = "/access-blocked";
const LOGIN_PATH = "/login";
const MARKETING_BASE_PATH = "/home";
const ADMIN_BASE_PATH = "/admin";
const ADMIN_LOGIN_PATH = `${ADMIN_BASE_PATH}/login`;
const ADMIN_INTERNAL_BASE_PATH = "/portal/admin";
const ADMIN_LOGIN_API_PATH = "/api/platform-admin/login-link";
const PORTAL_BASE_PATHS = ["/portal/parent", "/portal/student", "/portal/teacher", "/portal/pos", "/portal/admin"] as const;
const PUBLIC_ASSET_PATTERN =
  /\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|eot|js|json|webmanifest|txt)$/i;
const PORTAL_HOME_BY_ROLE = {
  PARENT: "/portal/parent",
  STUDENT: "/portal/student",
  TEACHER: "/portal/teacher",
} as const;
const HR_MODULE_ALLOWED_ROLES = new Set(["SUPERADMIN", "MANAGER", "CLERK"]);

type PlatformToken = {
  companyId?: string;
  companySlug?: string;
  tenantStatus?: string;
  enabledFeatures?: string[];
  allowedHosts?: string[];
  role?: string;
  authExpiresAt?: string;
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

function redirectToPathPreserveSearch(request: NextRequestWithAuth, pathname: string) {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = pathname;
  return NextResponse.redirect(redirectUrl);
}

function redirectToLoginWithCallback(request: NextRequestWithAuth, loginPath: string) {
  return NextResponse.redirect(
    new URL(buildCallbackLoginPath(loginPath, `${request.nextUrl.pathname}${request.nextUrl.search}`), request.url),
  );
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

function redirectToPortalHost(request: NextRequestWithAuth, tenantSlug: string, portalPrefix: string) {
  const rootDomain = getRootDomain();
  if (!rootDomain) {
    return NextResponse.next();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.hostname = buildPortalHost(portalPrefix, tenantSlug, rootDomain);
  return NextResponse.redirect(redirectUrl);
}

function toInternalAdminPath(pathname: string) {
  if (pathname === ADMIN_BASE_PATH) {
    return ADMIN_INTERNAL_BASE_PATH;
  }

  if (pathname.startsWith(`${ADMIN_BASE_PATH}/`)) {
    return `${ADMIN_INTERNAL_BASE_PATH}${pathname.slice(ADMIN_BASE_PATH.length)}`;
  }

  return null;
}

function toExternalAdminPath(pathname: string) {
  if (pathname === ADMIN_INTERNAL_BASE_PATH) {
    return ADMIN_BASE_PATH;
  }

  if (pathname.startsWith(`${ADMIN_INTERNAL_BASE_PATH}/`)) {
    return `${ADMIN_BASE_PATH}${pathname.slice(ADMIN_INTERNAL_BASE_PATH.length)}`;
  }

  return null;
}

export default withAuth(
  function middleware(request) {
    const { pathname } = request.nextUrl;
    const isApiRequest = pathname.startsWith("/api/");

    if (PUBLIC_ASSET_PATTERN.test(pathname)) {
      return NextResponse.next();
    }

    if (pathname === ACCESS_BLOCKED_PATH) {
      return NextResponse.next();
    }

    if (isPathWithinRoute(pathname, MARKETING_BASE_PATH)) {
      return NextResponse.next();
    }

    const hostHeader = getHostHeaderFromRequestHeaders(request.headers);
    const requestHost = request.nextUrl.host;
    const resolvedHost = hostHeader || requestHost || null;
    const hostContext = getPlatformHostContext(resolvedHost);
    const isAdminHost = isAdminPortalHost(resolvedHost);
    const rawToken = request.nextauth.token as PlatformToken | null;
    const token = rawToken && !isAuthExpired(rawToken.authExpiresAt) ? rawToken : null;
    const normalizedCompanySlug = token?.companySlug?.trim().toLowerCase();
    const portalBasePath = getPortalBasePathForPathname(pathname);
    const portalHomeForRole = getPortalHomeForRole(token?.role);
    const isAdminExternalPath = isPathWithinRoute(pathname, ADMIN_BASE_PATH);
    const isAdminInternalPath = isPathWithinRoute(pathname, ADMIN_INTERNAL_BASE_PATH);

    if (isAdminExternalPath || isAdminInternalPath || isPathWithinRoute(pathname, "/api/platform-admin")) {
      if (!isAdminHost) {
        const adminRootDomain = getAdminRootDomain();
        return denyAccess(request, `Admin portal is only available on *.${adminRootDomain}`);
      }

      if (token?.role && !isSuperuserRole(token.role)) {
        return denyAccess(request, "Superuser access required");
      }
    }

    if (isAdminHost) {
      if (isApiRequest) {
        if (pathname === ADMIN_LOGIN_API_PATH) {
          return NextResponse.next();
        }
        if (!token) {
          return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
        }
        if (isPathWithinRoute(pathname, "/api/platform-admin")) {
          return NextResponse.next();
        }
        return denyAccess(request, "Only admin APIs are available on this host");
      }

      if (pathname === LOGIN_PATH) {
        return redirectToPath(request, ADMIN_LOGIN_PATH);
      }

      if (pathname === ADMIN_LOGIN_PATH) {
        return NextResponse.next();
      }

      const canonicalAdminPath = toExternalAdminPath(pathname);
      if (canonicalAdminPath) {
        return redirectToPath(request, canonicalAdminPath);
      }

      const internalAdminPath = toInternalAdminPath(pathname);
      if (internalAdminPath) {
        if (!token && pathname !== ADMIN_LOGIN_PATH) {
          return redirectToLoginWithCallback(request, ADMIN_LOGIN_PATH);
        }
        const rewriteUrl = request.nextUrl.clone();
        rewriteUrl.pathname = internalAdminPath;
        return NextResponse.rewrite(rewriteUrl);
      }

      return redirectToPath(request, ADMIN_BASE_PATH);
    }

    if (!isApiRequest && token && isCashierRole(token.role)) {
      const posHost = getPosHostForCompany(token.companySlug, getRootDomain());
      if (posHost && hostContext.hostname !== posHost && !isAdminHost) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.hostname = posHost;
        redirectUrl.pathname = "/";
        redirectUrl.search = "";
        return NextResponse.redirect(redirectUrl);
      }
    }

    if (hostContext.portalPath && !isApiRequest) {
      if (!hostContext.tenantSlug) {
        return redirectToAccessBlocked(request);
      }

      if (hostContext.portalIsAlias && hostContext.portalCanonicalPrefix) {
        return redirectToPortalHost(request, hostContext.tenantSlug, hostContext.portalCanonicalPrefix);
      }

      const portalDescriptor = getPortalHostDescriptorByPath(hostContext.portalPath);
      if (!portalDescriptor) {
        return redirectToAccessBlocked(request);
      }

      const publicPortalPath = getPortalPublicPathForInternalPath(pathname, portalDescriptor);
      if (
        portalDescriptor.key === "pos" &&
        publicPortalPath &&
        isPublicPosPath(publicPortalPath)
      ) {
        return redirectToPathPreserveSearch(request, publicPortalPath);
      }

      if (portalDescriptor.key === "pos" && pathname.startsWith("/portal/pos")) {
        return redirectToPath(request, "/");
      }

      if (portalDescriptor.key === "pos" && !isPublicPosPath(pathname)) {
        return redirectToPath(request, "/");
      }

      if (publicPortalPath) {
        return redirectToPathPreserveSearch(request, publicPortalPath);
      }

      if (!token && pathname !== LOGIN_PATH) {
        return redirectToLoginWithCallback(request, LOGIN_PATH);
      }

      if (token && pathname === LOGIN_PATH) {
        return redirectToPath(request, "/");
      }

      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = getPortalInternalPathForPublicPath(pathname, portalDescriptor);
      return NextResponse.rewrite(rewriteUrl);
    }

    if (!isApiRequest && portalBasePath && !token) {
      const portalLoginPath = `${portalBasePath}/login`;
      if (!isPathWithinRoute(pathname, portalLoginPath)) {
        return redirectToLoginWithCallback(request, portalLoginPath);
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

    if (token && isPathWithinRoute(pathname, "/human-resources")) {
      if (!HR_MODULE_ALLOWED_ROLES.has(token.role ?? "")) {
        return denyAccess(request, "Human resources access is restricted");
      }
    }

    const tenantHostEnforcementDecision = canAccessCapabilityWithToken(
      "core.multitenancy.host-enforcement",
      token?.enabledFeatures,
    );
    const tenantHostEnforcementEnabled = tenantHostEnforcementDecision.allowed;

    if (isApiRequest) {
      // Whitelist internal CCTV endpoints that use GATEWAY_KEY for internal authentication
      if (pathname === "/api/cctv/streams/config") {
        return NextResponse.next();
      }

      if (!token?.companyId) {
        return NextResponse.json(
          { error: "Missing tenant context", code: token ? "MISSING_TENANT_CONTEXT" : "UNAUTHORIZED", path: pathname },
          { status: 401 },
        );
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
        const hostHeader = getHostHeaderFromRequestHeaders(req.headers);
        const resolvedHost = hostHeader || req.nextUrl.host || null;
        const typedToken = token as PlatformToken | null;
        const hostContext = getPlatformHostContext(resolvedHost);

        if (isAdminPortalHost(resolvedHost)) {
          return true;
        }

        if (hostContext.portalPath) {
          return true;
        }

        if (pathname === "/api/cctv/streams/config") {
          return true;
        }

        if (pathname === LOGIN_PATH || pathname === ACCESS_BLOCKED_PATH) {
          return true;
        }

        if (isPathWithinRoute(pathname, MARKETING_BASE_PATH)) {
          return true;
        }

        if (getPortalBasePathForPathname(pathname)) {
          return true;
        }

        if (typedToken && isAuthExpired(typedToken.authExpiresAt)) {
          return false;
        }

        return !!typedToken;
      },
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/((?!api/auth|api|_next/static|_next/image|favicon.ico|manifest.json|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|eot|js|json|webmanifest|txt)).*)",
    "/api/platform-admin/:path*",
    "/api/cctv/:path*",
    "/api/gold/:path*",
    "/api/payroll/:path*",
    "/api/compliance/:path*",
  ],
};
