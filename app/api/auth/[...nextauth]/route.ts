import NextAuth from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  getHostHeaderFromRequestHeaders,
  getPlatformHostContext,
  isTenantStatusActive,
  resolveTenantFromHost,
} from "@/lib/platform/tenant";

const handler = NextAuth(authOptions);

export { handler as GET };

type NextAuthRouteContext = {
  params: Promise<{
    nextauth: string[];
  }>;
};

export async function POST(request: NextRequest, context: NextAuthRouteContext) {
  const isCredentialsCallback = request.nextUrl.pathname.endsWith("/callback/credentials");

  if (isCredentialsCallback) {
    const hostHeader = getHostHeaderFromRequestHeaders(request.headers);
    const hostContext = getPlatformHostContext(hostHeader);

    if (hostContext.strictTenantEnforcement) {
      if (hostContext.isCentralHost) {
        return NextResponse.json(
          {
            error: "TENANT_HOST_REQUIRED",
            code: "TENANT_HOST_REQUIRED",
            message: "Use your organization URL to sign in.",
          },
          { status: 403 },
        );
      }

      const tenant = await resolveTenantFromHost(hostHeader);
      if (!tenant) {
        return NextResponse.json(
          {
            error: "TENANT_NOT_FOUND",
            code: "TENANT_NOT_FOUND",
            message: "This organization URL is not recognized.",
          },
          { status: 403 },
        );
      }

      if (!isTenantStatusActive(tenant.tenantStatus)) {
        return NextResponse.json(
          {
            error: "TENANT_INACTIVE",
            code: "TENANT_INACTIVE",
            message: "This organization is currently inactive.",
          },
          { status: 403 },
        );
      }
    }
  }

  const params = await context.params;
  return handler(request, { params });
}
