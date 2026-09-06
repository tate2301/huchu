import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { resolveAccessContext, resolveHostHeaderFromRequest } from "@/lib/auth-core/access";
import { logAuthEvent } from "@/lib/auth-core/events";
import { buildCallbackLoginPath } from "@/lib/auth-core/redirects";
import type { AuthenticatedSession } from "@/lib/auth-core/types";

type PageAuthOptions = {
  pathname?: string;
  callbackUrl?: string;
  loginPath?: string;
  requireAdmin?: boolean;
  accessBlockedPath?: string;
  requireTenantContext?: boolean;
  enforceRouteFeatureCheck?: boolean;
  enforceTenantHost?: boolean;
};

type ApiAuthOptions = {
  request: Request;
  requireAdmin?: boolean;
  requireTenantContext?: boolean;
  enforceRouteFeatureCheck?: boolean;
  enforceTenantHost?: boolean;
};

export async function getCurrentAuthSession(): Promise<AuthenticatedSession | null> {
  return (await getServerSession(authOptions)) as AuthenticatedSession | null;
}

export async function requirePageAuth(options: PageAuthOptions = {}): Promise<AuthenticatedSession> {
  const {
    pathname,
    callbackUrl,
    loginPath = options.requireAdmin ? "/admin/login" : "/login",
    requireAdmin = false,
    accessBlockedPath = "/access-blocked",
    requireTenantContext = true,
    enforceRouteFeatureCheck = true,
    enforceTenantHost = true,
  } = options;

  const session = await getCurrentAuthSession();
  const headersList = await headers();
  const hostHeader = resolveHostHeaderFromRequest(headersList);
  const result = await resolveAccessContext({
    session,
    pathname,
    hostHeader,
    requireAdmin,
    requireTenantContext,
    enforceRouteFeatureCheck,
    enforceTenantHost,
  });

  if (result.ok) {
    return result.session;
  }

  await logAuthEvent({
    eventType: "auth.guard.denied",
    actor: session?.user?.email ?? null,
    companyId: session?.user?.companyId ?? null,
    reason: result.reason,
    entityType: "page",
    entityId: pathname ?? null,
    payload: {
      loginPath,
      hostHeader,
      status: result.status,
    },
  });

  if (result.status === 401) {
    redirect(buildCallbackLoginPath(loginPath, callbackUrl ?? pathname ?? null));
  }

  redirect(accessBlockedPath);
}

export async function requireApiAuth(options: ApiAuthOptions): Promise<{ session: AuthenticatedSession } | NextResponse> {
  const {
    request,
    requireAdmin = false,
    requireTenantContext = !requireAdmin,
    enforceRouteFeatureCheck = !requireAdmin,
    enforceTenantHost = !requireAdmin,
  } = options;

  const session = await getCurrentAuthSession();
  const pathname = new URL(request.url).pathname;
  const hostHeader = resolveHostHeaderFromRequest(request.headers);
  const result = await resolveAccessContext({
    session,
    pathname,
    hostHeader,
    requireAdmin,
    requireTenantContext,
    enforceRouteFeatureCheck,
    enforceTenantHost,
  });

  if (result.ok) {
    return { session: result.session };
  }

  await logAuthEvent({
    eventType: "auth.guard.denied",
    actor: session?.user?.email ?? null,
    companyId: session?.user?.companyId ?? null,
    reason: result.reason,
    entityType: "api",
    entityId: pathname,
    payload: {
      hostHeader,
      status: result.status,
      featureKey: result.featureKey ?? null,
    },
  });

  return NextResponse.json(
    {
      error: result.message,
      code: result.reason,
      feature: result.featureKey ?? null,
      path: pathname,
    },
    { status: result.status },
  );
}
