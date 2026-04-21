/**
 * Operator Entitlements Cache — CRITICAL PATH
 * This is the #1 requirement: operator entitlements MUST work offline.
 *
 * Caches operator permissions during bootstrap and provides
 * synchronous entitlement checks for UI gating.
 */

import { OFFLINE_DB_STORES, getOfflineRecord, putOfflineRecord } from "@/lib/offline/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OperatorEntitlements {
  /** Can create purchase (inbound) tickets */
  canCreatePurchase: boolean;
  /** Can create sale (outbound) tickets */
  canCreateSale: boolean;
  /** Can approve payout amounts */
  canApprovePayout: boolean;
  /** Can view reports and dashboards */
  canViewReports: boolean;
  /** Can override prices with reason */
  canOverridePrices: boolean;
  /** Can create new sellers */
  canCreateSeller: boolean;
  /** Can hold tickets as DRAFT */
  canHoldTicket: boolean;
  /** Maximum payout amount per transaction (0 = unlimited) */
  maxPayoutLimit: number;
  /** Daily payout limit */
  maxDailyPayout: number;
  /** Role: OPERATOR or CLERK */
  role: "OPERATOR" | "CLERK";
  /** Site IDs this operator can access */
  siteIds: string[];
  /** Material categories allowed */
  allowedCategories: string[];
  /** Cached at timestamp */
  cachedAt: string;
  /** Expires at timestamp (default: 24h) */
  expiresAt: string;
}

export type EntitlementCheckResult = {
  allowed: boolean;
  reason?: string;
  limit?: number;
  currentUsage?: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTITLEMENTS_CACHE_KEY = "scrap:operator:entitlements";
const ENTITLEMENTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const ENTITLEMENTS_EXPIRY_WARNING_MS = 20 * 60 * 60 * 1000; // Warn at 20h

// ---------------------------------------------------------------------------
// Cache operations
// ---------------------------------------------------------------------------

/**
 * Cache operator entitlements to IndexedDB.
 * Called during Phase 1 bootstrap.
 */
export async function cacheEntitlements(
  entitlements: OperatorEntitlements | Record<string, unknown>,
): Promise<void> {
  const normalized = normalizeEntitlements(entitlements);
  const now = Date.now();

  const record = {
    id: ENTITLEMENTS_CACHE_KEY,
    ...normalized,
    cachedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ENTITLEMENTS_CACHE_TTL_MS).toISOString(),
  };

  await putOfflineRecord(OFFLINE_DB_STORES.queryCache, {
    id: ENTITLEMENTS_CACHE_KEY,
    tenantKey: "",
    queryKey: ["scrap-operator-entitlements"],
    data: record,
    updatedAt: now,
    maxAgeMs: ENTITLEMENTS_CACHE_TTL_MS,
    moduleId: "scrap-metal",
  });
}

/**
 * Alias for cacheEntitlements — used by bootstrap module.
 */
export async function cacheScrapEntitlements(
  entitlements: Record<string, unknown>,
): Promise<void> {
  return cacheEntitlements(entitlements);
}

/**
 * Get cached entitlements from IndexedDB.
 * Returns null if not cached or expired.
 */
export async function getEntitlements(): Promise<OperatorEntitlements | null> {
  return getCachedScrapEntitlements();
}

/**
 * Alias for getEntitlements — used by bootstrap module.
 */
export async function getCachedScrapEntitlements(): Promise<OperatorEntitlements | null> {
  const record = await getOfflineRecord<{
    data: OperatorEntitlements;
    updatedAt: number;
    maxAgeMs: number;
  }>(OFFLINE_DB_STORES.queryCache, ENTITLEMENTS_CACHE_KEY);

  if (!record?.data) return null;

  // Check expiry
  const ageMs = Date.now() - record.updatedAt;
  if (ageMs > record.maxAgeMs) {
    console.warn("[Scrap Entitlements] Cached entitlements have expired. Re-bootstrap needed.");
    return null;
  }

  return record.data;
}

/**
 * Check if cached entitlements are still valid (not expired).
 */
export async function areEntitlementsValid(): Promise<boolean> {
  const entitlements = await getCachedScrapEntitlements();
  if (!entitlements) return false;

  const expiresAt = new Date(entitlements.expiresAt).getTime();
  return Date.now() < expiresAt;
}

/**
 * Get entitlements expiry status for UI warning indicators.
 */
export async function getEntitlementsExpiryStatus(): Promise<{
  valid: boolean;
  expired: boolean;
  warning: boolean; // Will expire soon
  ageMs: number;
  remainingMs: number;
}> {
  const record = await getOfflineRecord<{
    data: OperatorEntitlements;
    updatedAt: number;
    maxAgeMs: number;
  }>(OFFLINE_DB_STORES.queryCache, ENTITLEMENTS_CACHE_KEY);

  if (!record?.data) {
    return { valid: false, expired: true, warning: false, ageMs: Infinity, remainingMs: 0 };
  }

  const ageMs = Date.now() - record.updatedAt;
  const remainingMs = record.maxAgeMs - ageMs;
  const expired = remainingMs <= 0;
  const warning = !expired && remainingMs < ENTITLEMENTS_EXPIRY_WARNING_MS;

  return {
    valid: !expired,
    expired,
    warning,
    ageMs,
    remainingMs: Math.max(0, remainingMs),
  };
}

// ---------------------------------------------------------------------------
// Permission checks
// ---------------------------------------------------------------------------

/**
 * Check if operator can create purchase (inbound) tickets.
 */
export async function canCreatePurchase(): Promise<EntitlementCheckResult> {
  const entitlements = await getCachedScrapEntitlements();
  if (!entitlements) {
    return { allowed: false, reason: "Entitlements not loaded — re-sync required" };
  }

  // CLERK role is treated identically to OPERATOR for scrap
  const allowed =
    entitlements.canCreatePurchase &&
    (entitlements.role === "OPERATOR" || entitlements.role === "CLERK");

  return {
    allowed,
    reason: allowed ? undefined : "You do not have permission to create purchase tickets",
    limit: entitlements.maxPayoutLimit > 0 ? entitlements.maxPayoutLimit : undefined,
  };
}

/**
 * Check if operator can create sale (outbound) tickets.
 */
export async function canCreateSale(): Promise<EntitlementCheckResult> {
  const entitlements = await getCachedScrapEntitlements();
  if (!entitlements) {
    return { allowed: false, reason: "Entitlements not loaded — re-sync required" };
  }

  const allowed =
    entitlements.canCreateSale &&
    (entitlements.role === "OPERATOR" || entitlements.role === "CLERK");

  return {
    allowed,
    reason: allowed ? undefined : "You do not have permission to create sale tickets",
  };
}

/**
 * Check if operator can approve payouts.
 */
export async function canApprovePayout(): Promise<EntitlementCheckResult> {
  const entitlements = await getCachedScrapEntitlements();
  if (!entitlements) {
    return { allowed: false, reason: "Entitlements not loaded — re-sync required" };
  }

  return {
    allowed: entitlements.canApprovePayout,
    reason: entitlements.canApprovePayout
      ? undefined
      : "Payout approval requires manager privileges",
    limit: entitlements.maxPayoutLimit > 0 ? entitlements.maxPayoutLimit : undefined,
  };
}

/**
 * Check if operator can view reports.
 */
export async function canViewReports(): Promise<EntitlementCheckResult> {
  const entitlements = await getCachedScrapEntitlements();
  if (!entitlements) {
    return { allowed: false, reason: "Entitlements not loaded — re-sync required" };
  }

  return {
    allowed: entitlements.canViewReports,
    reason: entitlements.canViewReports ? undefined : "Report access is restricted",
  };
}

/**
 * Check if operator can create sellers.
 */
export async function canCreateSeller(): Promise<EntitlementCheckResult> {
  const entitlements = await getCachedScrapEntitlements();
  if (!entitlements) {
    return { allowed: false, reason: "Entitlements not loaded — re-sync required" };
  }

  return {
    allowed: entitlements.canCreateSeller,
    reason: entitlements.canCreateSeller ? undefined : "Seller creation is restricted",
  };
}

/**
 * Check if operator can hold (DRAFT) tickets.
 */
export async function canHoldTicket(): Promise<EntitlementCheckResult> {
  const entitlements = await getCachedScrapEntitlements();
  if (!entitlements) {
    return { allowed: false, reason: "Entitlements not loaded — re-sync required" };
  }

  return {
    allowed: entitlements.canHoldTicket,
    reason: entitlements.canHoldTicket ? undefined : "Holding tickets is not permitted",
  };
}

/**
 * Check if operator can override prices.
 */
export async function canOverridePrices(): Promise<EntitlementCheckResult> {
  const entitlements = await getCachedScrapEntitlements();
  if (!entitlements) {
    return { allowed: false, reason: "Entitlements not loaded — re-sync required" };
  }

  return {
    allowed: entitlements.canOverridePrices,
    reason: entitlements.canOverridePrices ? undefined : "Price override requires elevated permissions",
  };
}

// ---------------------------------------------------------------------------
// Limit checks
// ---------------------------------------------------------------------------

/**
 * Get the maximum payout limit for this operator.
 * Returns 0 if unlimited.
 */
export async function getMaxPayoutLimit(): Promise<number> {
  const entitlements = await getCachedScrapEntitlements();
  return entitlements?.maxPayoutLimit ?? 0;
}

/**
 * Get the daily payout limit.
 */
export async function getMaxDailyPayout(): Promise<number> {
  const entitlements = await getCachedScrapEntitlements();
  return entitlements?.maxDailyPayout ?? 0;
}

/**
 * Check if a proposed payout amount is within the operator's limit.
 */
export async function isPayoutWithinLimit(amount: number): Promise<EntitlementCheckResult> {
  const entitlements = await getCachedScrapEntitlements();
  if (!entitlements) {
    return { allowed: false, reason: "Entitlements not loaded" };
  }

  if (entitlements.maxPayoutLimit <= 0) {
    return { allowed: true, limit: 0 }; // Unlimited
  }

  const allowed = amount <= entitlements.maxPayoutLimit;
  return {
    allowed,
    limit: entitlements.maxPayoutLimit,
    reason: allowed
      ? undefined
      : `Payout amount $${amount.toFixed(2)} exceeds your limit of $${entitlements.maxPayoutLimit.toFixed(2)}`,
  };
}

/**
 * Check if operator can access a specific site.
 */
export async function canAccessSite(siteId: string): Promise<boolean> {
  const entitlements = await getCachedScrapEntitlements();
  if (!entitlements) return false;
  if (entitlements.siteIds.length === 0) return true; // All sites
  return entitlements.siteIds.includes(siteId);
}

/**
 * Check if operator can use a specific material category.
 */
export async function canUseCategory(category: string): Promise<boolean> {
  const entitlements = await getCachedScrapEntitlements();
  if (!entitlements) return false;
  if (entitlements.allowedCategories.length === 0) return true; // All categories
  return entitlements.allowedCategories.includes(category);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize entitlements from various API response shapes into the standard format.
 */
function normalizeEntitlements(
  input: OperatorEntitlements | Record<string, unknown>,
): OperatorEntitlements {
  const defaults: OperatorEntitlements = {
    canCreatePurchase: true,
    canCreateSale: false,
    canApprovePayout: false,
    canViewReports: false,
    canOverridePrices: false,
    canCreateSeller: true,
    canHoldTicket: true,
    maxPayoutLimit: 0,
    maxDailyPayout: 0,
    role: "OPERATOR",
    siteIds: [],
    allowedCategories: [],
    cachedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ENTITLEMENTS_CACHE_TTL_MS).toISOString(),
  };

  if ("canCreatePurchase" in input) {
    return { ...defaults, ...(input as Partial<OperatorEntitlements>) } as OperatorEntitlements;
  }

  // Handle nested API response shapes
  const source = input as Record<string, unknown>;
  return {
    ...defaults,
    canCreatePurchase: Boolean(source.canCreatePurchase ?? source.canCreateTickets ?? true),
    canCreateSale: Boolean(source.canCreateSale ?? source.canManageSales ?? false),
    canApprovePayout: Boolean(source.canApprovePayout ?? false),
    canViewReports: Boolean(source.canViewReports ?? false),
    canOverridePrices: Boolean(source.canOverridePrices ?? false),
    canCreateSeller: Boolean(source.canCreateSeller ?? true),
    canHoldTicket: Boolean(source.canHoldTicket ?? true),
    maxPayoutLimit: Number(source.maxPayoutLimit ?? source.payoutLimit ?? 0),
    maxDailyPayout: Number(source.maxDailyPayout ?? source.dailyPayoutLimit ?? 0),
    role: (source.role as "OPERATOR" | "CLERK") ?? "OPERATOR",
    siteIds: Array.isArray(source.siteIds) ? (source.siteIds as string[]) : [],
    allowedCategories: Array.isArray(source.allowedCategories)
      ? (source.allowedCategories as string[])
      : [],
  };
}
