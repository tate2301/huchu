import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

export type AuthStrategyId = "credentials" | "admin-email-link" | "email-link" | "otp";
export type AuthSurface = "primary-login" | "portal-login" | "admin-login";
export type SessionPolicy = "standard" | "remember" | "admin";

export type AuthFailureReason =
  | "UNAUTHORIZED"
  | "AUTH_EXPIRED"
  | "MISSING_TENANT_CONTEXT"
  | "TENANT_INACTIVE"
  | "TENANT_HOST_MISMATCH"
  | "FEATURE_DISABLED"
  | "SUPERUSER_REQUIRED"
  | "ADMIN_HOST_REQUIRED"
  | "RATE_LIMITED"
  | "STRATEGY_DISABLED"
  | "INVALID_CALLBACK_URL";

export type AuthSessionClaims = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: string;
  companyId: string;
  authStrategy?: AuthStrategyId;
  sessionPolicy?: SessionPolicy;
  authExpiresAt?: string;
  rememberMe?: boolean;
  companySlug?: string;
  tenantStatus?: string;
  workspaceProfile?: string;
  enabledFeatures?: string[];
  subscriptionHealth?: string;
  allowedHosts?: string[];
};

export type AuthenticatedSession = Session & {
  user: AuthSessionClaims & NonNullable<Session["user"]>;
};

export type PlatformJwtClaims = JWT & Partial<AuthSessionClaims>;

export type AuthStrategyDescriptor = {
  id: AuthStrategyId;
  providerId: string;
  label: string;
  description: string;
  surfaces: AuthSurface[];
  enabled: boolean;
  live: boolean;
  kind: "password" | "magic-link" | "otp";
  supportsRememberMe: boolean;
};

export type AuthEventInput = {
  eventType: string;
  actor?: string | null;
  companyId?: string | null;
  reason?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown>;
};

export type AuthGuardFailure = {
  ok: false;
  reason: AuthFailureReason;
  status: 401 | 403 | 429;
  message: string;
  featureKey?: string;
  path?: string;
};

export type ResolvedAccessContext = {
  ok: true;
  session: AuthenticatedSession;
  pathname?: string;
  hostHeader?: string | null;
};

export type AuthGuardResult = ResolvedAccessContext | AuthGuardFailure;
