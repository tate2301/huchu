import type { AuthStrategyId } from "@/lib/auth-core/types";
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      companyId: string;
      authStrategy?: AuthStrategyId;
      sessionPolicy?: "standard" | "remember" | "admin";
      authExpiresAt?: string;
      rememberMe?: boolean;
      companySlug?: string;
      tenantStatus?: string;
      workspaceProfile?: string;
      enabledFeatures?: string[];
      subscriptionHealth?: string;
      allowedHosts?: string[];
      /** A till session opened with an issued PIN: they choose their own before the till opens (ADM-03). */
      pinMustChange?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: string;
    companyId: string;
    authStrategy?: AuthStrategyId;
    sessionPolicy?: "standard" | "remember" | "admin";
    authExpiresAt?: string;
    rememberMe?: boolean;
    companySlug?: string;
    tenantStatus?: string;
    workspaceProfile?: string;
    enabledFeatures?: string[];
    subscriptionHealth?: string;
    allowedHosts?: string[];
    pinMustChange?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    companyId?: string;
    authStrategy?: AuthStrategyId;
    sessionPolicy?: "standard" | "remember" | "admin";
    authExpiresAt?: string;
    rememberMe?: boolean;
    companySlug?: string;
    tenantStatus?: string;
    workspaceProfile?: string;
    enabledFeatures?: string[];
    subscriptionHealth?: string;
    allowedHosts?: string[];
    pinMustChange?: boolean;
  }
}
