/**
 * Huchu Offline Initialization Orchestrator
 * ---------------------------------------------------------------------------
 * Coordinates the complete offline infrastructure setup during app mount.
 *
 * Phases:
 *   1. Check eligibility (role-based)
 *   2. Register Service Worker
 *   3. Initialize connectivity detector
 *   4. Bootstrap encrypted session
 *   5. Open IndexedDB v2 (with migration if needed)
 *   6. Start sync engine
 *   7. Start periodic health checks
 *
 * Usage:
 *   import { initOffline } from "@/lib/offline";
 *
 *   // In your app root / provider:
 *   useEffect(() => {
 *     initOffline({ user, tenantKey, accessToken, refreshToken, expiresAt })
 *       .then(result => setOfflineReady(result.enabled));
 *   }, []);
 */

import type { AuthSessionClaims } from "@/lib/auth-core/types";
import {
  checkOfflineEligibility,
  canEnableOffline,
  getPrefetchConfigForRole,
  type OfflineEligibilityResult,
} from "@/lib/offline/offline-eligibility";
import {
  initConnectivityDetector,
  destroyConnectivityDetector,
} from "@/lib/offline/connectivity";
import {
  createSyncEngine,
  destroySyncEngine,
  type SyncOperationAdapter,
  type LocalRefResolver,
} from "@/lib/offline/sync-engine";
import {
  createOfflineSessionManager,
  type OfflineSessionManager,
} from "@/lib/offline/session-manager";
import {
  openOfflineDatabaseV2,
  closeOfflineDatabaseV2,
} from "@/lib/offline/db-v2";
import { startPeriodicHealthCheck, stopPeriodicHealthCheck } from "@/lib/offline/error-handler";
import { emitOfflineSessionChanged } from "@/lib/offline/events";

// ── Types ────────────────────────────────────────────────────────────────────

export type OfflineInitPhase =
  | "checking_eligibility"
  | "registering_sw"
  | "initializing_connectivity"
  | "opening_database"
  | "bootstrapping_session"
  | "starting_sync_engine"
  | "starting_health_checks"
  | "ready"
  | "skipped_not_eligible"
  | "error";

export interface OfflineInitConfig {
  /** Authenticated user claims */
  user: AuthSessionClaims;
  /** Tenant key for scoping */
  tenantKey: string;
  /** Access token for session bootstrap */
  accessToken: string;
  /** Refresh token for silent refresh */
  refreshToken: string;
  /** Token expiry timestamp (ISO) */
  expiresAt: string;
  /** Refresh token expiry (ISO, optional) */
  refreshExpiresAt?: string;
  /** Required: adapter that syncs each outbox operation */
  operationAdapter: SyncOperationAdapter;
  /** Required: resolver for local tempId → serverId references */
  localRefResolver: LocalRefResolver;
  /** Optional: connectivity check override */
  onConnectivityCheck?: () => { isOnline: boolean; quality: string };
  /** Optional: auto-sync interval in ms (default: 30s) */
  autoSyncIntervalMs?: number;
  /** Optional: enable delta sync (default: true) */
  enableDeltaSync?: boolean;
  /** Optional: enable periodic health checks (default: true) */
  enableHealthChecks?: boolean;
  /** Optional: health check interval in ms (default: 5min) */
  healthCheckIntervalMs?: number;
  /** Optional: progress callback */
  onProgress?: (phase: OfflineInitPhase, message: string) => void;
}

export interface OfflineInitResult {
  enabled: boolean;
  eligibility: OfflineEligibilityResult;
  engine?: ReturnType<typeof createSyncEngine>;
  sessionManager?: OfflineSessionManager;
  error?: string;
  phase: OfflineInitPhase;
}

// ── Helper ───────────────────────────────────────────────────────────────────

function reportProgress(
  onProgress: ((phase: OfflineInitPhase, message: string) => void) | undefined,
  phase: OfflineInitPhase,
  message: string,
): void {
  onProgress?.(phase, message);
}

// ── Default Connectivity Check ───────────────────────────────────────────────

function defaultConnectivityCheck(): { isOnline: boolean; quality: string } {
  if (typeof navigator === "undefined") {
    return { isOnline: false, quality: "offline" };
  }

  // Try to use the enhanced detector first
  try {
    const { getCurrentConnectivityState } = require("@/lib/offline/connectivity");
    const state = getCurrentConnectivityState();
    return { isOnline: state.isOnline, quality: state.quality };
  } catch {
    // Fall back to navigator.onLine
    return {
      isOnline: navigator.onLine,
      quality: navigator.onLine ? "online" : "offline",
    };
  }
}

// ── Main Orchestrator ────────────────────────────────────────────────────────

/**
 * Initialize the complete offline infrastructure.
 *
 * Call this once on app mount when you have an authenticated session.
 * It handles role-based gating, Service Worker registration, database
 * setup, session encryption, sync engine startup, and health monitoring.
 *
 * Returns an `OfflineInitResult` with `enabled` flag and references to
 * the created engine / session manager for use with React hooks.
 */
export async function initOffline(
  config: OfflineInitConfig,
): Promise<OfflineInitResult> {
  const {
    user,
    tenantKey,
    onProgress,
    operationAdapter,
    localRefResolver,
    onConnectivityCheck,
    autoSyncIntervalMs,
    enableDeltaSync,
    enableHealthChecks,
    healthCheckIntervalMs,
  } = config;

  // ── Phase 1: Check eligibility ───────────────────────────────────────
  reportProgress(onProgress, "checking_eligibility", "Checking offline eligibility...");

  const eligibility = checkOfflineEligibility(user);

  if (!eligibility.eligible) {
    reportProgress(
      onProgress,
      "skipped_not_eligible",
      eligibility.reason || "Not eligible for offline",
    );
    return { enabled: false, eligibility, phase: "skipped_not_eligible" };
  }

  try {
    // ── Phase 2: Register Service Worker ─────────────────────────────
    reportProgress(onProgress, "registering_sw", "Registering offline service worker...");

    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "imports",
        });

        // Handle updates
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              window.dispatchEvent(
                new CustomEvent("huchu:sw-update-available"),
              );
            }
          });
        });

        // Listen for SW messages
        navigator.serviceWorker.addEventListener("message", (event) => {
          switch (event.data?.type) {
            case "BACKGROUND_SYNC_TRIGGERED":
              window.dispatchEvent(
                new CustomEvent("huchu:bg-sync-ready"),
              );
              break;
            case "PROACTIVE_SYNC_TRIGGERED":
              window.dispatchEvent(
                new CustomEvent("huchu:proactive-sync-ready"),
              );
              break;
            case "CATALOG_REFRESHED":
              window.dispatchEvent(
                new CustomEvent("huchu:invalidate-query", {
                  detail: { url: event.data.url },
                }),
              );
              break;
          }
        });

        // Request background sync registration
        if ("sync" in registration) {
          try {
            await (registration as any).sync.register("huchu-outbox-sync");
          } catch {
            // Graceful degradation — will use online event fallback
          }
        }
      } catch (swError) {
        console.warn("[initOffline] Service Worker registration failed:", swError);
        // Continue without SW — app will still work with degraded sync
      }
    }

    // ── Phase 3: Initialize connectivity detector ────────────────────
    reportProgress(
      onProgress,
      "initializing_connectivity",
      "Initializing connectivity monitoring...",
    );

    if (typeof window !== "undefined") {
      initConnectivityDetector();
    }

    // ── Phase 4: Open IndexedDB v2 ───────────────────────────────────
    reportProgress(onProgress, "opening_database", "Opening offline database...");

    await openOfflineDatabaseV2();

    // ── Phase 5: Bootstrap encrypted session ─────────────────────────
    reportProgress(
      onProgress,
      "bootstrapping_session",
      "Securing offline session...",
    );

    const sessionManager = createOfflineSessionManager(tenantKey);

    await sessionManager.bootstrapSession({
      user,
      accessToken: config.accessToken,
      refreshToken: config.refreshToken,
      expiresAt: config.expiresAt,
      refreshExpiresAt: config.refreshExpiresAt,
    });

    // If offline-capable role, extend session immediately
    if (canEnableOffline(user)) {
      await sessionManager.extendSessionFromActivity();
    }

    // ── Phase 6: Start sync engine ───────────────────────────────────
    reportProgress(
      onProgress,
      "starting_sync_engine",
      "Starting sync engine...",
    );

    const connectivityCheck =
      onConnectivityCheck ?? defaultConnectivityCheck;

    const engine = createSyncEngine({
      tenantKey,
      enabledFeatures: user.enabledFeatures,
      autoSyncIntervalMs: autoSyncIntervalMs ?? 30_000,
      batchSize: 5,
      enableDeltaSync: enableDeltaSync ?? true,
      operationAdapter,
      localRefResolver,
      onConnectivityCheck: connectivityCheck,
    });

    await engine.start();

    // ── Phase 7: Start health checks ─────────────────────────────────
    reportProgress(
      onProgress,
      "starting_health_checks",
      "Starting health monitoring...",
    );

    if (enableHealthChecks !== false) {
      startPeriodicHealthCheck(tenantKey, healthCheckIntervalMs);
    }

    // ── Phase 8: Ready ───────────────────────────────────────────────
    reportProgress(onProgress, "ready", "Offline mode ready");

    return {
      enabled: true,
      eligibility,
      engine,
      sessionManager,
      phase: "ready",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Offline initialization failed";
    reportProgress(onProgress, "error", message);

    // Clean up partial initialization
    destroySyncEngine();
    destroyConnectivityDetector();
    stopPeriodicHealthCheck();

    return {
      enabled: false,
      eligibility,
      error: message,
      phase: "error",
    };
  }
}
