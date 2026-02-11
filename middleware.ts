import { withAuth } from "next-auth/middleware";
import type { NextRequestWithAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { getPlatformHostContext, isTenantStatusActive } from "@/lib/platform/tenant";

const ACCESS_BLOCKED_PATH = "/access-blocked";

type PlatformToken = {
  companyId?: string;
  companySlug?: string;
  tenantStatus?: string;
};

function redirectToAccessBlocked(request: NextRequestWithAuth) {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = ACCESS_BLOCKED_PATH;
  redirectUrl.search = "";
  return NextResponse.redirect(redirectUrl);
}

export default withAuth(
  function middleware(request) {
    const { pathname } = request.nextUrl;

    if (pathname === ACCESS_BLOCKED_PATH) {
      return NextResponse.next();
    }

    const hostContext = getPlatformHostContext(request.headers.get("host"));

    if (!hostContext.strictTenantEnforcement || !hostContext.isTenantHost || !hostContext.tenantSlug) {
      return NextResponse.next();
    }

    const token = request.nextauth.token as PlatformToken | null;
    if (!token?.companyId) {
      return redirectToAccessBlocked(request);
    }

    const normalizedCompanySlug = token.companySlug?.trim().toLowerCase();
    if (!normalizedCompanySlug || normalizedCompanySlug !== hostContext.tenantSlug) {
      return redirectToAccessBlocked(request);
    }

    if (!isTenantStatusActive(token.tenantStatus)) {
      return redirectToAccessBlocked(request);
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/((?!api/auth|api|login|_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)",
  ],
};
