/**
 * Huchu Role-Based Offline Enabling
 * ---------------------------------------------------------------------------
 * Not all users need offline capability. This module determines which roles
 * qualify for offline access and which modules they get.
 *
 * Offline-eligible roles:
 *   • CASHIER  — Retail POS operations
 *   • OPERATOR — Scrap metal ticketing (inbound/outbound)
 *   • CLERK    — Scrap metal support (lots, reports)
 *
 * Higher roles (ADMIN, MANAGER, SUPERUSER) are online-only.
 */

import type { AuthSessionClaims } from "@/lib/auth-core/types";

// ── Constants ────────────────────────────────────────────────────────────────

/** Roles that qualify for offline capability */
export const OFFLINE_ELIGIBLE_ROLES = ["CASHIER", "OPERATOR", "CLERK"] as const;

/** Type for offline-eligible role literals */
export type OfflineEligibleRole = (typeof OFFLINE_ELIGIBLE_ROLES)[number];

/** Role to primary vertical mapping */
export const ROLE_VERTICAL_MAP: Record<string, string> = {
  CASHIER: "RETAIL",
  OPERATOR: "SCRAP_METAL",
  CLERK: "SCRAP_METAL",
};

/** Role to module ID filter mapping */
export const ROLE_MODULE_FILTER: Record<string, string[]> = {
  CASHIER: ["retail-pos"],
  OPERATOR: [
    "scrap-metal",
    "scrap-lots",
    "scrap-master-data",
    "scrap-price-board",
    "hr-workforce-core",
  ],
  CLERK: [
    "scrap-metal",
    "scrap-lots",
    "scrap-master-data",
    "scrap-price-board",
    "scrap-reports-snapshot",
    "hr-workforce-core",
  ],
};

// ── TypeScript Interfaces ────────────────────────────────────────────────────

export interface OfflineRoleConfig {
  role: string;
  eligible: boolean;
  vertical: string;
  moduleIds: string[];
  estimatedStorageMb: number;
}

export interface OfflineEligibilityResult {
  eligible: boolean;
  role: string;
  /** Reason for ineligibility */
  reason?: string;
  /** Modules that would be enabled */
  enabledModuleIds: string[];
  /** Estimated storage requirement in MB */
  estimatedStorageMb: number;
}

export interface PrefetchConfig {
  /** Queries to prefetch immediately on login */
  immediateQueries: string[];
  /** Routes to warm immediately */
  immediateRoutes: string[];
  /** Queries to prefetch in background (lower priority) */
  backgroundQueries: string[];
  /** Maximum concurrent prefetch requests */
  maxConcurrentRequests: number;
  /** Whether to prefetch on every online session */
  refreshOnReconnect: boolean;
}

// ── Role Check Functions ─────────────────────────────────────────────────────

/** Check if a role is eligible for offline access */
export function isRoleOfflineEligible(role: string): boolean {
  return OFFLINE_ELIGIBLE_ROLES.includes(role as OfflineEligibleRole);
}

/** Check if a user can enable offline (convenience wrapper) */
export function canEnableOffline(user: { role: string }): boolean {
  return isRoleOfflineEligible(user.role);
}

/** Get the module IDs enabled for a specific role */
export function getOfflineModulesForRole(role: string): string[] {
  return ROLE_MODULE_FILTER[role] ?? [];
}

/** Get the full offline role configuration */
export function getOfflineRoleConfig(role: string): OfflineRoleConfig {
  const moduleIds = getOfflineModulesForRole(role);
  const eligible = isRoleOfflineEligible(role);

  // Rough estimate: ~5MB base + 2MB per module
  const estimatedStorageMb = eligible ? 5 + moduleIds.length * 2 : 0;

  return {
    role,
    eligible,
    vertical: ROLE_VERTICAL_MAP[role] ?? "UNKNOWN",
    moduleIds,
    estimatedStorageMb,
  };
}

/** Check offline eligibility for a user with full details */
export function checkOfflineEligibility(
  user: { role: string } & Record<string, unknown>,
): OfflineEligibilityResult {
  const role = user.role;

  if (!isRoleOfflineEligible(role)) {
    return {
      eligible: false,
      role,
      reason: `Role "${role}" is not enabled for offline access. Offline is available for: ${OFFLINE_ELIGIBLE_ROLES.join(", ")}`,
      enabledModuleIds: [],
      estimatedStorageMb: 0,
    };
  }

  const moduleIds = getOfflineModulesForRole(role);
  const estimatedStorageMb = 5 + moduleIds.length * 2;

  return {
    eligible: true,
    role,
    enabledModuleIds: moduleIds,
    estimatedStorageMb,
  };
}

/** Determine if Service Worker should be registered for this user */
export function shouldRegisterServiceWorker(user: {
  role: string;
}): boolean {
  return canEnableOffline(user);
}

// ── Prefetch Configuration ───────────────────────────────────────────────────

export const ROLE_PREFETCH_CONFIG: Record<string, PrefetchConfig> = {
  CASHIER: {
    immediateQueries: [
      "retail-current-shift",
      "retail-catalog-default",
      "retail-promotions",
      "retail-tender-policy",
    ],
    immediateRoutes: ["/portal/pos", "/portal/pos/overview"],
    backgroundQueries: [
      "retail-pos-customers-default",
      "retail-pos-sales-history",
      "retail-held-carts",
      "retail-pos-sales-overview",
    ],
    maxConcurrentRequests: 4,
    refreshOnReconnect: true,
  },
  OPERATOR: {
    immediateQueries: [
      "scrap-ticket-context",
      "scrap-materials",
      "scrap-sellers",
      "scrap-prices",
      "scrap-batches",
    ],
    immediateRoutes: ["/scrap-metal", "/scrap-metal/tickets"],
    backgroundQueries: [
      "scrap-held-inbound-tickets",
      "scrap-held-outbound-tickets",
      "scrap-purchases-register",
      "scrap-sales-register",
    ],
    maxConcurrentRequests: 6,
    refreshOnReconnect: true,
  },
  CLERK: {
    immediateQueries: [
      "scrap-ticket-context",
      "scrap-materials",
      "scrap-sellers",
      "scrap-batches",
    ],
    immediateRoutes: ["/scrap-metal", "/scrap-metal/tickets"],
    backgroundQueries: [
      "scrap-ready-batches",
      "scrap-unassigned-purchases-page",
      "scrap-balances",
      "scrap-home-daily-snapshot",
    ],
    maxConcurrentRequests: 4,
    refreshOnReconnect: true,
  },
};

/** Get prefetch configuration for a role */
export function getPrefetchConfigForRole(role: string): PrefetchConfig | null {
  return ROLE_PREFETCH_CONFIG[role] ?? null;
}
