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
  PREVIEW_HOST_COOKIE,
  PREVIEW_HOST_PARAM,
  PREVIEW_HOST_PATH,
  isHostEnforcementBypassed,
  isPreviewHostOverrideEnabled,
  readPreviewHostIntentFromUrl,
  stripPreviewHostParams,
} from "@/lib/platform/preview-host";
import {
  buildPortalHost,
  getPortalHostDescriptorByPath,
  getPortalInternalPathForPublicPath,
  getPortalPublicPathForInternalPath,
  getPortalHostPrefixes,
} from "@/lib/platform/portal-hosts";
import { canAccessCapabilityWithToken, canAccessRouteWithToken } from "@/lib/platform/gating/enforcer";
import { getAdminRootDomain, isAdminPortalHost, isSuperuserRole } from "@/lib/admin-portal";
import { buildCallbackLoginPath } from "@/lib/auth-core/redirects";
import { isAuthExpired } from "@/lib/auth-core/session-policy";
import {
  isRoleRouteRestricted,
  isRouteAllowedForRole,
  landingPathForRole,
} from "@/lib/auth-core/role-routes";
import { getPosHostForCompany, isCashierRole, isPublicPosPath } from "@/lib/retail/pos-host";
import { PUBLIC_BASE_PATHS } from "@/lib/public-routes";

const ACCESS_BLOCKED_PATH = "/access-blocked";
const LOGIN_PATH = "/login";
const MARKETING_BASE_PATH = "/home";
// Shared with the app shell, which has to make the same call about whether to
// draw authenticated chrome. See lib/public-routes.
const CRM_PUBLIC_BASE_PATHS = PUBLIC_BASE_PATHS;
const ADMIN_BASE_PATH = "/admin";
const ADMIN_LOGIN_PATH = `${ADMIN_BASE_PATH}/login`;
const ADMIN_INTERNAL_BASE_PATH = "/portal/admin";
const ADMIN_LOGIN_API_PATH = "/api/platform-admin/login-link";
const PORTAL_BASE_PATHS = ["/portal/parent", "/portal/student", "/portal/teacher", "/portal/pos", "/portal/admin"] as const;
// `.xml` covers /sitemap.xml — without it the proxy redirects crawlers to the
// admin host and the sitemap is unreachable.
const PUBLIC_ASSET_PATTERN =
  /\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|eot|js|json|webmanifest|txt|xml)$/i;
const PORTAL_HOME_BY_ROLE = {
  PARENT: "/portal/parent",
  STUDENT: "/portal/student",
  TEACHER: "/portal/teacher",
  POS_CASHIER: "/portal/pos",
  CASHIER: "/portal/pos",
} as const;
// Mirrors WORKFORCE_MODULE_ALLOWED_ROLES in `lib/navigation.ts`. Checked on the
// prefix here so a school teacher signing into a tenant that also runs payroll
// cannot reach the salary bill by typing the URL.
const WORKFORCE_MODULE_ALLOWED_ROLES = new Set(["SUPERADMIN", "MANAGER", "CLERK"]);
const SCRAP_LOTS_ONLY_ROLES = new Set(["OPERATOR", "CLERK"]);
const SCRAP_OPERATOR_RESTRICTED_PATHS = ["/scrap-metal/purchases/unassigned", "/scrap-metal/adjustments"] as const;

type PlatformToken = {
  companyId?: string;
  companySlug?: string;
  tenantStatus?: string;
  enabledFeatures?: string[];
  allowedHosts?: string[];
  role?: string;
  authExpiresAt?: string;
};

function getResolvedAllowedHosts(token: PlatformToken | null, rootDomain: string | null): string[] | undefined {
  if (!token) {
    return undefined;
  }

  const allowedHosts = new Set((token.allowedHosts ?? []).map((host) => host.trim().toLowerCase()).filter(Boolean));
  const companySlug = token.companySlug?.trim().toLowerCase();

  if (rootDomain && companySlug) {
    allowedHosts.add(`${companySlug}.${rootDomain}`);
    for (const prefix of getPortalHostPrefixes({ includeAliases: true })) {
      allowedHosts.add(buildPortalHost(prefix, companySlug, rootDomain));
    }
  }

  return allowedHosts.size > 0 ? Array.from(allowedHosts) : undefined;
}

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

  if (
    role === "PARENT" ||
    role === "STUDENT" ||
    role === "TEACHER" ||
    role === "POS_CASHIER" ||
    role === "CASHIER"
  ) {
    return PORTAL_HOME_BY_ROLE[role as keyof typeof PORTAL_HOME_BY_ROLE];
  }

  return null;
}

function isScrapLotsOnlyRole(role: string | undefined | null) {
  return SCRAP_LOTS_ONLY_ROLES.has(role ?? "");
}

function isScrapOperatorRestrictedPath(pathname: string) {
  return SCRAP_OPERATOR_RESTRICTED_PATHS.some((path) => isPathWithinRoute(pathname, path));
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

/**
 * Send the browser to another host.
 *
 * On a preview deployment that host does not resolve — `pos.floorcode.example.com`
 * has no DNS pointing at a `*.vercel.app` build — so instead of moving the
 * browser we stay on the origin it can reach and nominate the target host
 * through the override parameter. The next pass through the proxy turns that
 * into a cookie, and from there the request is treated as though it arrived on
 * the target host, which is the whole point.
 *
 * With the escape hatch on but the override off there is nowhere safe to send
 * anyone, so the redirect is dropped and the caller carries on where it is.
 */
function redirectAcrossHost(targetHostname: string, redirectUrl: URL) {
  if (isPreviewHostOverrideEnabled()) {
    redirectUrl.searchParams.set(PREVIEW_HOST_PARAM, targetHostname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isHostEnforcementBypassed()) {
    return NextResponse.next();
  }

  redirectUrl.hostname = targetHostname;
  return NextResponse.redirect(redirectUrl);
}

function redirectToTenantHost(request: NextRequestWithAuth, companySlug: string) {
  const rootDomain = getRootDomain();
  if (!rootDomain) {
    return NextResponse.next();
  }

  return redirectAcrossHost(`${companySlug}.${rootDomain}`, request.nextUrl.clone());
}

function redirectToPortalHost(request: NextRequestWithAuth, tenantSlug: string, portalPrefix: string) {
  const rootDomain = getRootDomain();
  if (!rootDomain) {
    return NextResponse.next();
  }

  return redirectAcrossHost(
    buildPortalHost(portalPrefix, tenantSlug, rootDomain),
    request.nextUrl.clone(),
  );
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
  async function proxy(request) {
    const { pathname } = request.nextUrl;
    const isApiRequest = pathname.startsWith("/api/");

    // Before anything else, including the access-blocked page: nominating a
    // host has to work from wherever you are stuck, and the parameter is how
    // you get unstuck. Turning it into a cookie here keeps it out of the page,
    // out of any callbackUrl and out of anything anyone copies from the address
    // bar.
    const previewIntent = readPreviewHostIntentFromUrl(request.nextUrl);
    if (previewIntent.kind !== "absent") {
      if (previewIntent.kind === "invalid") {
        const controlUrl = request.nextUrl.clone();
        controlUrl.pathname = PREVIEW_HOST_PATH;
        controlUrl.search = "";
        controlUrl.searchParams.set("invalid", previewIntent.value);
        return NextResponse.redirect(controlUrl);
      }

      const cleanUrl = request.nextUrl.clone();
      stripPreviewHostParams(cleanUrl);
      const response = NextResponse.redirect(cleanUrl);

      if (previewIntent.kind === "set") {
        response.cookies.set(PREVIEW_HOST_COOKIE, previewIntent.host, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          secure: request.nextUrl.protocol === "https:",
        });
      } else {
        response.cookies.delete(PREVIEW_HOST_COOKIE);
      }

      return response;
    }

    // The control page is how you reach a preview whose tenant routing is
    // wrong, so it cannot itself be behind tenant routing.
    if (isPathWithinRoute(pathname, PREVIEW_HOST_PATH)) {
      return NextResponse.next();
    }

    if (PUBLIC_ASSET_PATTERN.test(pathname)) {
      return NextResponse.next();
    }

    if (pathname === ACCESS_BLOCKED_PATH) {
      return NextResponse.next();
    }

    if (isPathWithinRoute(pathname, MARKETING_BASE_PATH)) {
      return NextResponse.next();
    }

    if (CRM_PUBLIC_BASE_PATHS.some((base) => isPathWithinRoute(pathname, base))) {
      return NextResponse.next();
    }

    const hostHeader = getHostHeaderFromRequestHeaders(request.headers);
    const requestHost = request.nextUrl.host;
    const resolvedHost = hostHeader || requestHost || null;
    const hostContext = getPlatformHostContext(resolvedHost);
    const isAdminHost = isAdminPortalHost(resolvedHost);
    const rawToken = request.nextauth.token as PlatformToken | null;
    const token = rawToken && !isAuthExpired(rawToken.authExpiresAt) ? rawToken : null;

    // The site root is the public marketing home on the marketing domain, so a
    // signed-out visitor has to reach it without a tenant context. On a tenant
    // host the root is still the workspace, and a signed-out visitor belongs at
    // sign-in — not the generic access-blocked page that strict tenant
    // enforcement below would otherwise give them. Signed-in users fall through
    // either way so they keep being routed to their own tenant host.
    if (pathname === "/" && !token && !isAdminHost) {
      return hostContext.isTenantHost
        ? NextResponse.redirect(new URL(LOGIN_PATH, request.url))
        : NextResponse.next();
    }

    const normalizedCompanySlug = token?.companySlug?.trim().toLowerCase();
    const rootDomain = getRootDomain();
    const resolvedAllowedHosts = getResolvedAllowedHosts(token, rootDomain);
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
      const posHost = getPosHostForCompany(token.companySlug, rootDomain);
      if (posHost && hostContext.hostname !== posHost && !isAdminHost) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/";
        redirectUrl.search = "";
        return redirectAcrossHost(posHost, redirectUrl);
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

    // SALES_REP is pinned to the CRM. Pages outside the allowlist redirect to
    // /crm; API requests get a hard 403 here as well — resolveAccessContext
    // covers validateSession routes, but matcher-covered legacy APIs (cctv,
    // gold, payroll, compliance) authenticate with bare getServerSession and
    // would otherwise never see the allowlist.
    if (token && isRoleRouteRestricted(token.role) && !isRouteAllowedForRole(token.role, pathname)) {
      if (isApiRequest) {
        return NextResponse.json(
          { error: "This area is not available for your role.", code: "ROLE_ROUTE_RESTRICTED", path: pathname },
          { status: 403 },
        );
      }
      const landing = landingPathForRole(token.role) ?? "/";
      return redirectToPath(request, landing);
    }

    if (
      token &&
      (isPathWithinRoute(pathname, "/people") ||
        isPathWithinRoute(pathname, "/payroll"))
    ) {
      if (!WORKFORCE_MODULE_ALLOWED_ROLES.has(token.role ?? "")) {
        return denyAccess(request, "People and payroll access is restricted");
      }
    }

    if (token && isScrapLotsOnlyRole(token.role) && isScrapOperatorRestrictedPath(pathname)) {
      return denyAccess(request, "This route is restricted for this role");
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
        if (!isAllowedHost(hostHeader, resolvedAllowedHosts)) {
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

    if (!isAllowedHost(hostHeader, resolvedAllowedHosts)) {
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

        // Same reason as in the proxy body: this is the page you go to when
        // the deployment is pointed at the wrong tenant, so it cannot require
        // a session on that tenant.
        if (isPathWithinRoute(pathname, PREVIEW_HOST_PATH)) {
          return true;
        }

        // The site root is the public marketing home on the marketing domain.
        // The page itself sends signed-out visitors on a tenant host to /login,
        // so letting the request through here does not expose a workspace.
        if (pathname === "/") {
          return true;
        }

        if (isPathWithinRoute(pathname, MARKETING_BASE_PATH)) {
          return true;
        }

        if (CRM_PUBLIC_BASE_PATHS.some((base) => isPathWithinRoute(pathname, base))) {
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
    "/((?!api/auth|api|_next/static|_next/image|favicon.ico|manifest.json|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|eot|js|json|webmanifest|txt|xml)).*)",
    "/api/platform-admin/:path*",
    "/api/cctv/:path*",
    "/api/gold/:path*",
    "/api/payroll/:path*",
    "/api/compliance/:path*",
  ],
};
