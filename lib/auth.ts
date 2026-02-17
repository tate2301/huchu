import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import type { JWT } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/platform/features";
import {
  getHostHeaderFromRequestHeaders,
  getPlatformHostContext,
  getTenantClaimsForCompany,
  isTenantStatusActive,
  resolveTenantBySlug,
} from "@/lib/platform/tenant";
import { getEnabledFeatureKeys } from "@/lib/platform/entitlements";
import { getSubscriptionHealth } from "@/lib/platform/subscription";
import bcrypt from "bcryptjs";

type PlatformJWT = JWT & {
  id?: string;
  role?: string;
  companyId?: string;
  companySlug?: string;
  tenantStatus?: string;
  enabledFeatures?: string[];
  subscriptionHealth?: string;
};

function toTenantStatus(rawStatus: string | undefined, subscriptionActive: boolean): string {
  const normalizedStatus = rawStatus?.trim().toUpperCase();

  if (normalizedStatus && normalizedStatus !== "ACTIVE") {
    return normalizedStatus;
  }

  return subscriptionActive ? "ACTIVE" : "SUBSCRIPTION_INACTIVE";
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
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;

        if (!email || !password) {
          throw new Error("Invalid credentials");
        }

        const hostHeader = getHostHeaderFromRequestHeaders(req?.headers);
        const hostContext = getPlatformHostContext(hostHeader);

        let scopedCompanyId: string | undefined;
        if (hostContext.strictTenantEnforcement) {
          if (!hostContext.isTenantHost || !hostContext.tenantSlug) {
            throw new Error("TENANT_HOST_REQUIRED");
          }

          const tenant = await resolveTenantBySlug(hostContext.tenantSlug);
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
            image: true
          }
        });

        if (!user || !user.password) {
          throw new Error("Invalid credentials");
        }

        if (!user.isActive) {
          throw new Error("Account is inactive");
        }

        const isCorrectPassword = await bcrypt.compare(password, user.password);

        if (!isCorrectPassword) {
          throw new Error("Invalid credentials");
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
        const [subscriptionHealth, enabledFeatures] = await Promise.all([
          getSubscriptionHealth(extendedToken.companyId),
          getEnabledFeatureKeys(extendedToken.companyId),
        ]);
        const subscriptionActive = !subscriptionHealth.shouldBlock;

        extendedToken.companySlug = tenantClaims.companySlug;
        extendedToken.tenantStatus = toTenantStatus(tenantClaims.tenantStatus, subscriptionActive);
        extendedToken.subscriptionHealth = subscriptionHealth.state;
        extendedToken.enabledFeatures = enabledFeatures;
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
        } as typeof session.user & {
          id?: string;
          role?: string;
          companyId?: string;
          companySlug?: string;
          tenantStatus?: string;
          enabledFeatures?: string[];
          subscriptionHealth?: string;
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
