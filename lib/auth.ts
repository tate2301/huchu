import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import type { JWT } from "next-auth/jwt";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/platform/features";
import {
  getAllowedHostsForCompany,
  getHostHeaderFromRequestHeaders,
  getPlatformHostContext,
  getTenantClaimsForCompany,
  isTenantStatusActive,
  resolveTenantFromHost,
} from "@/lib/platform/tenant";
import { getEnabledFeatureKeys } from "@/lib/platform/entitlements";
import { getSubscriptionHealth } from "@/lib/platform/subscription";
import { getEffectiveFeaturesForUser } from "@/lib/platform/user-entitlements";
import bcrypt from "bcryptjs";
import { ADMIN_PORTAL_HOST } from "@/lib/admin-portal";

const DEFAULT_ADMIN_EMAIL = "thehalfstackdev@gmail.com";

function getAdminPortalEmail() {
  return process.env.ADMIN_PORTAL_EMAIL?.trim().toLowerCase() || DEFAULT_ADMIN_EMAIL;
}


async function resolveAdminPortalCompanyId() {
  const configuredCompanyId = process.env.ADMIN_PORTAL_COMPANY_ID?.trim();
  if (configuredCompanyId) {
    const company = await prisma.company.findUnique({ where: { id: configuredCompanyId }, select: { id: true } });
    if (!company) {
      throw new Error("ADMIN_PORTAL_COMPANY_ID is set but does not match any company.");
    }
    return configuredCompanyId;
  }

  const firstCompany = await prisma.company.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });
  if (!firstCompany) {
    throw new Error("No company available to attach admin portal identity.");
  }
  return firstCompany.id;
}

async function upsertAdminPortalUser(email: string) {
  const adminEmail = getAdminPortalEmail();
  if (email.trim().toLowerCase() !== adminEmail) {
    return null;
  }

  const companyId = await resolveAdminPortalCompanyId();
  const name = process.env.ADMIN_PORTAL_ACTOR_NAME?.trim() || "Platform Superuser";

  return prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: UserRole.SUPERADMIN,
      companyId,
      isActive: true,
      name,
    },
    create: {
      email: adminEmail,
      name,
      role: UserRole.SUPERADMIN,
      companyId,
      isActive: true,
      emailVerified: new Date(),
    },
  });
}

const baseAdapter = PrismaAdapter(prisma) as Adapter;

const adminPortalAdapter: Adapter = {
  ...baseAdapter,
  async getUserByEmail(email) {
    const baseUser = await baseAdapter.getUserByEmail(email);
    if (baseUser) return baseUser;
    const adminUser = await upsertAdminPortalUser(email);
    return adminUser ?? null;
  },
  async createUser(user) {
    const adminEmail = getAdminPortalEmail();
    const normalized = user.email?.trim().toLowerCase();
    if (normalized === adminEmail) {
      const adminUser = await upsertAdminPortalUser(adminEmail);
      if (adminUser) return adminUser;
    }
    return baseAdapter.createUser(user);
  },
};

type PlatformJWT = JWT & {
  id?: string;
  role?: string;
  companyId?: string;
  companySlug?: string;
  tenantStatus?: string;
  enabledFeatures?: string[];
  subscriptionHealth?: string;
  allowedHosts?: string[];
};

function toTenantStatus(rawStatus: string | undefined, subscriptionActive: boolean): string {
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

export const authOptions: NextAuthOptions = {
  adapter: adminPortalAdapter,
  providers: [
    {
      id: "email",
      type: "email",
      name: "Email",
      from: process.env.ADMIN_MAGIC_LINK_FROM ?? "no-reply@pagka.dev",
      maxAge: 10 * 60,
      async sendVerificationRequest({ identifier, url }: { identifier: string; url: string }) {
        const adminPortalEmail = getAdminPortalEmail();
        if (identifier.trim().toLowerCase() !== adminPortalEmail) {
          throw new Error("Magic link is restricted to the configured admin email.");
        }

        const parsedUrl = new URL(url);
        if (parsedUrl.host !== ADMIN_PORTAL_HOST) {
          throw new Error(`Magic links are restricted to ${ADMIN_PORTAL_HOST}`);
        }

        const subject = "Your Pagka superuser magic link";
        const text = `Use this secure link to sign in: ${url}`;
        const html = `<p>Use this secure link to sign in:</p><p><a href="${url}">Sign in to Superuser Portal</a></p>`;

        const resendApiKey = process.env.ADMIN_MAGIC_LINK_RESEND_API_KEY?.trim();
        if (resendApiKey) {
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${resendApiKey}`,
            },
            body: JSON.stringify({
              from: process.env.ADMIN_MAGIC_LINK_FROM ?? "no-reply@pagka.dev",
              to: [identifier],
              subject,
              text,
              html,
            }),
          });

          if (!response.ok) {
            throw new Error(`Resend delivery failed with status ${response.status}.`);
          }
          return;
        }

        const webhookUrl = process.env.ADMIN_MAGIC_LINK_WEBHOOK_URL?.trim();
        if (webhookUrl) {
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: identifier, subject, text, html }),
          });
          return;
        }

        throw new Error("No magic-link delivery provider configured. Set ADMIN_MAGIC_LINK_RESEND_API_KEY or ADMIN_MAGIC_LINK_WEBHOOK_URL.");
      },
      options: {},
    },
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        const exposeCredentialDebugReason = process.env.NODE_ENV !== "production";
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;

        if (!email || !password) {
          throw new Error("Invalid credentials");
        }

        const hostHeader = getHostHeaderFromRequestHeaders(req?.headers);
        const hostContext = getPlatformHostContext(hostHeader);

        let scopedCompanyId: string | undefined;
        if (hostContext.strictTenantEnforcement) {
          if (hostContext.isCentralHost) {
            throw new Error("TENANT_HOST_REQUIRED");
          }

          const tenant = await resolveTenantFromHost(hostHeader);
          if (!tenant) {
            throw new Error("TENANT_NOT_FOUND");
          }

          if (!isTenantStatusActive(tenant.tenantStatus)) {
            throw new Error("TENANT_INACTIVE");
          }

          scopedCompanyId = tenant.companyId;
        }

        const user = await prisma.user.findFirst({
          where: {
            email: { equals: email, mode: "insensitive" },
            ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
          },
          select: {
            id: true,
            email: true,
            name: true,
            password: true,
            role: true,
            companyId: true,
            isActive: true,
            image: true,
            updatedAt: true,
          }
        });

        if (!user) {
          throw new Error(exposeCredentialDebugReason ? "AUTH_EMAIL_NOT_FOUND" : "Invalid credentials");
        }

        if (!user.password) {
          throw new Error(exposeCredentialDebugReason ? "AUTH_PASSWORD_NOT_SET" : "Invalid credentials");
        }

        if (!user.isActive) {
          throw new Error("Account is inactive");
        }

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
          throw new Error(exposeCredentialDebugReason ? "AUTH_PASSWORD_MISMATCH" : "Invalid credentials");
        }

        if (exposeCredentialDebugReason && matchedCandidate !== password) {
          // Self-heal legacy local hashes that were saved with hidden whitespace/control chars.
          const canonicalPasswordHash = await bcrypt.hash(password, 12);
          await prisma.user.update({
            where: { id: user.id },
            data: { password: canonicalPasswordHash },
          });
        }

        const loginEnabled = await hasFeature(user.companyId, "core.auth.login");
        if (!loginEnabled) {
          throw new Error("Login is disabled for this organization");
        }

        const [tenantClaims, subscriptionHealth] = await Promise.all([
          getTenantClaimsForCompany(user.companyId),
          getSubscriptionHealth(user.companyId),
        ]);
        const effectiveTenantStatus = toTenantStatus(
          tenantClaims.tenantStatus,
          !subscriptionHealth.shouldBlock,
        );
        if (!isTenantStatusActive(effectiveTenantStatus)) {
          throw new Error("TENANT_INACTIVE");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyId: user.companyId,
          image: user.image
        };
      }
    })
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "email") {
        return true;
      }

      const normalizedEmail = user.email?.trim().toLowerCase();
      const adminPortalEmail = getAdminPortalEmail();
      if (!normalizedEmail || normalizedEmail !== adminPortalEmail) {
        return false;
      }

      return normalizedEmail === adminPortalEmail;
    },
    async jwt({ token, user }) {
      const extendedToken = token as PlatformJWT;

      if (user) {
        const typedUser = user as { id: string; role?: string; companyId?: string };
        extendedToken.id = typedUser.id;
        extendedToken.role = typedUser.role ?? extendedToken.role;
        extendedToken.companyId = typedUser.companyId ?? extendedToken.companyId;
      }

      if (extendedToken.companyId) {
        const tenantClaims = await getTenantClaimsForCompany(extendedToken.companyId);
        const [subscriptionHealth, enabledFeatures, allowedHosts] = await Promise.all([
          getSubscriptionHealth(extendedToken.companyId),
          extendedToken.id && extendedToken.role
            ? getEffectiveFeaturesForUser({
                companyId: extendedToken.companyId,
                userId: extendedToken.id,
                role: extendedToken.role,
              })
            : getEnabledFeatureKeys(extendedToken.companyId),
          getAllowedHostsForCompany(extendedToken.companyId),
        ]);
        const subscriptionActive = !subscriptionHealth.shouldBlock;

        extendedToken.companySlug = tenantClaims.companySlug;
        extendedToken.tenantStatus = toTenantStatus(tenantClaims.tenantStatus, subscriptionActive);
        extendedToken.subscriptionHealth = subscriptionHealth.state;
        extendedToken.enabledFeatures = enabledFeatures;
        extendedToken.allowedHosts = allowedHosts;
      }

      return extendedToken;
    },
    async session({ session, token }) {
      if (session.user) {
        const typedToken = token as PlatformJWT;
        session.user = {
          ...session.user,
          id: typedToken.id,
          role: typedToken.role,
          companyId: typedToken.companyId,
          companySlug: typedToken.companySlug,
          tenantStatus: typedToken.tenantStatus,
          enabledFeatures: typedToken.enabledFeatures,
          subscriptionHealth: typedToken.subscriptionHealth,
          allowedHosts: typedToken.allowedHosts,
        } as typeof session.user & {
          id?: string;
          role?: string;
          companyId?: string;
          companySlug?: string;
          tenantStatus?: string;
          enabledFeatures?: string[];
          subscriptionHealth?: string;
          allowedHosts?: string[];
        };
      }
      return session;
    }
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
