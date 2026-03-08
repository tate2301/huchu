import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import type { JWT } from "next-auth/jwt";
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
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
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
    maxAge: 30 * 60,
    updateAge: 5 * 60,
  },
  jwt: {
    maxAge: 30 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,
};
