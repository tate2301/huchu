/**
 * Scrap Metal Offline Bootstrap
 * 3-phase initialization for scrap operators (OPERATOR / CLERK roles)
 *
 * Phase 1 (Immediate < 2s): Critical config + entitlements → show UI
 * Phase 2 (Background 5-10s): Catalog, sellers, pricing, compliance rules
 * Phase 3 (Extended): Historical data, full seller db, price history, sync pending
 */

import { OFFLINE_DB_STORES, putOfflineRecord } from "@/lib/offline/db";
import { emitOfflineBootstrapProgress } from "@/lib/offline/events";
import type { OfflineBootstrapProgress } from "@/lib/offline/types";

import { cacheScrapEntitlements, getCachedScrapEntitlements } from "./offline-entitlements";
import { cacheMaterials } from "./offline-materials";
import { cacheSellers } from "./offline-sellers";
import { cacheComplianceRules } from "./offline-compliance";
import { listOfflineScrapOperations } from "./offline-runtime";

export const SCRAP_OFFLINE_MODULE_ID = "scrap-metal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScrapBootstrapPhase = "phase_1" | "phase_2" | "phase_3" | "complete" | "error";

export interface ScrapBootstrapState {
  tenantKey: string;
  operatorId: string;
  role: "OPERATOR" | "CLERK";
  phase: ScrapBootstrapPhase;
  phase1Complete: boolean;
  phase2Complete: boolean;
  phase3Complete: boolean;
  progress: ScrapBootstrapProgress;
  error?: string;
  startedAt: string;
  phase1CompletedAt?: string;
  phase2CompletedAt?: string;
  phase3CompletedAt?: string;
}

export interface ScrapBootstrapProgress {
  currentStepLabel: string;
  totalSteps: number;
  completedSteps: number;
  percent: number;
}

export interface ScrapBootstrapConfig {
  tenantKey: string;
  operatorId: string;
  role: "OPERATOR" | "CLERK";
  siteId: string;
  companyId: string;
}

export interface ScrapBootstrapResult {
  success: boolean;
  phaseReached: ScrapBootstrapPhase;
  error?: string;
  durationMs: number;
}

// Phase 1 fetchers — critical path
interface ScrapPhase1FetchResult {
  entitlements: Record<string, unknown> | null;
  siteConfig: Record<string, unknown> | null;
  scaleSettings: Record<string, unknown> | null;
}

// Phase 2 fetchers — background
interface ScrapPhase2FetchResult {
  materials: unknown[] | null;
  sellers: unknown[] | null;
  complianceRules: unknown[] | null;
  batchAssignments: unknown[] | null;
}

// Phase 3 fetchers — extended
interface ScrapPhase3FetchResult {
  fullSellers: unknown[] | null;
  historicalPurchases: unknown[] | null;
  priceHistory: unknown[] | null;
  pendingTicketsSynced: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BOOTSTRAP_STATE_ID = "scrap:bootstrap";

const PHASE_1_TIMEOUT_MS = 2000;
const PHASE_2_TIMEOUT_MS = 15000;
const PHASE_3_TIMEOUT_MS = 60000;

const DEFAULT_RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 500,
  backoffMultiplier: 2,
  maxDelayMs: 5000,
};

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------

async function fetchWithRetry<T>(
  fetcher: () => Promise<T>,
  config: Partial<typeof DEFAULT_RETRY_CONFIG> = {},
): Promise<{ data: T | null; attempts: number; error?: string }> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let attempts = 0;

  while (attempts < cfg.maxAttempts) {
    attempts++;
    try {
      const data = await Promise.race([
        fetcher(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), PHASE_1_TIMEOUT_MS),
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
        cfg.maxDelayMs,
      );
      const jitter = delay * 0.2 * Math.random();
      await new Promise((r) => setTimeout(r, delay + jitter));
    }
  }

  return { data: null, attempts };
}

// ---------------------------------------------------------------------------
// Progress tracking
// ---------------------------------------------------------------------------

function makeInitialProgress(totalSteps: number): ScrapBootstrapProgress {
  return {
    currentStepLabel: "Initializing scrap offline mode...",
    totalSteps,
    completedSteps: 0,
    percent: 0,
  };
}

function updateProgress(
  state: ScrapBootstrapState,
  stepLabel: string,
  completedSteps: number,
): ScrapBootstrapProgress {
  const progress: ScrapBootstrapProgress = {
    currentStepLabel: stepLabel,
    totalSteps: state.progress.totalSteps,
    completedSteps: Math.min(completedSteps, state.progress.totalSteps),
    percent: Math.min(
      Math.round((completedSteps / state.progress.totalSteps) * 100),
      100,
    ),
  };
  state.progress = progress;
  return progress;
}

async function persistBootstrapState(state: ScrapBootstrapState) {
  await putOfflineRecord(OFFLINE_DB_STORES.bootstrapState, {
    id: BOOTSTRAP_STATE_ID,
    tenantKey: state.tenantKey,
    ...state,
    updatedAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Phase 1 — Immediate (< 2s)
// ---------------------------------------------------------------------------

async function runPhase1(
  config: ScrapBootstrapConfig,
  state: ScrapBootstrapState,
): Promise<ScrapPhase1FetchResult> {
  state.phase = "phase_1";
  updateProgress(state, "Fetching operator entitlements...", 0);
  emitOfflineBootstrapChanged();

  // 1a — Fetch and cache entitlements (CRITICAL #1 requirement)
  const entitlementsResult = await fetchWithRetry(async () => {
    const res = await fetch(`/api/scrap-metal/entitlements?operatorId=${config.operatorId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });

  if (entitlementsResult.data) {
    await cacheScrapEntitlements(entitlementsResult.data);
  }

  updateProgress(state, "Fetching site configuration...", 1);

  // 1b — Fetch site configuration
  const siteConfigResult = await fetchWithRetry(async () => {
    const res = await fetch(`/api/scrap-metal/sites/${config.siteId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });

  updateProgress(state, "Fetching scale settings...", 2);

  // 1c — Fetch scale settings
  const scaleSettingsResult = await fetchWithRetry(async () => {
    const res = await fetch(`/api/scrap-metal/scale/settings?siteId=${config.siteId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });

  // Cache scale settings to query cache for offline use
  if (scaleSettingsResult.data) {
    await putOfflineRecord(OFFLINE_DB_STORES.queryCache, {
      id: `scrap:scale:settings:${config.siteId}`,
      tenantKey: config.tenantKey,
      queryKey: ["scrap-scale-settings", config.siteId],
      data: scaleSettingsResult.data,
      updatedAt: Date.now(),
      maxAgeMs: 24 * 60 * 60 * 1000,
      moduleId: SCRAP_OFFLINE_MODULE_ID,
    });
  }

  updateProgress(state, "Phase 1 complete — showing scrap interface", 3);

  state.phase1Complete = true;
  state.phase1CompletedAt = new Date().toISOString();
  state.phase = "phase_2";
  await persistBootstrapState(state);
  emitOfflineBootstrapChanged();

  return {
    entitlements: entitlementsResult.data,
    siteConfig: siteConfigResult.data,
    scaleSettings: scaleSettingsResult.data,
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — Background (5-10s)
// ---------------------------------------------------------------------------

async function runPhase2(
  config: ScrapBootstrapConfig,
  state: ScrapBootstrapState,
): Promise<ScrapPhase2FetchResult> {
  const totalSteps = state.progress.totalSteps;
  updateProgress(state, "Fetching materials catalog...", 4);

  // 2a — Materials catalog with pricing
  const materialsResult = await fetchWithRetry(
    async () => {
      const res = await fetch(`/api/scrap-metal/materials?siteId=${config.siteId}&limit=500`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    { maxAttempts: 5, baseDelayMs: 2000 },
  );

  if (materialsResult.data?.data) {
    await cacheMaterials(materialsResult.data.data);
  }

  updateProgress(state, "Fetching seller profiles...", 5);

  // 2b — Seller profiles (top 200 recent)
  const sellersResult = await fetchWithRetry(
    async () => {
      const res = await fetch(`/api/scrap-metal/sellers?limit=200&sort=recent`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    { maxAttempts: 5, baseDelayMs: 2000 },
  );

  if (sellersResult.data?.data) {
    await cacheSellers(sellersResult.data.data);
  }

  updateProgress(state, "Fetching compliance rules...", 6);

  // 2c — Compliance rules
  const complianceResult = await fetchWithRetry(
    async () => {
      const res = await fetch(`/api/scrap-metal/compliance-rules?companyId=${config.companyId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    { maxAttempts: 3, baseDelayMs: 2000 },
  );

  if (complianceResult.data?.data) {
    await cacheComplianceRules(complianceResult.data.data);
  }

  updateProgress(state, "Fetching batch assignments...", 7);

  // 2d — Operator's batch assignments (COLLECTING + READY)
  const batchResult = await fetchWithRetry(
    async () => {
      const res = await fetch(
        `/api/scrap-metal/batches?status=COLLECTING,READY&siteId=${config.siteId}&limit=100`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    { maxAttempts: 3, baseDelayMs: 2000 },
  );

  // Cache batches to query cache
  if (batchResult.data?.data) {
    await putOfflineRecord(OFFLINE_DB_STORES.queryCache, {
      id: `scrap:batches:active:${config.siteId}`,
      tenantKey: config.tenantKey,
      queryKey: ["scrap-batches", config.siteId, "active"],
      data: batchResult.data.data,
      updatedAt: Date.now(),
      maxAgeMs: 60 * 60 * 1000,
      moduleId: SCRAP_OFFLINE_MODULE_ID,
    });
  }

  updateProgress(state, "Phase 2 complete — full offline operation ready", 8);

  state.phase2Complete = true;
  state.phase2CompletedAt = new Date().toISOString();
  state.phase = "phase_3";
  await persistBootstrapState(state);
  emitOfflineBootstrapChanged();

  return {
    materials: materialsResult.data?.data ?? null,
    sellers: sellersResult.data?.data ?? null,
    complianceRules: complianceResult.data?.data ?? null,
    batchAssignments: batchResult.data?.data ?? null,
  };
}

// ---------------------------------------------------------------------------
// Phase 3 — Extended (background, non-blocking)
// ---------------------------------------------------------------------------

async function runPhase3(
  config: ScrapBootstrapConfig,
  state: ScrapBootstrapState,
): Promise<ScrapPhase3FetchResult> {
  const totalSteps = state.progress.totalSteps;

  // 3a — Full seller database (if operator needs more than top 200)
  updateProgress(state, "Fetching extended seller database...", 9);
  const fullSellersResult = await fetchWithRetry(
    async () => {
      const res = await fetch(`/api/scrap-metal/sellers?limit=2000`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    { maxAttempts: 2, baseDelayMs: 5000 },
  );

  if (fullSellersResult.data?.data) {
    await cacheSellers(fullSellersResult.data.data);
  }

  // 3b — Historical purchase data
  updateProgress(state, "Fetching historical purchase data...", 10);
  const historyResult = await fetchWithRetry(
    async () => {
      const res = await fetch(`/api/scrap-metal/purchases?limit=500&siteId=${config.siteId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    { maxAttempts: 2, baseDelayMs: 5000 },
  );

  if (historyResult.data?.data) {
    await putOfflineRecord(OFFLINE_DB_STORES.queryCache, {
      id: `scrap:purchases:history:${config.siteId}`,
      tenantKey: config.tenantKey,
      queryKey: ["scrap-purchases-history", config.siteId],
      data: historyResult.data.data,
      updatedAt: Date.now(),
      maxAgeMs: 24 * 60 * 60 * 1000,
      moduleId: SCRAP_OFFLINE_MODULE_ID,
    });
  }

  // 3c — Price history
  updateProgress(state, "Fetching price history...", 11);
  const priceHistoryResult = await fetchWithRetry(
    async () => {
      const res = await fetch(`/api/scrap-metal/pricing?limit=500&history=true`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    { maxAttempts: 2, baseDelayMs: 5000 },
  );

  if (priceHistoryResult.data?.data) {
    await putOfflineRecord(OFFLINE_DB_STORES.queryCache, {
      id: `scrap:pricing:history`,
      tenantKey: config.tenantKey,
      queryKey: ["scrap-pricing-history"],
      data: priceHistoryResult.data.data,
      updatedAt: Date.now(),
      maxAgeMs: 24 * 60 * 60 * 1000,
      moduleId: SCRAP_OFFLINE_MODULE_ID,
    });
  }

  // 3d — Sync any pending tickets (leftover from previous sessions)
  updateProgress(state, "Syncing pending tickets...", 12);
  const pendingOps = await listOfflineScrapOperations(config.tenantKey);
  const pendingTickets = pendingOps.filter(
    (op) => op.status === "QUEUED" || op.status === "FAILED_RETRYABLE",
  );

  // Trigger background sync if navigator.onLine and there are pending ops
  if (typeof navigator !== "undefined" && navigator.onLine && pendingTickets.length > 0) {
    try {
      await fetch("/api/scrap-metal/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantKey: config.tenantKey, operations: pendingTickets }),
      });
    } catch {
      // Silent fail — will retry later
    }
  }

  updateProgress(state, "Phase 3 complete — all data ready", 13);

  state.phase3Complete = true;
  state.phase3CompletedAt = new Date().toISOString();
  state.phase = "complete";
  await persistBootstrapState(state);
  emitOfflineBootstrapChanged();

  return {
    fullSellers: fullSellersResult.data?.data ?? null,
    historicalPurchases: historyResult.data?.data ?? null,
    priceHistory: priceHistoryResult.data?.data ?? null,
    pendingTicketsSynced: pendingTickets.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Module preparation (for event emission)
// ---------------------------------------------------------------------------

function buildModulePreparation(
  state: ScrapBootstrapState,
): OfflineBootstrapProgress {
  return {
    id: BOOTSTRAP_STATE_ID,
    tenantKey: state.tenantKey,
    phase: state.phase === "complete" ? "complete" : "preparing",
    currentStepLabel: state.progress.currentStepLabel,
    totalSteps: state.progress.totalSteps,
    completedSteps: state.progress.completedSteps,
    preparedRoutes: [],
    startedAt: state.startedAt,
    updatedAt: new Date().toISOString(),
    modules: [
      {
        moduleId: SCRAP_OFFLINE_MODULE_ID,
        primaryFlowLabel: "Scrap Metal Operations",
        bootstrapPriority: 1,
        warmupBudget: "standard",
        state:
          state.phase === "complete"
            ? "PREPARED"
            : state.phase1Complete
              ? "PREPARING"
              : "NOT_PREPARED",
        totalRoutes: 8,
        preparedRoutes: state.phase1Complete
          ? [
              "/scrap-metal",
              "/scrap-metal/tickets/new",
              "/scrap-metal/sellers",
            ]
          : [],
        totalQueries: 10,
        preparedQueryKeys: state.phase2Complete
          ? [
              "scrap-materials",
              "scrap-sellers",
              "scrap-prices",
              "scrap-batches",
              "compliance-rules",
            ]
          : state.phase1Complete
            ? ["scrap-materials"]
            : [],
        lastPreparedAt: state.phase2CompletedAt ?? state.phase1CompletedAt ?? null,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Main entry point: bootstrap the scrap metal offline module.
 * Runs Phase 1 immediately, then Phases 2 and 3 in the background.
 */
export async function bootstrapScrap(
  tenantKey: string,
  operatorId: string,
  options?: {
    role?: "OPERATOR" | "CLERK";
    siteId?: string;
    companyId?: string;
  },
): Promise<ScrapBootstrapResult> {
  const startedAt = performance.now();
  const role = options?.role ?? "OPERATOR";
  const siteId = options?.siteId ?? "";
  const companyId = options?.companyId ?? "";

  const config: ScrapBootstrapConfig = {
    tenantKey,
    operatorId,
    role,
    siteId,
    companyId,
  };

  // Total steps across all phases (Phase 1: 3, Phase 2: 4, Phase 3: 4 + sync)
  const TOTAL_STEPS = 13;

  const state: ScrapBootstrapState = {
    tenantKey,
    operatorId,
    role,
    phase: "phase_1",
    phase1Complete: false,
    phase2Complete: false,
    phase3Complete: false,
    progress: makeInitialProgress(TOTAL_STEPS),
    startedAt: new Date().toISOString(),
  };

  try {
    // ---- Phase 1 (blocking — must complete before UI shows) ----
    await runPhase1(config, state);

    // ---- Phase 2 (background — kicked off immediately after Phase 1) ----
    // Use setTimeout to yield to the UI thread
    setTimeout(() => {
      runPhase2(config, state).catch((error) => {
        console.warn("[Scrap Bootstrap] Phase 2 error (non-critical):", error);
        state.phase2Complete = true;
        state.phase = "phase_3";
      });
    }, 100);

    // ---- Phase 3 (extended background) ----
    setTimeout(() => {
      runPhase3(config, state).catch((error) => {
        console.warn("[Scrap Bootstrap] Phase 3 error (non-critical):", error);
        state.phase3Complete = true;
        state.phase = "complete";
      });
    }, 500);

    const durationMs = Math.round(performance.now() - startedAt);

    return {
      success: true,
      phaseReached: "phase_2",
      durationMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bootstrap failed";
    state.phase = "error";
    state.error = message;
    await persistBootstrapState(state);

    return {
      success: false,
      phaseReached: "error",
      error: message,
      durationMs: Math.round(performance.now() - startedAt),
    };
  }
}

/**
 * Get the current bootstrap state (for UI to check progress)
 */
export async function getScrapBootstrapState(): Promise<ScrapBootstrapState | null> {
  const { getOfflineRecord } = await import("@/lib/offline/db");
  const state = await getOfflineRecord<ScrapBootstrapState>(
    OFFLINE_DB_STORES.bootstrapState,
    BOOTSTRAP_STATE_ID,
  );
  return state;
}

/**
 * Check if Phase 1 is complete (UI can show)
 */
export async function isScrapPhase1Complete(): Promise<boolean> {
  const state = await getScrapBootstrapState();
  return state?.phase1Complete ?? false;
}

/**
 * Check if full offline operation is ready (Phase 2 complete)
 */
export async function isScrapOfflineReady(): Promise<boolean> {
  const state = await getScrapBootstrapState();
  return state?.phase2Complete ?? false;
}

/**
 * Resume bootstrap from saved state (e.g., after page refresh)
 */
export async function resumeScrapBootstrap(
  tenantKey: string,
  operatorId: string,
): Promise<ScrapBootstrapResult> {
  const state = await getScrapBootstrapState();

  // If we have a persisted state and Phase 1 was done, just re-run what's missing
  if (state?.phase1Complete) {
    // Re-check entitlements (critical)
    const entitlements = await getCachedScrapEntitlements();
    if (!entitlements) {
      // Entitlements lost — re-bootstrap from Phase 1
      return bootstrapScrap(tenantKey, operatorId);
    }

    // Resume Phase 2 if not done
    if (!state.phase2Complete) {
      setTimeout(() => {
        const config: ScrapBootstrapConfig = {
          tenantKey,
          operatorId,
          role: state.role,
          siteId: "",
          companyId: "",
        };
        runPhase2(config, state as ScrapBootstrapState).catch(console.warn);
      }, 100);
    }

    // Resume Phase 3 if not done
    if (!state.phase3Complete) {
      setTimeout(() => {
        const config: ScrapBootstrapConfig = {
          tenantKey,
          operatorId,
          role: state.role,
          siteId: "",
          companyId: "",
        };
        runPhase3(config, state as ScrapBootstrapState).catch(console.warn);
      }, 500);
    }

    return {
      success: true,
      phaseReached: state.phase,
      durationMs: 0,
    };
  }

  // No prior state — full bootstrap
  return bootstrapScrap(tenantKey, operatorId);
}
   durationMs: 0,
    };
  }

  // No prior state — full bootstrap
  return bootstrapScrap(tenantKey, operatorId);
}
