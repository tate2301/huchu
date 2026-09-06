import NextAuth from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getCredentialsPrecheckFailure } from "@/lib/auth-core/credentials-precheck";

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
