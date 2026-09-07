import NextAuth from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { resolveAuthOptions } from "../../../auth-core/auth-options";
import { getCredentialsPrecheckFailure } from "../../../auth-core/credentials-precheck";

type NextAuthRouteContext = {
  params: Promise<{
    nextauth: string[];
  }>;
};

// The options are the host's to register (`registerAuthOptions`, at boot);
// the handler is built on the first request that needs it. NextAuth's app
// router handler takes the route context as Next hands it over.
async function handler(request: NextRequest, context: NextAuthRouteContext | { params: { nextauth: string[] } }) {
  return NextAuth(await resolveAuthOptions())(request, context);
}

export { handler as GET };

export async function POST(request: NextRequest, context: NextAuthRouteContext) {
  const isCredentialsCallback = request.nextUrl.pathname.endsWith("/callback/credentials");

  if (isCredentialsCallback) {
    const failure = await getCredentialsPrecheckFailure(request.headers);
    if (failure) {
      return NextResponse.json(
        {
          error: failure.error,
          code: failure.code,
          message: failure.message,
        },
        { status: failure.status },
      );
    }
  }

  const params = await context.params;
  return handler(request, { params });
}
