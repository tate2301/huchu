import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import {
  decode as defaultJwtDecode,
  encode as defaultJwtEncode,
} from "next-auth/jwt";
import { UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getAdminPortalHost, isAdminPortalHost } from "@/lib/admin-portal";
import { hasFeature } from "@/lib/platform/features";
import {
  getHostHeaderFromRequestHeaders,
  getPlatformHostContext,
  getTenantClaimsForCompany,
  isTenantStatusActive,
} from "@/lib/platform/tenant";
import { verifyEmailCode } from "@/lib/auth-core/email-code";
import { consumeSessionHandoff } from "@/lib/auth-core/session-handoff";
import { resolveSignInScope } from "@/lib/auth-core/sign-in-scope";
import { canAccessPosPortal } from "@/lib/retail/pos-host";
import { checkTillPinSignIn } from "@/lib/retail/devices";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { getSubscriptionHealth } from "@/lib/platform/subscription";
import {
  validateAuthConfiguration,
  getAuthRuntimeConfig,
} from "@/lib/auth-core/config";
import { logAuthEvent } from "@/lib/auth-core/events";
import { checkRateLimit } from "@/lib/auth-core/rate-limit";
import {
  applyTokenToSessionClaims,
  buildInitialTokenClaims,
  enrichTokenClaims,
} from "@/lib/auth-core/session-claims";
import {
  buildAuthExpiresAt,
  getSessionPolicyMaxAge,
  hydrateLegacyTokenClaims,
  isAuthExpired,
  shouldRefreshAuthExpiry,
} from "@/lib/auth-core/session-policy";
import { normalizeCallbackUrl } from "@/lib/auth-core/redirects";
import { assertStrategyEnabled } from "@/lib/auth-core/strategy-registry";
import type {
  AuthStrategyId,
  AuthenticatedSession,
  PlatformJwtClaims,
  SessionPolicy,
} from "@/lib/auth-core/types";
import { acceptPendingInvite } from "@/lib/retail/people/join";

type AuthenticatedUserLike = {
  id: string;
  role?: string;
  companyId?: string;
  authStrategy?: AuthStrategyId;
  rememberMe?: boolean;
  sessionPolicy?: SessionPolicy;
  authExpiresAt?: string;
  deviceId?: string;
  registerId?: string;
};

/** One cookie out of a request's `Cookie` header. */
function readRequestCookie(
  headers: Headers | Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | null {
  const header = readHeaderValue(headers, "cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

const AUTH_RUNTIME_CONFIG = getAuthRuntimeConfig();

function getAdminPortalAllowedEmails() {
  return AUTH_RUNTIME_CONFIG.adminPortalAllowedEmails;
}

function isAllowedAdminPortalEmail(email: string) {
  return getAdminPortalAllowedEmails().includes(email.trim().toLowerCase());
}

async function resolveAdminPortalCompanyId() {
  const configuredCompanyId = AUTH_RUNTIME_CONFIG.adminPortalCompanyId;
  if (configuredCompanyId) {
    const company = await prisma.company.findUnique({
      where: { id: configuredCompanyId },
      select: { id: true },
    });
    if (!company) {
      throw new Error(
        "ADMIN_PORTAL_COMPANY_ID is set but does not match any company.",
      );
    }
    return configuredCompanyId;
  }

  const firstCompany = await prisma.company.findFirst({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!firstCompany) {
    throw new Error("No company available to attach admin portal identity.");
  }
  return firstCompany.id;
}

async function upsertAdminPortalUser(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!isAllowedAdminPortalEmail(normalizedEmail)) {
    return null;
  }

  const companyId = await resolveAdminPortalCompanyId();
  const emailName = normalizedEmail
    .split("@")[0]
    ?.replace(/[._-]+/g, " ")
    .trim();
  const name =
    AUTH_RUNTIME_CONFIG.adminPortalActorName ||
    emailName ||
    "Platform Superuser";

  return prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {
      role: UserRole.SUPERADMIN,
      companyId,
      isActive: true,
      name,
    },
    create: {
      email: normalizedEmail,
      name,
      role: UserRole.SUPERADMIN,
      companyId,
      isActive: true,
      emailVerified: new Date(),
    },
  });
}

const baseAdapter = PrismaAdapter(prisma) as Adapter;

const adminPortalAdapter = {
  ...baseAdapter,
  async getUserByEmail(email: string) {
    const baseUser = await baseAdapter.getUserByEmail?.(email);
    if (baseUser) return baseUser;
    const adminUser = await upsertAdminPortalUser(email);
    return adminUser ?? null;
  },
  async createUser(user: Parameters<NonNullable<Adapter["createUser"]>>[0]) {
    const typedUser = user as { email?: string };
    const normalized = typedUser.email?.trim().toLowerCase();
    if (normalized && isAllowedAdminPortalEmail(normalized)) {
      const adminUser = await upsertAdminPortalUser(normalized);
      if (adminUser) return adminUser;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return baseAdapter.createUser!(user as any);
  },
} as Adapter;

function toTenantStatus(
  rawStatus: string | undefined,
  subscriptionActive: boolean,
): string {
  const normalizedStatus = rawStatus?.trim().toUpperCase();

  if (normalizedStatus && normalizedStatus !== "ACTIVE") {
    return normalizedStatus;
  }

  return subscriptionActive ? "ACTIVE" : "SUBSCRIPTION_INACTIVE";
}

function stripControlChars(value: string): string {
  return Array.from(value)
    .filter((char) => {
      const codePoint = char.codePointAt(0);
      if (codePoint === undefined) {
        return false;
      }
      return codePoint >= 32 && codePoint !== 127;
    })
    .join("");
}

function buildDevPasswordFallbackCandidates(rawPassword: string): string[] {
  const trimmedPassword = rawPassword.trim();
  const noControlChars = stripControlChars(rawPassword);
  const noControlCharsTrimmed = noControlChars.trim();

  const candidates = [
    rawPassword,
    trimmedPassword,
    noControlChars,
    noControlCharsTrimmed,
    `${rawPassword} `,
    ` ${rawPassword}`,
    `${trimmedPassword} `,
    ` ${trimmedPassword}`,
    `${rawPassword}\n`,
    `${rawPassword}\r`,
    `${rawPassword}\r\n`,
    `${trimmedPassword}\n`,
    `${trimmedPassword}\r`,
    `${trimmedPassword}\r\n`,
  ];

  return Array.from(new Set(candidates.filter(Boolean)));
}

function readHeaderValue(
  headers: Headers | Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) {
    return undefined;
  }

  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  const rawValue = headers[name];
  if (Array.isArray(rawValue)) {
    return rawValue[0];
  }
  return rawValue;
}

function getClientAddressFromHeaders(
  headers: Headers | Record<string, string | string[] | undefined> | undefined,
): string {
  const forwardedFor = readHeaderValue(headers, "x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const realIp = readHeaderValue(headers, "x-real-ip")?.trim();
  return forwardedFor || realIp || "unknown";
}

function isAdminRoutePath(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/portal/admin" ||
    pathname.startsWith("/portal/admin/")
  );
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();

  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

function shouldPreserveAdminOriginInDev(baseUrl: string): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  try {
    const parsedBaseUrl = new URL(baseUrl);
    return isLoopbackHostname(parsedBaseUrl.hostname);
  } catch {
    return false;
  }
}

function buildAdminPortalRedirectBaseUrl(baseUrl: string): string {
  try {
    const parsedBaseUrl = new URL(baseUrl);
    if (shouldPreserveAdminOriginInDev(baseUrl)) {
      return parsedBaseUrl.origin;
    }

    parsedBaseUrl.hostname = getAdminPortalHost();
    return parsedBaseUrl.origin;
  } catch {
    return baseUrl;
  }
}

type SignInContext = {
  email: string;
  strategy: AuthStrategyId;
  hostHeader: string | null;
  clientAddress: string;
};

type SignInUserRecord = {
  id: string;
  email: string | null;
  name: string;
  password: string | null;
  role: UserRole;
  companyId: string;
  isActive: boolean;
  image: string | null;
};

function buildSignInContext(
  email: string,
  strategy: AuthStrategyId,
  headers: Headers | Record<string, string | string[] | undefined> | undefined,
): SignInContext {
  return {
    email,
    strategy,
    hostHeader: getHostHeaderFromRequestHeaders(headers),
    clientAddress: getClientAddressFromHeaders(headers),
  };
}

/** Record why a sign-in was refused, then refuse it with a code the form can read. */
async function failSignIn(
  ctx: SignInContext,
  reason: string,
  options: { companyId?: string; message?: string } = {},
): Promise<never> {
  await logAuthEvent({
    eventType: "auth.login.failed",
    actor: ctx.email,
    companyId: options.companyId,
    reason,
    entityType: "auth-strategy",
    entityId: ctx.strategy,
    payload: { hostHeader: ctx.hostHeader, clientAddress: ctx.clientAddress },
  });
  throw new Error(options.message ?? reason);
}

async function enforceSignInRateLimit(ctx: SignInContext): Promise<void> {
  const rateLimit = checkRateLimit({
    key: `auth:${ctx.strategy}:${ctx.hostHeader ?? "unknown-host"}:${ctx.email}:${ctx.clientAddress}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (rateLimit.allowed) return;

  await logAuthEvent({
    eventType: "auth.login.rate-limited",
    actor: ctx.email,
    reason: `Retry after ${rateLimit.retryAfterSeconds}s`,
    entityType: "auth-strategy",
    entityId: ctx.strategy,
    payload: { hostHeader: ctx.hostHeader, clientAddress: ctx.clientAddress },
  });
  throw new Error("AUTH_RATE_LIMITED");
}

/** The company this host lets people sign in to, or undefined when any will do. */
async function resolveSignInCompanyScope(ctx: SignInContext): Promise<string | undefined> {
  const scope = await resolveSignInScope(ctx.hostHeader);
  if (!scope.ok) {
    return failSignIn(ctx, scope.reason, { companyId: scope.companyId });
  }
  return scope.companyId;
}

const SIGN_IN_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  password: true,
  role: true,
  companyId: true,
  isActive: true,
  image: true,
} as const;

async function findSignInUser(email: string, companyId: string | undefined): Promise<SignInUserRecord | null> {
  return prisma.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      ...(companyId ? { companyId } : {}),
    },
    select: SIGN_IN_USER_SELECT,
  });
}

/** The same record by id: someone who only uses a till has no email (80-admin, People). */
async function findSignInUserById(id: string, companyId: string | undefined): Promise<SignInUserRecord | null> {
  return prisma.user.findFirst({ where: { id, ...(companyId ? { companyId } : {}) }, select: SIGN_IN_USER_SELECT });
}

async function assertAccountUsable(user: SignInUserRecord, ctx: SignInContext): Promise<void> {
  if (!user.isActive) {
    await failSignIn(ctx, "ACCOUNT_INACTIVE", { companyId: user.companyId, message: "Account is inactive" });
  }

  const hostContext = getPlatformHostContext(ctx.hostHeader);
  if (hostContext.portalCanonicalPrefix === "pos" && !canAccessPosPortal(user.role)) {
    await failSignIn(ctx, "POS_PORTAL_ACCESS_REQUIRED", { companyId: user.companyId });
  }
}

/** The checks every way of signing in ends with, then the session's claims. */
async function completeSignIn(user: SignInUserRecord, ctx: SignInContext, rememberMe: boolean) {
  const loginEnabled = await hasFeature(user.companyId, "core.auth.login");
  if (!loginEnabled) {
    await failSignIn(ctx, "LOGIN_DISABLED", {
      companyId: user.companyId,
      message: "Login is disabled for this organization",
    });
  }

  const [tenantClaims, subscriptionHealth] = await Promise.all([
    getTenantClaimsForCompany(user.companyId),
    getSubscriptionHealth(user.companyId),
  ]);
  const effectiveTenantStatus = toTenantStatus(tenantClaims.tenantStatus, !subscriptionHealth.shouldBlock);
  if (!isTenantStatusActive(effectiveTenantStatus)) {
    await failSignIn(ctx, "TENANT_INACTIVE", { companyId: user.companyId });
  }

  await logAuthEvent({
    eventType: "auth.login.success",
    actor: ctx.email,
    companyId: user.companyId,
    entityType: "auth-strategy",
    entityId: ctx.strategy,
    payload: { hostHeader: ctx.hostHeader, clientAddress: ctx.clientAddress, rememberMe },
  });
  // In: a staff invite still waiting has done its job (80-admin W-57).
  await acceptPendingInvite(user.id, ctx.strategy === "till-pin" ? "pin" : "sign-in");

  const sessionPolicy: SessionPolicy = rememberMe ? "remember" : "standard";
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.companyId,
    image: user.image,
    authStrategy: ctx.strategy,
    rememberMe,
    sessionPolicy,
    authExpiresAt: buildAuthExpiresAt(sessionPolicy),
  };
}

validateAuthConfiguration();

export const authOptions: NextAuthOptions = {
  adapter: adminPortalAdapter,
  providers: [
    {
      id: "email",
      type: "email",
      name: "Email",
      server: "",
      from: AUTH_RUNTIME_CONFIG.adminMagicLinkFrom,
      maxAge: 10 * 60,
      async sendVerificationRequest({
        identifier,
        url,
      }: {
        identifier: string;
        url: string;
      }) {
        assertStrategyEnabled("admin-email-link");

        const normalizedIdentifier = identifier.trim().toLowerCase();
        if (!isAllowedAdminPortalEmail(normalizedIdentifier)) {
          await logAuthEvent({
            eventType: "auth.email-link.rejected",
            actor: normalizedIdentifier,
            reason: "ADMIN_EMAIL_NOT_ALLOWED",
            entityType: "auth-strategy",
            entityId: "admin-email-link",
          });
          throw new Error("This email is not allowed for admin sign-in.");
        }

        const parsedUrl = new URL(url);
        if (!isAdminPortalHost(parsedUrl.host)) {
          await logAuthEvent({
            eventType: "auth.email-link.rejected",
            actor: identifier,
            reason: "ADMIN_HOST_MISMATCH",
            entityType: "auth-strategy",
            entityId: "admin-email-link",
            payload: { host: parsedUrl.host },
          });
          // throw new Error(
          //   `Magic links are restricted to the admin host (${getAdminRootDomain()}).`,
          // );
        }

        const rateLimit = checkRateLimit({
          key: `auth:admin-email-link:${identifier.trim().toLowerCase()}`,
          limit: 5,
          windowMs: 15 * 60 * 1000,
        });
        if (!rateLimit.allowed) {
          await logAuthEvent({
            eventType: "auth.email-link.rate-limited",
            actor: identifier,
            reason: `Retry after ${rateLimit.retryAfterSeconds}s`,
            entityType: "auth-strategy",
            entityId: "admin-email-link",
          });
          throw new Error("AUTH_RATE_LIMITED");
        }

        const subject = "Your Pagka superuser magic link";
        const text = `Use this secure link to sign in: ${url}`;
        const html = `<p>Use this secure link to sign in:</p><p><a href="${url}">Sign in to Superuser Portal</a></p>`;

        const resendApiKey = AUTH_RUNTIME_CONFIG.adminMagicLinkResendApiKey;
        if (resendApiKey) {
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${resendApiKey}`,
            },
            body: JSON.stringify({
              from: AUTH_RUNTIME_CONFIG.adminMagicLinkFrom,
              to: [normalizedIdentifier],
              subject,
              text,
              html,
            }),
          });

          if (!response.ok) {
            await logAuthEvent({
              eventType: "auth.email-link.delivery-failed",
              actor: identifier,
              reason: `Resend status ${response.status}`,
              entityType: "auth-strategy",
              entityId: "admin-email-link",
            });
            throw new Error(
              `Resend delivery failed with status ${response.status}.`,
            );
          }

          await logAuthEvent({
            eventType: "auth.email-link.sent",
            actor: identifier,
            entityType: "auth-strategy",
            entityId: "admin-email-link",
          });
          return;
        }

        const webhookUrl = AUTH_RUNTIME_CONFIG.adminMagicLinkWebhookUrl;
        if (webhookUrl) {
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: normalizedIdentifier,
              subject,
              text,
              html,
            }),
          });

          await logAuthEvent({
            eventType: "auth.email-link.sent",
            actor: identifier,
            entityType: "auth-strategy",
            entityId: "admin-email-link",
          });
          return;
        }

        throw new Error(
          "No magic-link delivery provider configured. Set ADMIN_MAGIC_LINK_RESEND_API_KEY or ADMIN_MAGIC_LINK_WEBHOOK_URL.",
        );
      },
      options: {},
    },
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember me", type: "text" },
      },
      async authorize(credentials, req) {
        assertStrategyEnabled("credentials");

        const exposeCredentialDebugReason =
          process.env.NODE_ENV !== "production";
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        const rememberMe = credentials?.rememberMe === "true";

        if (!email || !password) {
          throw new Error("Invalid credentials");
        }

        const ctx = buildSignInContext(email, "credentials", req?.headers);
        await enforceSignInRateLimit(ctx);
        const scopedCompanyId = await resolveSignInCompanyScope(ctx);
        const user = await findSignInUser(email, scopedCompanyId);

        if (!user) {
          return failSignIn(ctx, exposeCredentialDebugReason ? "AUTH_EMAIL_NOT_FOUND" : "INVALID_CREDENTIALS", {
            message: exposeCredentialDebugReason ? "AUTH_EMAIL_NOT_FOUND" : "Invalid credentials",
          });
        }

        if (!user.password) {
          return failSignIn(ctx, exposeCredentialDebugReason ? "AUTH_PASSWORD_NOT_SET" : "INVALID_CREDENTIALS", {
            companyId: user.companyId,
            message: exposeCredentialDebugReason ? "AUTH_PASSWORD_NOT_SET" : "Invalid credentials",
          });
        }

        await assertAccountUsable(user, ctx);

        const passwordCandidates = exposeCredentialDebugReason
          ? buildDevPasswordFallbackCandidates(password)
          : [password];

        let isCorrectPassword = false;
        let matchedCandidate: string | null = null;
        for (const candidate of passwordCandidates) {
          if (await bcrypt.compare(candidate, user.password)) {
            isCorrectPassword = true;
            matchedCandidate = candidate;
            break;
          }
        }

        if (!isCorrectPassword) {
          return failSignIn(ctx, exposeCredentialDebugReason ? "AUTH_PASSWORD_MISMATCH" : "INVALID_CREDENTIALS", {
            companyId: user.companyId,
            message: exposeCredentialDebugReason ? "AUTH_PASSWORD_MISMATCH" : "Invalid credentials",
          });
        }

        if (exposeCredentialDebugReason && matchedCandidate !== password) {
          const canonicalPasswordHash = await bcrypt.hash(password, 12);
          await prisma.user.update({
            where: { id: user.id },
            data: { password: canonicalPasswordHash },
          });
        }

        return completeSignIn(user, ctx, rememberMe);
      },
    }),
    CredentialsProvider({
      // The same person as a password sign-in, proving it with a code sent to
      // their address instead. The only way in for someone who signed up and
      // never set a password.
      id: "email-code",
      name: "email-code",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Code", type: "text" },
        rememberMe: { label: "Remember me", type: "text" },
      },
      async authorize(credentials, req) {
        assertStrategyEnabled("email-code");

        const email = credentials?.email?.trim().toLowerCase();
        const code = credentials?.code?.trim();
        const rememberMe = credentials?.rememberMe === "true";
        if (!email || !code) {
          throw new Error("INVALID_CODE");
        }

        const ctx = buildSignInContext(email, "email-code", req?.headers);
        await enforceSignInRateLimit(ctx);
        const scopedCompanyId = await resolveSignInCompanyScope(ctx);
        const user = await findSignInUser(email, scopedCompanyId);
        if (!user) {
          return failSignIn(ctx, "INVALID_CODE");
        }

        // Found by this address, so it has one.
        const verified = await verifyEmailCode({ email: user.email ?? email, purpose: "SIGN_IN", code });
        if (!verified.ok) {
          const reason =
            verified.reason === "EXPIRED" ? "CODE_EXPIRED" : verified.reason === "LOCKED" ? "CODE_LOCKED" : "INVALID_CODE";
          return failSignIn(ctx, reason, { companyId: user.companyId });
        }

        await assertAccountUsable(user, ctx);
        return completeSignIn(user, ctx, rememberMe);
      },
    }),
    CredentialsProvider({
      // A PIN at a paired till (10-setup W-04 step 7, "Who is selling?"). The
      // device key in the POS host's httpOnly cookie says which till; the
      // four digits say who, with the till PIN's lockout. Only on the POS
      // host, and the session it makes is good there only (`proxy.ts`,
      // `resolveAccessContext`).
      id: "till-pin",
      name: "till-pin",
      credentials: {
        userId: { label: "Who", type: "text" },
        pin: { label: "PIN", type: "password" },
      },
      async authorize(credentials, req) {
        assertStrategyEnabled("till-pin");

        const userId = credentials?.userId?.trim();
        const pin = credentials?.pin?.trim();
        if (!userId || !pin) throw new Error("WRONG_PIN");

        const account = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        if (!account) throw new Error("NOT_ON_THIS_TILL");
        // Someone who only uses a till has no email; their id names them in the log.
        const ctx = buildSignInContext(account.email ?? userId, "till-pin", req?.headers);
        if (getPlatformHostContext(ctx.hostHeader).portalCanonicalPrefix !== "pos") {
          return failSignIn(ctx, "NOT_A_TILL");
        }
        const scopedCompanyId = await resolveSignInCompanyScope(ctx);
        const user = await findSignInUserById(userId, scopedCompanyId);
        if (!user || user.id !== userId) return failSignIn(ctx, "NOT_ON_THIS_TILL");

        const checked = await checkTillPinSignIn({
          deviceKey: readRequestCookie(req?.headers, DEVICE_COOKIE),
          userId: user.id,
          verify: (pinHash) => bcrypt.compare(pin, pinHash),
        });
        if (!checked.ok) {
          return failSignIn(ctx, checked.reason, {
            companyId: user.companyId,
            message: checked.reason === "WRONG_PIN" ? `WRONG_PIN:${checked.triesLeft ?? 0}` : checked.reason,
          });
        }
        if (checked.device.companyId !== user.companyId) return failSignIn(ctx, "NOT_A_TILL");

        await assertAccountUsable(user, ctx);
        const signedIn = await completeSignIn(user, ctx, false);
        return { ...signedIn, deviceId: checked.device.id, registerId: checked.device.registerId };
      },
    }),
    CredentialsProvider({
      // Not something anyone chooses: the signup host hands a new admin to
      // their workspace host with a one-use ticket, because sessions are per
      // host. The ticket is spent here, on the workspace host, and only for
      // the workspace it names.
      id: "handoff",
      name: "handoff",
      credentials: {
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials, req) {
        assertStrategyEnabled("handoff");

        const userId = await consumeSessionHandoff(credentials?.token ?? "");
        if (!userId) {
          throw new Error("HANDOFF_INVALID");
        }

        const account = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        if (!account) {
          throw new Error("HANDOFF_INVALID");
        }

        const ctx = buildSignInContext(account.email ?? userId, "handoff", req?.headers);
        const scopedCompanyId = await resolveSignInCompanyScope(ctx);
        const user = await findSignInUserById(userId, scopedCompanyId);
        if (!user || user.id !== userId) {
          return failSignIn(ctx, "TENANT_HOST_MISMATCH");
        }

        await assertAccountUsable(user, ctx);
        return completeSignIn(user, ctx, true);
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "email") {
        return true;
      }

      const normalizedEmail = user.email?.trim().toLowerCase();
      if (!normalizedEmail || !isAllowedAdminPortalEmail(normalizedEmail)) {
        await logAuthEvent({
          eventType: "auth.login.failed",
          actor: normalizedEmail ?? user.email ?? null,
          reason: "ADMIN_EMAIL_NOT_ALLOWED",
          entityType: "auth-strategy",
          entityId: "admin-email-link",
        });
        return false;
      }

      await logAuthEvent({
        eventType: "auth.login.success",
        actor: normalizedEmail,
        companyId: (user as { companyId?: string }).companyId ?? null,
        entityType: "auth-strategy",
        entityId: "admin-email-link",
      });
      return true;
    },
    async jwt({ token, user, account }) {
      const extendedToken = token as PlatformJwtClaims;

      if (user) {
        const typedUser = user as AuthenticatedUserLike;
        const authStrategy =
          account?.provider === "email"
            ? "admin-email-link"
            : (typedUser.authStrategy ?? "credentials");
        Object.assign(
          extendedToken,
          buildInitialTokenClaims({
            id: typedUser.id,
            role: typedUser.role,
            companyId: typedUser.companyId,
            authStrategy,
            rememberMe: typedUser.rememberMe === true,
            deviceId: typedUser.deviceId,
            registerId: typedUser.registerId,
          }),
        );
      } else {
        hydrateLegacyTokenClaims(extendedToken);
      }

      if (isAuthExpired(extendedToken.authExpiresAt)) {
        return {};
      }

      if (
        extendedToken.sessionPolicy &&
        shouldRefreshAuthExpiry(extendedToken.sessionPolicy)
      ) {
        extendedToken.authExpiresAt = buildAuthExpiresAt(
          extendedToken.sessionPolicy,
        );
      }

      return enrichTokenClaims(extendedToken);
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) {
        const normalizedPath = normalizeCallbackUrl(url, "/");

        if (isAdminRoutePath(normalizedPath)) {
          return `${buildAdminPortalRedirectBaseUrl(baseUrl)}${normalizedPath}`;
        }

        return `${baseUrl}${normalizedPath}`;
      }

      try {
        const targetUrl = new URL(url);
        if (targetUrl.origin === baseUrl) {
          return url;
        }

        if (isAdminPortalHost(targetUrl.host)) {
          return targetUrl.toString();
        }
      } catch {
        return baseUrl;
      }

      return baseUrl;
    },
    async session({ session, token }) {
      if (session.user) {
        applyTokenToSessionClaims(
          session as AuthenticatedSession,
          token as PlatformJwtClaims,
        );
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: getSessionPolicyMaxAge("remember"),
  },
  jwt: {
    maxAge: getSessionPolicyMaxAge("remember"),
    async encode(params) {
      const token = params.token as PlatformJwtClaims | undefined;
      const maxAge = getSessionPolicyMaxAge(token?.sessionPolicy);

      return defaultJwtEncode({
        ...params,
        maxAge,
      });
    },
    async decode(params) {
      const token = await defaultJwtDecode(params);
      const typedToken = token as PlatformJwtClaims | null;
      if (
        typedToken?.authExpiresAt &&
        isAuthExpired(typedToken.authExpiresAt)
      ) {
        return null;
      }
      return token;
    },
  },
  secret: AUTH_RUNTIME_CONFIG.nextAuthSecret,
};

export { isAuthExpired, type PlatformJwtClaims, type SessionPolicy };
