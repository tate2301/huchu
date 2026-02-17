import NextAuth from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getHostHeaderFromRequestHeaders, getPlatformHostContext } from "@/lib/platform/tenant";

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

    if (hostContext.strictTenantEnforcement && (!hostContext.isTenantHost || !hostContext.tenantSlug)) {
      return NextResponse.json(
        {
          error: "TENANT_HOST_REQUIRED",
          code: "TENANT_HOST_REQUIRED",
          message: "Use your organization subdomain to sign in.",
        },
        { status: 403 },
      );
    }
  }

  const params = await context.params;
  return handler(request, { params });
}
