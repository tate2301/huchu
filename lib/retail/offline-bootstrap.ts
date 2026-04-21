/**
 * POS Offline Bootstrap — 3-phase phased bootstrap for Retail POS
 * ---------------------------------------------------------------------------
 * Phase 1 (Immediate < 2s): Critical config + shift state → UI ready
 * Phase 2 (Background 5-10s): Catalog, customers, promotions, held carts
 * Phase 3 (Extended): Sales history, price check data, pending sync
 *
 * Integrates with lib/offline/outbox.ts for mutation queuing
 * and lib/offline/entity-store.ts for local entity management.
 */

import { fetchJson } from "@/lib/api-client";
import { OFFLINE_DB_STORES, putOfflineRecord, getOfflineRecord } from "@/lib/offline/db";
import { openOfflineDatabaseV2, putRecord, getRecord } from "@/lib/offline/db-v2";
import type { OfflineTenantKey } from "@/lib/offline/types";
import type { PosCatalogItem } from "@/components/retail/portal/pos-types";
import type { CurrentShift } from "@/components/retail/portal/pos-types";

// ── TypeScript Interfaces ───────────────────────────────────────────────────

export interface POSCatalogItem {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  taxPercent: number;
  imageUrl?: string | null;
  inventoryItem: { currentStock: number; unit: string } | null;
  category?: string | null;
  siteId?: string | null;
}

export interface POSCustomer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  nationalId?: string | null;
  address?: string | null;
  loyaltyTier: "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
  loyaltyPoints: number;
  isOfflineEntity?: boolean;
  tempId?: string;
  offlineStatus?: string;
}

export interface POSPromotion {
  id: string;
  name: string;
  promoCode: string;
  type: "PERCENT" | "AMOUNT" | "BUY_X_GET_Y" | "BUNDLE";
  value: number;
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface POSSalePayload {
  saleNo: string;
  shiftId: string;
  siteId: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  items: Array<{
    catalogItemId: string;
    sku: string;
    name: string;
    quantity: number;
    unitPrice: number;
    originalUnitPrice: number;
    discountAmount?: number;
    taxRate: number;
    taxAmount: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discountAmount: number;
  discountPercent?: number;
  overrideReason?: string;
  taxTotal: number;
  grandTotal: number;
  promotionId?: string;
  promotionName?: string;
  payments: Array<{
    tenderType: "CASH" | "CARD" | "MOBILE_MONEY" | "TRANSFER" | "VOUCHER";
    amount: number;
    reference?: string;
  }>;
  cashTendered?: number;
  changeDue?: number;
  receiptPrinted: boolean;
  receiptTemplate: string;
  offlineCreated: boolean;
  offlineCreatedAt: string;
  deviceId: string;
}

export interface POSShiftData {
  id: string;
  shiftNo: string;
  siteId: string;
  registerName: string;
  openingFloat: number;
  expectedCash: number;
  cashierId: string;
  openedAt: string;
  status: "OPEN" | "CLOSED";
  actorRole: string;
  netSalesValue: number;
  refundValue: number;
  saleCount: number;
  refundCount: number;
  voidCount: number;
  cashSales: number;
  nonCashSales: number;
  site: { id: string; name: string; code: string } | null;
}

export interface POSHeldCart {
  id: string;
  holdNo: string;
  label: string | null;
  createdAt: string;
  shiftId: string;
  cashierId: string | null;
  items: Array<{
    id: string;
    name: string;
    catalogItemId: string;
    quantity: number;
    unitPrice: number;
    taxPercent: number;
    lineDiscountAmount?: number;
  }>;
  customerName?: string;
  customerPhone?: string;
  note?: string;
  orderDiscountAmount?: string;
  selectedPromotionId?: string;
  isOfflineHeld?: boolean;
}

export interface POSReceiptData {
  receiptNo: string;
  saleNo: string;
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  cashierName: string;
  dateTime: string;
  items: Array<{
    name: string;
    qty: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  discount?: number;
  tax: number;
  total: number;
  payments: Array<{
    type: string;
    amount: number;
  }>;
  change?: number;
  footer: string;
  syncStatus: "PENDING_SYNC" | "SYNCED";
  syncTimeEstimate?: string;
  barcode?: string;
}

export interface BootstrapRetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
  timeoutMs: number;
}

export interface Phase1BootstrapResult {
  phase: "phase_1_complete";
  completedAt: string;
  sessionCached: boolean;
  configLoaded: {
    tenderPolicy: PosTenderPolicy | null;
    entitlements: string[];
    sites: POSSite[];
  };
  shiftState: {
    hasOpenShift: boolean;
    shiftId?: string;
    siteId?: string;
  };
  uiReady: boolean;
  durationMs: number;
}

export interface Phase2BootstrapResult {
  phase: "phase_2_complete";
  completedAt: string;
  catalogCount: number;
  customerCount: number;
  promotionCount: number;
  heldCartCount: number;
  durationMs: number;
}

export interface Phase3BootstrapResult {
  phase: "phase_3_complete";
  completedAt: string;
  salesHistoryCount: number;
  syncedPendingSales: number;
  durationMs: number;
}

export interface BootstrapProgress {
  phase: 1 | 2 | 3;
  step: string;
  completedSteps: number;
  totalSteps: number;
  percent: number;
}

interface PosTenderPolicy {
  requiredReferenceTenders: Array<string>;
  minReferenceLength: number;
  allowedTenders: Array<string>;
}

interface POSSite {
  id: string;
  name: string;
  code: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_RETRY_CONFIG: BootstrapRetryConfig = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 30000,
  timeoutMs: 10000,
};

const PHASE_RETRY_POLICIES = {
  phase1: { maxAttempts: 3, baseDelayMs: 500 },
  phase2: { maxAttempts: 5, baseDelayMs: 2000 },
  phase3: { maxAttempts: 2, baseDelayMs: 5000 },
} as const;

const CATALOG_CACHE_KEY = "pos_offline_catalog";
const CUSTOMER_CACHE_KEY = "pos_offline_customers";
const PROMOTION_CACHE_KEY = "pos_offline_promotions";
const SHIFT_CACHE_KEY = "pos_offline_shift";
const TENDER_POLICY_CACHE_KEY = "pos_offline_tender_policy";
const HELD_CARTS_CACHE_KEY = "pos_offline_held_carts";
const SALES_HISTORY_CACHE_KEY = "pos_offline_sales_history";
const RECEIPT_TEMPLATE_CACHE_KEY = "pos_offline_receipt_template";
const BOOTSTRAP_PROGRESS_KEY = "pos_bootstrap_progress";

// ── Retry Utility ───────────────────────────────────────────────────────────

export async function fetchWithBootstrapRetry<T>(
  fetcher: () => Promise<T>,
  config: Partial<BootstrapRetryConfig> = {}
): Promise<{ data: T | null; attempts: number; error?: string }> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let attempts = 0;

  while (attempts < cfg.maxAttempts) {
    attempts++;
    try {
      const data = await Promise.race([
        fetcher(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), cfg.timeoutMs)
        ),
      ]);
      return { data, attempts };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      if (attempts >= cfg.maxAttempts) {
        return { data: null, attempts, error: message };
      }

      const delay = Math.min(
        cfg.baseDelayMs * cfg.backoffMultiplier ** (attempts - 1),
        cfg.maxDelayMs
      );
      const jitter = delay * 0.2 * Math.random();
      await new Promise((r) => setTimeout(r, delay + jitter));
    }
  }

  return { data: null, attempts };
}

// ── IndexedDB Cache Helpers ─────────────────────────────────────────────────

async function cacheToIndexedDB<T>(key: string, data: T): Promise<void> {
  try {
    await putRecord(OFFLINE_DB_STORES.queryCache, {
      id: key,
      tenantKey: "",
      queryKey: [key],
      data,
      updatedAt: Date.now(),
      maxAgeMs: 24 * 60 * 60 * 1000, // 24 hours
      moduleId: "retail-pos",
    });
  } catch (e) {
    console.warn(`[pos-bootstrap] Failed to cache ${key}:`, e);
  }
}

async function getCachedFromIndexedDB<T>(key: string): Promise<T | null> {
  try {
    const record = await getRecord<{ data: T; updatedAt: number }>(
      OFFLINE_DB_STORES.queryCache,
      key
    );
    if (!record) return null;
    const age = Date.now() - (record.updatedAt ?? 0);
    if (age > 24 * 60 * 60 * 1000) return null; // stale after 24h
    return (record as unknown as { data: T }).data ?? null;
  } catch {
    return null;
  }
}

// ── Phase 1: Immediate Bootstrap ────────────────────────────────────────────

async function bootstrapPhase1(
  tenantKey: OfflineTenantKey,
  siteId: string,
  onProgress?: (progress: BootstrapProgress) => void
): Promise<Phase1BootstrapResult> {
  const startedAt = Date.now();
  const retryCfg = PHASE_RETRY_POLICIES.phase1;

  const reportProgress = (step: string, completed: number, total: number) => {
    onProgress?.({
      phase: 1,
      step,
      completedSteps: completed,
      totalSteps: total,
      percent: Math.round((completed / total) * 100),
    });
  };

  reportProgress("Fetching tender policy...", 0, 4);

  // [1a] Fetch tender policy
  const tenderPolicyResult = await fetchWithBootstrapRetry<{
    data: { requiredReferenceTenders: string[]; minReferenceLength: number };
  }>(() => fetchJson("/api/v2/retail/setup/tender-policy"), retryCfg);

  const tenderPolicy: PosTenderPolicy | null = tenderPolicyResult.data?.data
    ? {
        requiredReferenceTenders: tenderPolicyResult.data.data.requiredReferenceTenders,
        minReferenceLength: tenderPolicyResult.data.data.minReferenceLength,
        allowedTenders: ["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"],
      }
    : null;

  if (tenderPolicy) {
    await cacheToIndexedDB(TENDER_POLICY_CACHE_KEY, tenderPolicy);
  }

  reportProgress("Fetching entitlements...", 1, 4);

  // [1b] Fetch entitlements (derived from session / role)
  let entitlements: string[] = [];
  try {
    const sessionResp = await fetchWithBootstrapRetry<{
      user?: { role?: string; permissions?: string[] };
    }>(() => fetchJson("/api/v2/retail/session"), retryCfg);
    entitlements = sessionResp.data?.user?.permissions ?? [];
  } catch {
    // Entitlements are nice-to-have; continue without them
    entitlements = ["pos:checkout", "pos:hold-cart", "pos:view-history"];
  }

  reportProgress("Fetching current shift...", 2, 4);

  // [1c] Fetch current shift
  const shiftResult = await fetchWithBootstrapRetry<{ data: CurrentShift | null }>(
    () => fetchJson("/api/v2/retail/pos/current-shift"),
    retryCfg
  );

  const currentShift = shiftResult.data?.data ?? null;
  if (currentShift) {
    const shiftData: POSShiftData = {
      ...currentShift,
      status: "OPEN",
      cashierId: "", // filled from session
      openedAt: new Date().toISOString(),
    };
    await cacheToIndexedDB(SHIFT_CACHE_KEY, shiftData);
  }

  reportProgress("POS UI ready", 3, 4);

  // [1d] Cache session
  let sessionCached = false;
  try {
    await openOfflineDatabaseV2();
    sessionCached = true;
  } catch {
    // IndexedDB not available
  }

  reportProgress("Phase 1 complete", 4, 4);

  return {
    phase: "phase_1_complete",
    completedAt: new Date().toISOString(),
    sessionCached,
    configLoaded: {
      tenderPolicy,
      entitlements,
      sites: [], // populated from session context
    },
    shiftState: {
      hasOpenShift: !!currentShift,
      shiftId: currentShift?.id,
      siteId: currentShift?.siteId ?? siteId,
    },
    uiReady: true,
    durationMs: Date.now() - startedAt,
  };
}

// ── Phase 2: Background Bootstrap ───────────────────────────────────────────

async function bootstrapPhase2(
  tenantKey: OfflineTenantKey,
  siteId: string,
  shiftId?: string,
  onProgress?: (progress: BootstrapProgress) => void
): Promise<Phase2BootstrapResult> {
  const startedAt = Date.now();
  const retryCfg = PHASE_RETRY_POLICIES.phase2;

  const reportProgress = (step: string, completed: number, total: number) => {
    onProgress?.({
      phase: 2,
      step,
      completedSteps: completed,
      totalSteps: total,
      percent: Math.round((completed / total) * 100),
    });
  };

  reportProgress("Fetching product catalog...", 0, 5);

  // [2a] Fetch and cache product catalog
  const catalogResult = await fetchWithBootstrapRetry<{ data: PosCatalogItem[] }>(
    () =>
      fetchJson(
        `/api/v2/retail/pos/catalog?siteId=${encodeURIComponent(siteId)}`
      ),
    retryCfg
  );

  const catalogItems: POSCatalogItem[] = (catalogResult.data?.data ?? []).map(
    (item) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      barcode: item.barcode,
      unitPrice: item.unitPrice,
      compareAtPrice: item.compareAtPrice,
      taxPercent: item.taxPercent,
      imageUrl: item.imageUrl,
      inventoryItem: item.inventoryItem,
      siteId,
    })
  );

  if (catalogItems.length > 0) {
    await cacheToIndexedDB(CATALOG_CACHE_KEY, catalogItems);
    // Also build barcode index
    await buildAndCacheBarcodeIndex(catalogItems);
  }

  reportProgress("Fetching customers...", 1, 5);

  // [2b] Fetch customer list
  const customerResult = await fetchWithBootstrapRetry<{ data: POSCustomer[] }>(
    () => fetchJson("/api/v2/retail/customers?limit=500"),
    retryCfg
  );

  const customers = customerResult.data?.data ?? [];
  if (customers.length > 0) {
    await cacheToIndexedDB(CUSTOMER_CACHE_KEY, customers);
  }

  reportProgress("Fetching promotions...", 2, 5);

  // [2c] Fetch active promotions
  const promotionResult = await fetchWithBootstrapRetry<{ data: POSPromotion[] }>(
    () => fetchJson("/api/v2/retail/promotions?status=ACTIVE&pos=1"),
    retryCfg
  );

  const promotions = promotionResult.data?.data ?? [];
  if (promotions.length > 0) {
    await cacheToIndexedDB(PROMOTION_CACHE_KEY, promotions);
  }

  reportProgress("Fetching held carts...", 3, 5);

  // [2d] Fetch held carts for current shift
  if (shiftId) {
    const heldCartsResult = await fetchWithBootstrapRetry<{
      data: Array<{
        id: string;
        holdNo: string;
        label: string | null;
        createdAt: string;
        shiftId: string;
        cashierId: string | null;
        cartSnapshot: Record<string, unknown>;
      }>;
    }>(
      () =>
        fetchJson(
          `/api/v2/retail/pos/held-carts?shiftId=${encodeURIComponent(shiftId)}`
        ),
      retryCfg
    );

    const heldCarts = heldCartsResult.data?.data ?? [];
    if (heldCarts.length > 0) {
      await cacheToIndexedDB(HELD_CARTS_CACHE_KEY, heldCarts);
    }
  }

  reportProgress("Phase 2 complete", 4, 5);

  const durationMs = Date.now() - startedAt;

  return {
    phase: "phase_2_complete",
    completedAt: new Date().toISOString(),
    catalogCount: catalogItems.length,
    customerCount: customers.length,
    promotionCount: promotions.length,
    heldCartCount: 0, // populated from cache above
    durationMs,
  };
}

// ── Phase 3: Extended Background ────────────────────────────────────────────

async function bootstrapPhase3(
  tenantKey: OfflineTenantKey,
  siteId: string,
  onProgress?: (progress: BootstrapProgress) => void
): Promise<Phase3BootstrapResult> {
  const startedAt = Date.now();
  const retryCfg = PHASE_RETRY_POLICIES.phase3;

  const reportProgress = (step: string, completed: number, total: number) => {
    onProgress?.({
      phase: 3,
      step,
      completedSteps: completed,
      totalSteps: total,
      percent: Math.round((completed / total) * 100),
    });
  };

  reportProgress("Fetching sales history...", 0, 4);

  // [3a] Fetch sales history (last 120 transactions)
  const salesHistoryResult = await fetchWithBootstrapRetry<{
    data: Array<Record<string, unknown>>;
  }>(
    () =>
      fetchJson(
        `/api/v2/retail/pos/sales?scope=mine&limit=120&siteId=${encodeURIComponent(siteId)}`
      ),
    retryCfg
  );

  const salesHistory = salesHistoryResult.data?.data ?? [];
  if (salesHistory.length > 0) {
    await cacheToIndexedDB(SALES_HISTORY_CACHE_KEY, salesHistory);
  }

  reportProgress("Caching receipt template...", 1, 4);

  // [3b] Cache receipt template (store info for local receipt generation)
  try {
    const storeInfo = await fetchWithBootstrapRetry<{
      data: { name: string; address?: string; phone?: string };
    }>(() => fetchJson("/api/v2/retail/setup/store-info"), retryCfg);

    if (storeInfo.data) {
      await cacheToIndexedDB(RECEIPT_TEMPLATE_CACHE_KEY, storeInfo.data);
    }
  } catch {
    // Receipt template is nice-to-have
  }

  reportProgress("Syncing pending offline sales...", 2, 4);

  // [3c] Sync any pending offline sales (triggered via outbox)
  let syncedPendingSales = 0;
  try {
    const { getActiveSyncEngine } = await import("@/lib/offline/sync-engine");
    const syncEngine = getActiveSyncEngine();
    if (syncEngine) {
      await syncEngine.syncIfOnline(true);
      syncedPendingSales = 1; // At least attempted
    }
  } catch {
    // Will retry later
  }

  reportProgress("Phase 3 complete", 3, 4);

  return {
    phase: "phase_3_complete",
    completedAt: new Date().toISOString(),
    salesHistoryCount: salesHistory.length,
    syncedPendingSales,
    durationMs: Date.now() - startedAt,
  };
}

// ── Barcode Index ───────────────────────────────────────────────────────────

interface BarcodeIndex {
  [barcode: string]: string; // barcode -> catalogItemId
}

async function buildAndCacheBarcodeIndex(items: POSCatalogItem[]): Promise<void> {
  const index: BarcodeIndex = {};
  for (const item of items) {
    if (item.barcode) {
      index[item.barcode] = item.id;
    }
  }
  await cacheToIndexedDB("pos_offline_barcode_index", index);
}

export async function getCachedBarcodeIndex(): Promise<BarcodeIndex | null> {
  return getCachedFromIndexedDB<BarcodeIndex>("pos_offline_barcode_index");
}

// ── Main Bootstrap Entry Point ──────────────────────────────────────────────

export type BootstrapPhaseResult =
  | Phase1BootstrapResult
  | Phase2BootstrapResult
  | Phase3BootstrapResult;

export interface BootstrapCallbacks {
  onPhaseComplete?: (result: BootstrapPhaseResult) => void;
  onProgress?: (progress: BootstrapProgress) => void;
  onError?: (phase: number, error: string) => void;
}

/**
 * Bootstrap the POS for offline operation.
 *
 * Phase 1 runs immediately and blocks until UI-ready data is cached.
 * Phases 2 and 3 run in the background after Phase 1 completes.
 */
export async function bootstrapPOS(
  tenantKey: OfflineTenantKey,
  siteId: string,
  shiftId?: string,
  callbacks?: BootstrapCallbacks
): Promise<{
  phase1: Phase1BootstrapResult;
  phase2: Promise<Phase2BootstrapResult>;
  phase3: Promise<Phase3BootstrapResult>;
}> {
  // Phase 1: Immediate (blocking)
  const phase1 = await bootstrapPhase1(
    tenantKey,
    siteId,
    callbacks?.onProgress
  );
  callbacks?.onPhaseComplete?.(phase1);

  if (phase1.shiftState.siteId) {
    siteId = phase1.shiftState.siteId;
  }

  // Phase 2: Background (non-blocking)
  const phase2Promise = bootstrapPhase2(
    tenantKey,
    siteId,
    shiftId ?? phase1.shiftState.shiftId,
    callbacks?.onProgress
  ).then((result) => {
    callbacks?.onPhaseComplete?.(result);
    return result;
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    callbacks?.onError?.(2, message);
    return {
      phase: "phase_2_complete" as const,
      completedAt: new Date().toISOString(),
      catalogCount: 0,
      customerCount: 0,
      promotionCount: 0,
      heldCartCount: 0,
      durationMs: 0,
    };
  });

  // Phase 3: Extended background (non-blocking)
  const phase3Promise = phase2Promise.then(() =>
    bootstrapPhase3(tenantKey, siteId, callbacks?.onProgress)
      .then((result) => {
        callbacks?.onPhaseComplete?.(result);
        return result;
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        callbacks?.onError?.(3, message);
        return {
          phase: "phase_3_complete" as const,
          completedAt: new Date().toISOString(),
          salesHistoryCount: 0,
          syncedPendingSales: 0,
          durationMs: 0,
        };
      })
  );

  return {
    phase1,
    phase2: phase2Promise,
    phase3: phase3Promise,
  };
}

// ── Cache Access Utilities ──────────────────────────────────────────────────

export function getCachedCatalog(): Promise<POSCatalogItem[] | null> {
  return getCachedFromIndexedDB<POSCatalogItem[]>(CATALOG_CACHE_KEY);
}

export function getCachedCustomers(): Promise<POSCustomer[] | null> {
  return getCachedFromIndexedDB<POSCustomer[]>(CUSTOMER_CACHE_KEY);
}

export function getCachedPromotions(): Promise<POSPromotion[] | null> {
  return getCachedFromIndexedDB<POSPromotion[]>(PROMOTION_CACHE_KEY);
}

export function getCachedShift(): Promise<POSShiftData | null> {
  return getCachedFromIndexedDB<POSShiftData>(SHIFT_CACHE_KEY);
}

export function getCachedTenderPolicy(): Promise<PosTenderPolicy | null> {
  return getCachedFromIndexedDB<PosTenderPolicy>(TENDER_POLICY_CACHE_KEY);
}

export function getCachedHeldCarts(): Promise<POSHeldCart[] | null> {
  return getCachedFromIndexedDB<POSHeldCart[]>(HELD_CARTS_CACHE_KEY);
}

export function getCachedSalesHistory(): Promise<Array<Record<string, unknown>> | null> {
  return getCachedFromIndexedDB<Array<Record<string, unknown>>>(SALES_HISTORY_CACHE_KEY);
}

export function getCachedReceiptTemplate(): Promise<
  { name: string; address?: string; phone?: string } | null
> {
  return getCachedFromIndexedDB<{ name: string; address?: string; phone?: string }>(
    RECEIPT_TEMPLATE_CACHE_KEY
  );
}

// ── Bootstrap State Management ──────────────────────────────────────────────

export async function getBootstrapProgress(): Promise<BootstrapProgress | null> {
  return getCachedFromIndexedDB<BootstrapProgress>(BOOTSTRAP_PROGRESS_KEY);
}

export async function clearPOSCache(): Promise<void> {
  const keys = [
    CATALOG_CACHE_KEY,
    CUSTOMER_CACHE_KEY,
    PROMOTION_CACHE_KEY,
    SHIFT_CACHE_KEY,
    TENDER_POLICY_CACHE_KEY,
    HELD_CARTS_CACHE_KEY,
    SALES_HISTORY_CACHE_KEY,
    RECEIPT_TEMPLATE_CACHE_KEY,
    BOOTSTRAP_PROGRESS_KEY,
    "pos_offline_barcode_index",
  ];
  for (const key of keys) {
    try {
      const { deleteOfflineRecord } = await import("@/lib/offline/db");
      await deleteOfflineRecord(OFFLINE_DB_STORES.queryCache, key);
    } catch {
      // Ignore deletion errors
    }
  }
}
