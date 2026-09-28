import { getAuthRuntimeConfig } from "@/lib/auth-core/config";
import type { AuthStrategyDescriptor, AuthStrategyId, AuthSurface } from "@/lib/auth-core/types";

function buildStrategyRegistry(): AuthStrategyDescriptor[] {
  const config = getAuthRuntimeConfig();

  return [
    {
      id: "credentials",
      providerId: "credentials",
      label: "Email and password",
      description: "Standard credentials sign-in for tenant and portal users.",
      surfaces: ["primary-login", "portal-login"],
      enabled: true,
      live: true,
      kind: "password",
      supportsRememberMe: true,
    },
    {
      id: "admin-email-link",
      providerId: "email",
      label: "Admin magic link",
      description: "Restricted magic-link sign-in for the admin portal superuser mailbox.",
      surfaces: ["admin-login"],
      enabled: true,
      live: true,
      kind: "magic-link",
      supportsRememberMe: false,
    },
    {
      id: "email-link",
      providerId: "email-link",
      label: "Email link",
      description: "Dark-launch passwordless sign-in path for non-admin users.",
      surfaces: ["primary-login", "portal-login"],
      enabled: config.enableEmailLink,
      live: false,
      kind: "magic-link",
      supportsRememberMe: false,
    },
    {
      id: "email-code",
      providerId: "email-code",
      label: "Email code",
      description: "A six-digit code sent to the address, for people who never set a password.",
      surfaces: ["primary-login"],
      enabled: true,
      live: true,
      kind: "email-code",
      supportsRememberMe: true,
    },
    {
      // Not a way anyone chooses to sign in: it is how the signup host hands a
      // new admin to their workspace host, where sessions are separate. It
      // appears on no sign-in surface.
      id: "handoff",
      providerId: "handoff",
      label: "Signup handoff",
      description: "A one-use ticket exchanged for a session on the workspace host.",
      surfaces: [],
      enabled: true,
      live: true,
      kind: "handoff",
      supportsRememberMe: false,
    },
  ];
}

export function getAuthStrategyRegistry(): AuthStrategyDescriptor[] {
  return buildStrategyRegistry();
}

export function getAuthStrategyById(strategyId: AuthStrategyId): AuthStrategyDescriptor | undefined {
  return buildStrategyRegistry().find((strategy) => strategy.id === strategyId);
}

export function getAuthStrategiesForSurface(surface: AuthSurface): AuthStrategyDescriptor[] {
  return buildStrategyRegistry().filter((strategy) => strategy.enabled && strategy.surfaces.includes(surface));
}

export function assertStrategyEnabled(strategyId: AuthStrategyId): AuthStrategyDescriptor {
  const strategy = getAuthStrategyById(strategyId);
  if (!strategy || !strategy.enabled) {
    throw new Error("STRATEGY_DISABLED");
  }
  return strategy;
}
