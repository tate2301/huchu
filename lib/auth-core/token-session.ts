// Token-first session read for API routes.
//
// `getServerSession(authOptions)` costs the whole NextAuth wiring module —
// prisma adapter, bcrypt, strategy registry — imported statically just to
// decrypt the session cookie. With the JWT session strategy (lib/auth.ts) the
// cookie IS the session: `getToken()` decrypts it with only the secret.
//
// Parity notes, checked against lib/auth.ts:
// - authOptions sets no custom `cookies` option, so getToken's default cookie
//   name resolution matches what NextAuth wrote.
// - authOptions.jwt.decode is the default decode plus one guard: a token whose
//   `authExpiresAt` claim has passed is treated as absent. Replicated below.
// - The claim mapping mirrors applyTokenToSessionClaims
//   (lib/auth-core/session-claims.ts) field for field.
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { getAuthRuntimeConfig } from "@/lib/auth-core/config";
import { isAuthExpired } from "@/lib/auth-core/session-policy";
import type { AuthenticatedSession, PlatformJwtClaims } from "@/lib/auth-core/types";

export async function getTokenAuthSession(
  request: NextRequest | Request,
): Promise<AuthenticatedSession | null> {
  const token = (await getToken({
    req: request as NextRequest,
    secret: getAuthRuntimeConfig().nextAuthSecret,
  })) as PlatformJwtClaims | null;

  if (!token?.id) {
    return null;
  }

  // authOptions.jwt.decode returns null for an auth-expired token; getToken
  // with the default decode does not know about that claim, so the same guard
  // lives here.
  if (isAuthExpired(token.authExpiresAt)) {
    return null;
  }

  // Parity with getServerSession, which re-runs the jwt callback — and with it
  // enrichTokenClaims — on EVERY call: tenant status, entitlements and allowed
  // hosts are re-read from the database per guarded request, so a suspension
  // or feature revocation takes effect immediately, not at token expiry.
  // (Codex review P1 on PR #157.) Dynamically imported: session-claims reaches
  // prisma through the entitlement helpers, and keeping it out of the static
  // graph is the point of this module. The runtime cost is identical to the
  // old path, which ran the same lookups inside the jwt callback.
  const { enrichTokenClaims } = await import("@/lib/auth-core/session-claims");
  const enriched = await enrichTokenClaims(token);

  return tokenToSession(enriched);
}

/**
 * Map JWT claims to the session shape routes receive. Field list mirrors
 * applyTokenToSessionClaims — keep the two in sync.
 */
export function tokenToSession(token: PlatformJwtClaims): AuthenticatedSession {
  const expires = typeof token.exp === "number"
    ? new Date(token.exp * 1000).toISOString()
    : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  return {
    expires,
    user: {
      id: token.id ?? "",
      name: token.name ?? null,
      email: token.email ?? null,
      role: token.role ?? "",
      companyId: token.companyId ?? "",
      authStrategy: token.authStrategy,
      sessionPolicy: token.sessionPolicy,
      authExpiresAt: token.authExpiresAt,
      rememberMe: token.rememberMe,
      companySlug: token.companySlug,
      tenantStatus: token.tenantStatus,
      workspaceProfile: token.workspaceProfile,
      enabledFeatures: token.enabledFeatures,
      subscriptionHealth: token.subscriptionHealth,
      allowedHosts: token.allowedHosts,
    },
  } as AuthenticatedSession;
}
