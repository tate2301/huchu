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
      id: "otp",
      providerId: "otp",
      label: "One-time passcode",
      description: "Dark-launch OTP strategy reserved for future rollout.",
      surfaces: ["primary-login", "portal-login"],
      enabled: config.enableOtp,
      live: false,
      kind: "otp",
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
