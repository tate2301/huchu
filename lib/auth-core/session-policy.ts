import type { AuthStrategyId, AuthenticatedSession, PlatformJwtClaims, SessionPolicy } from "@/lib/auth-core/types";

export const ONE_DAY_IN_SECONDS = 24 * 60 * 60;
export const THIRTY_DAYS_IN_SECONDS = 30 * ONE_DAY_IN_SECONDS;
export const ADMIN_SESSION_MAX_AGE = ONE_DAY_IN_SECONDS;
export const STANDARD_SESSION_MAX_AGE = ONE_DAY_IN_SECONDS;
export const REMEMBER_SESSION_MAX_AGE = THIRTY_DAYS_IN_SECONDS;

type SessionPolicyUserLike = {
  id: string;
  role?: string;
  rememberMe?: boolean;
  sessionPolicy?: SessionPolicy;
};

export function getSessionPolicyMaxAge(policy: SessionPolicy | undefined): number {
  if (policy === "admin") {
    return ADMIN_SESSION_MAX_AGE;
  }
  if (policy === "remember") {
    return REMEMBER_SESSION_MAX_AGE;
  }
  return STANDARD_SESSION_MAX_AGE;
}

export function resolveSessionPolicy(user?: SessionPolicyUserLike | null): SessionPolicy {
  if (user?.sessionPolicy) {
    return user.sessionPolicy;
  }
  if (user?.role?.trim().toUpperCase() === "SUPERADMIN") {
    return "admin";
  }
  return user?.rememberMe ? "remember" : "standard";
}

export function buildAuthExpiresAt(policy: SessionPolicy): string {
  return new Date(Date.now() + getSessionPolicyMaxAge(policy) * 1000).toISOString();
}

export function isAuthExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) {
    return false;
  }
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) {
    return false;
  }
  return parsed <= Date.now();
}

export function isSessionExpired(session: AuthenticatedSession | null | undefined): boolean {
  return isAuthExpired(session?.user?.authExpiresAt);
}

export function resolvePolicyForStrategy(strategyId: AuthStrategyId | undefined, rememberMe: boolean): SessionPolicy {
  if (strategyId === "admin-email-link") {
    return "admin";
  }
  return rememberMe ? "remember" : "standard";
}

export function hydrateLegacyTokenClaims(token: PlatformJwtClaims): PlatformJwtClaims {
  if (!token.id) {
    return token;
  }

  if (!token.sessionPolicy) {
    token.sessionPolicy = resolveSessionPolicy({
      id: token.id,
      role: token.role,
      rememberMe: token.rememberMe,
    });
  }

  if (!token.authExpiresAt && token.sessionPolicy) {
    token.authExpiresAt = buildAuthExpiresAt(token.sessionPolicy);
  }

  if (token.sessionPolicy === "remember") {
    token.rememberMe = true;
  }

  return token;
}
