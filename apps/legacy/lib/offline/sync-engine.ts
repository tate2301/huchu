/**
 * Huchu Sync Engine v2
 * ---------------------------------------------------------------------------
 * Orchestrates mutation replay from the outbox, handles dependency ordering,
 * implements retry strategies with exponential backoff + jitter, circuit breaker,
 * delta sync, dead letter queue, and Background Sync integration.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  executeBatch,
  findByIndex,
  findOneByIndex,
  getRecord,
  putRecord,
  listRecords,
  DB_STORES,
  type BatchWrite,
  type DeadLetterEntry,
  type LocalEntityRecordV2,
  type OfflineOutboxOperationV2,
  type SyncLogEntry,
  addSyncLogEntry,
  addDeadLetterEntry,
} from "@/lib/offline/db-v2";
import { emitOfflineOutboxChanged } from "@/lib/offline/events";
import {
  getOfflineOutboxSummaryForTenant,
  markOfflineOperationBlockingFailure,
  markOfflineOperationRetryableFailure,
  markOfflineOperationStatus,
  markOfflineOperationSynced,
  resetOfflineOperationToQueued,
  listPendingOfflineOperations,
} from "@/lib/offline/outbox";
import type { OfflineSyncOutcome } from "@/lib/offline/types";

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES = 10;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_MS = 5 * 60 * 1000; // 5 minutes
const ZOMBIE_OPERATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_AUTO_SYNC_INTERVAL_MS = 30_000; // 30 seconds
const DELTA_SYNC_ENABLED = true;

// ── Types ────────────────────────────────────────────────────────────────────

export type SyncEngineState =
  | "idle"
  | "syncing"
  | "degraded"
  | "circuit_open"
  | "offline";

export type SyncOperationOutcome =
  | "synced"
  | "retryable"
  | "blocking"
  | "conflict";

export interface SyncResult {
  syncedCount: number;
  retryableCount: number;
  blockingCount: number;
  conflictCount: number;
  deadLetterCount: number;
  invalidatedQueryKeys: unknown[][];
  durationMs: number;
}

export interface SyncEngineConfig {
  tenantKey: string;
  enabledFeatures?: string[];
  /** Auto-sync interval in ms (0 = disabled) */
  autoSyncIntervalMs?: number;
  /** Max operations per batch */
  batchSize?: number;
  /** Whether to use delta sync */
  enableDeltaSync?: boolean;
}

/** Adapter function signature for syncing a single operation */
export type SyncOperationAdapter = (
  context: {
    operation: OfflineOutboxOperationV2;
    resolvedPayload: Record<string, unknown>;
  },
) => Promise<OfflineSyncOutcome>;

/** Dependency resolver for local references */
export type LocalRefResolver = (
  operation: OfflineOutboxOperationV2,
) => Promise<Record<string, unknown>>;

interface SyncEngineOptions {
  tenantKey: string;
  enabledFeatures?: string[];
  autoSyncIntervalMs: number;
  batchSize: number;
  enableDeltaSync: boolean;
  operationAdapter: SyncOperationAdapter;
  localRefResolver: LocalRefResolver;
  onConnectivityCheck: () => { isOnline: boolean; quality: string };
}

// ── SyncEngine Class ─────────────────────────────────────────────────────────

export class SyncEngine {
  private state: SyncEngineState = "idle";
  private config: SyncEngineOptions;
  private autoSyncTimer: ReturnType<typeof setInterval> | null = null;
  private circuitBreakerFailures = 0;
  private circuitBreakerLastFailure = 0;
  private listeners = new Set<(state: SyncEngineState) => void>();
  private isDestroyed = false;
  private syncInProgress = false;

  constructor(config: SyncEngineOptions) {
    this.config = { ...config };
  }

  // ── State Management ─────────────────────────────────────────────────

  getState(): SyncEngineState {
    return this.state;
  }

  private setState(next: SyncEngineState): void {
    if (this.state === next) return;
    this.state = next;
    this.listeners.forEach((fn) => {
      try {
        fn(next);
      } catch {
        /* ignore listener errors */
      }
    });
  }

  onStateChange(listener: (state: SyncEngineState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  /** Start the sync engine */
  async start(): Promise<void> {
    if (this.isDestroyed) throw new Error("SyncEngine has been destroyed");

    // Run health check on startup
    await this.healthCheck();

    // Listen for connectivity changes
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);
      window.addEventListener(
        "huchu:bg-sync-ready",
        this.handleBackgroundSync,
      );
      document.addEventListener(
        "visibilitychange",
        this.handleVisibilityChange,
      );
    }

    // Start periodic auto-sync
    if (this.config.autoSyncIntervalMs > 0) {
      this.autoSyncTimer = setInterval(
        () => this.syncIfOnline(),
        this.config.autoSyncIntervalMs,
      );
    }

    // Immediate first attempt
    await this.syncIfOnline();
  }

  /** Stop the sync engine (can be restarted with start()) */
  stop(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("offline", this.handleOffline);
      window.removeEventListener(
        "huchu:bg-sync-ready",
        this.handleBackgroundSync,
      );
      document.removeEventListener(
        "visibilitychange",
        this.handleVisibilityChange,
      );
    }
    this.setState("idle");
  }

  /** Destroy the engine — cannot be restarted */
  destroy(): void {
    this.stop();
    this.isDestroyed = true;
    this.listeners.clear();
  }

  // ── Event Handlers ───────────────────────────────────────────────────

  private handleOnline = (): void => {
    this.setState("idle");
    this.syncIfOnline();
  };

  private handleOffline = (): void => {
    this.setState("offline");
  };

  private handleBackgroundSync = (): void => {
    this.syncIfOnline();
  };

  private handleVisibilityChange = (): void => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      this.syncIfOnline();
    }
  };

  // ── Public Sync API ──────────────────────────────────────────────────

  /** Sync if online and not circuit-broken */
  async syncIfOnline(force = false): Promise<SyncResult | null> {
    if (this.isDestroyed) return null;
    if (!force && this.syncInProgress) return null;

    const connectivity = this.config.onConnectivityCheck();
    if (!connectivity.isOnline) {
      this.setState("offline");
      return null;
    }

    if (this.isCircuitOpen() && !force) {
      this.setState("circuit_open");
      return null;
    }

    return this.runSync(force);
  }

  /** Run a full sync cycle */
  async runSync(force = false): Promise<SyncResult> {
    const startTime = performance.now();
    this.syncInProgress = true;
    this.setState("syncing");

    try {
      // 1. Health check: reset zombie operations
      await this.healthCheck();

      // 2. Get pending operations, ordered by priority
      const operations = await this.getOrderedPendingOperations(force);

      const result: SyncResult = {
        syncedCount: 0,
        retryableCount: 0,
        blockingCount: 0,
        conflictCount: 0,
        deadLetterCount: 0,
        invalidatedQueryKeys: [],
        durationMs: 0,
      };

      const syncedOrSkipped = new Set<string>();
      const pendingIds = new Set(operations.map((op) => op.operationId));

      for (const operation of operations) {
        // Check dependencies
        if (!this.dependenciesMet(operation, syncedOrSkipped, pendingIds)) {
          continue;
        }

        // Skip if retry window hasn't elapsed
        if (!force && this.shouldSkipForRetryWindow(operation)) {
          syncedOrSkipped.add(operation.operationId);
          continue;
        }

        // Skip if still syncing
        if (operation.status === "SYNCING") {
          continue;
        }

        // Execute
        const opResult = await this.syncSingleOperation(operation);
        syncedOrSkipped.add(operation.operationId);
        result.invalidatedQueryKeys.push(...opResult.invalidatedQueryKeys);

        switch (opResult.outcome) {
          case "synced":
            result.syncedCount++;
            this.recordCircuitSuccess();
            break;
          case "retryable":
            result.retryableCount++;
            this.recordCircuitFailure();
            break;
          case "blocking":
            result.blockingCount++;
            if (operation.retryCount >= MAX_RETRIES) {
              await this.moveToDeadLetter(
                operation,
                "Max retries exceeded",
              );
              result.deadLetterCount++;
            }
            break;
          case "conflict":
            result.conflictCount++;
            break;
        }
      }

      result.durationMs = Math.round(performance.now() - startTime);

      if (result.retryableCount > 0 || result.blockingCount > 0) {
        this.setState("degraded");
      } else {
        this.setState("idle");
      }

      return result;
    } catch (error) {
      this.setState("degraded");
      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  // ── Single Operation Sync ────────────────────────────────────────────

  private async syncSingleOperation(
    operation: OfflineOutboxOperationV2,
  ): Promise<{
    outcome: SyncOperationOutcome;
    invalidatedQueryKeys: unknown[][];
  }> {
    // Mark as syncing
    await markOfflineOperationStatus(operation.operationId, "SYNCING");

    // Create sync log entry
    const syncLogId = `sync:${operation.operationId}:${Date.now()}`;
    const connectivity = this.config.onConnectivityCheck();
    const syncLogEntry: SyncLogEntry = {
      id: syncLogId,
      tenantKey: operation.tenantKey,
      operationId: operation.operationId,
      moduleId: operation.moduleId,
      operation: operation.operation,
      status: "started",
      startedAt: new Date().toISOString(),
      completedAt: null,
      durationMs: null,
      requestPayload: null,
      responsePayload: null,
      errorMessage: null,
      retryCount: operation.retryCount,
      connectivityState:
        connectivity.quality as SyncLogEntry["connectivityState"],
    };
    await addSyncLogEntry(syncLogEntry);

    try {
      // Resolve local references
      const resolvedPayload = await this.config.localRefResolver(operation);

      // Apply delta sync
      const payloadToSend = this.config.enableDeltaSync
        ? await this.computeDeltaPayload(operation, resolvedPayload)
        : resolvedPayload;

      // Execute through adapter
      const outcome: OfflineSyncOutcome = await this.config.operationAdapter({
        operation,
        resolvedPayload: payloadToSend,
      });

      // Update sync log
      const completedAt = new Date().toISOString();
      await addSyncLogEntry({
        ...syncLogEntry,
        status:
          outcome.status === "synced"
            ? "success"
            : outcome.status === "retryable"
              ? "retryable_failure"
              : outcome.status === "blocking"
                ? "blocking_failure"
                : "retryable_failure",
        completedAt,
        durationMs: Math.round(
          performance.now() - Date.parse(syncLogEntry.startedAt),
        ),
        requestPayload: payloadToSend,
        responsePayload:
          outcome.status === "synced" ? (outcome as any) : null,
        errorMessage:
          outcome.status !== "synced" ? (outcome as any).message : null,
      });

      // Process outcome
      if (outcome.status === "synced") {
        await markOfflineOperationSynced(operation.operationId);

        // Mark entity as synced if applicable
        if (operation.localRefs?.entityId && outcome.serverEntityId) {
          await this.markEntitySynced(
            operation.tenantKey,
            operation.localRefs.entityId,
            outcome.serverEntityId,
          );
        }

        return {
          outcome: "synced",
          invalidatedQueryKeys: outcome.invalidateQueryKeys ?? [],
        };
      }

      if (outcome.status === "retryable") {
        const nextRetryAt = this.computeNextRetryTime(operation.retryCount + 1);
        await markOfflineOperationRetryableFailure(
          operation.operationId,
          outcome.message,
          nextRetryAt,
        );
        return { outcome: "retryable", invalidatedQueryKeys: [] };
      }

      // Blocking
      await markOfflineOperationBlockingFailure(
        operation.operationId,
        outcome.message,
      );
      return {
        outcome: "blocking",
        invalidatedQueryKeys: outcome.invalidateQueryKeys ?? [],
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown sync error";
      const nextRetryAt = this.computeNextRetryTime(operation.retryCount + 1);
      await markOfflineOperationRetryableFailure(
        operation.operationId,
        message,
        nextRetryAt,
      );

      await addSyncLogEntry({
        ...syncLogEntry,
        status: "retryable_failure",
        completedAt: new Date().toISOString(),
        durationMs: Math.round(
          performance.now() - Date.parse(syncLogEntry.startedAt),
        ),
        errorMessage: message,
      });

      return { outcome: "retryable", invalidatedQueryKeys: [] };
    }
  }

  // ── Dependency Resolution ────────────────────────────────────────────

  private dependenciesMet(
    operation: OfflineOutboxOperationV2,
    syncedOrSkipped: Set<string>,
    pendingIds: Set<string>,
  ): boolean {
    if (!operation.dependsOn || operation.dependsOn.length === 0) return true;
    return operation.dependsOn.every(
      (depId) => syncedOrSkipped.has(depId) || !pendingIds.has(depId),
    );
  }

  /** Get pending operations sorted by priority and creation time */
  private async getOrderedPendingOperations(
    force: boolean,
  ): Promise<OfflineOutboxOperationV2[]> {
    const allPending = await listPendingOfflineOperations({
      tenantKey: this.config.tenantKey,
    });

    return allPending
      .filter((op) => {
        if (op.status === "SYNCED") return false;
        if (op.status === "FAILED_BLOCKING" && !force) return false;
        if (op.status === "FAILED_RETRYABLE" && !force) {
          // Only include if retry window has passed
          if (
            op.nextRetryAt &&
            Date.parse(op.nextRetryAt as string) > Date.now()
          ) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (a.syncPriority !== b.syncPriority) {
          return a.syncPriority - b.syncPriority;
        }
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      }) as OfflineOutboxOperationV2[];
  }

  // ── Retry & Circuit Breaker ──────────────────────────────────────────

  private shouldSkipForRetryWindow(
    operation: OfflineOutboxOperationV2,
  ): boolean {
    if (!operation.nextRetryAt) return false;
    return Date.parse(operation.nextRetryAt as string) > Date.now();
  }

  private computeNextRetryTime(retryCount: number): string {
    const baseDelayMs = 5000;
    const maxDelayMs = 15 * 60 * 1000;
    const exponentialMs = Math.min(maxDelayMs, baseDelayMs * 2 ** retryCount);
    const jitterMs = Math.random() * exponentialMs;
    const delayMs = Math.floor(jitterMs);
    return new Date(Date.now() + delayMs).toISOString();
  }

  private isCircuitOpen(): boolean {
    if (this.circuitBreakerFailures < CIRCUIT_BREAKER_THRESHOLD) return false;
    const timeSinceLastFailure = Date.now() - this.circuitBreakerLastFailure;
    return timeSinceLastFailure < CIRCUIT_BREAKER_RESET_MS;
  }

  private recordCircuitFailure(): void {
    this.circuitBreakerFailures++;
    this.circuitBreakerLastFailure = Date.now();
  }

  private recordCircuitSuccess(): void {
    if (this.circuitBreakerFailures > 0) {
      this.circuitBreakerFailures--;
    }
  }

  // ── Delta Sync ───────────────────────────────────────────────────────

  private async computeDeltaPayload(
    operation: OfflineOutboxOperationV2,
    fullPayload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!DELTA_SYNC_ENABLED) return fullPayload;
    if (!operation.serverVersion) return fullPayload;

    const entity = operation.localRefs?.entityId
      ? await findOneByIndex<LocalEntityRecordV2>(
          DB_STORES.entityStore,
          "tempId",
          operation.localRefs.entityId,
        )
      : null;

    if (!entity || entity.status !== "SYNCED") {
      return fullPayload;
    }

    const delta: Record<string, unknown> = {};
    let hasChanges = false;

    for (const [key, value] of Object.entries(fullPayload)) {
      const serverValue = entity.payload[key];
      if (JSON.stringify(value) !== JSON.stringify(serverValue)) {
        delta[key] = value;
        hasChanges = true;
      }
    }

    if (entity.serverId) {
      delta.id = entity.serverId;
    }

    return hasChanges ? delta : fullPayload;
  }

  // ── Entity Helpers ───────────────────────────────────────────────────

  private async markEntitySynced(
    tenantKey: string,
    tempId: string,
    serverId: string,
  ): Promise<void> {
    const entity = await findOneByIndex<LocalEntityRecordV2>(
      DB_STORES.entityStore,
      "tempId",
      tempId,
    );
    if (!entity || entity.tenantKey !== tenantKey) return;

    const updated: LocalEntityRecordV2 = {
      ...entity,
      serverId,
      status: "SYNCED",
      versionVector: (entity.versionVector ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    await putRecord(DB_STORES.entityStore, updated);
  }

  // ── Dead Letter Queue ────────────────────────────────────────────────

  private async moveToDeadLetter(
    operation: OfflineOutboxOperationV2,
    reason: string,
  ): Promise<void> {
    const entry: DeadLetterEntry = {
      id: `dlq:${operation.operationId}`,
      tenantKey: operation.tenantKey,
      originalOperationId: operation.operationId,
      moduleId: operation.moduleId,
      operation: operation.operation,
      payload: operation.payload as Record<string, unknown>,
      rejectionReason: reason,
      failureCategory: this.categorizeFailure(
        (operation.lastError as string) || reason,
      ),
      totalRetries: operation.retryCount,
      lastServerError: (operation.lastError as string) || "",
      enqueuedAt: operation.createdAt,
      diedAt: new Date().toISOString(),
      adminNotified: false,
    };

    await addDeadLetterEntry(entry);
    await markOfflineOperationBlockingFailure(
      operation.operationId,
      `MOVED_TO_DLQ: ${reason}`,
    );

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("huchu:dead-letter-added", {
          detail: { entry },
        }),
      );
    }
  }

  private categorizeFailure(
    error: string,
  ): DeadLetterEntry["failureCategory"] {
    const upper = error.toUpperCase();
    if (upper.includes("VALIDATION") || upper.includes("INVALID"))
      return "validation";
    if (
      upper.includes("PERMISSION") ||
      upper.includes("UNAUTHORIZED") ||
      upper.includes("FORBIDDEN")
    )
      return "permissions";
    if (upper.includes("NOT FOUND") || upper.includes("DOES NOT EXIST"))
      return "not_found";
    if (upper.includes("BUSINESS RULE") || upper.includes("CONFLICT"))
      return "business_rule";
    return "unknown";
  }

  // ── Health Monitor ───────────────────────────────────────────────────

  private async healthCheck(): Promise<{
    zombieOperationsReset: number;
    orphanEntities: number;
  }> {
    let zombieOperationsReset = 0;
    let orphanEntities = 0;

    // 1. Reset zombie operations (stuck in SYNCING for >5 minutes)
    const pendingOps = await listPendingOfflineOperations({
      tenantKey: this.config.tenantKey,
    });

    for (const op of pendingOps) {
      if (op.status === "SYNCING" && op.lastAttemptAt) {
        const stuckDuration = Date.now() - Date.parse(op.lastAttemptAt as string);
        if (stuckDuration > ZOMBIE_OPERATION_TIMEOUT_MS) {
          await resetOfflineOperationToQueued(op.operationId);
          zombieOperationsReset++;
          console.warn(
            `[SyncEngine] Zombie operation reset: ${op.operationId}`,
            {
              stuckDurationMs: stuckDuration,
              module: op.moduleId,
              operation: op.operation,
            },
          );
        }
      }
    }

    // 2. Detect orphan entities (LOCAL status with no pending operation)
    try {
      const entities = await findByIndex<LocalEntityRecordV2>(
        DB_STORES.entityStore,
        "tenantKey",
        this.config.tenantKey,
      );
      const pendingOpEntityIds = new Set(
        pendingOps
          .filter((op) => op.localRefs?.entityId)
          .map((op) => op.localRefs!.entityId),
      );

      for (const entity of entities) {
        if (entity.status !== "LOCAL") continue;
        if (!pendingOpEntityIds.has(entity.tempId)) {
          orphanEntities++;
          console.warn(`[SyncEngine] Orphan entity detected: ${entity.id}`);
        }
      }
    } catch {
      // Non-critical
    }

    return { zombieOperationsReset, orphanEntities };
  }
}

// ── Singleton Factory ────────────────────────────────────────────────────────

let activeEngine: SyncEngine | null = null;

export interface CreateSyncEngineParams {
  tenantKey: string;
  enabledFeatures?: string[];
  autoSyncIntervalMs?: number;
  batchSize?: number;
  enableDeltaSync?: boolean;
  /** Required: adapter that executes each operation against the server */
  operationAdapter: SyncOperationAdapter;
  /** Required: resolver for local tempId → serverId references */
  localRefResolver: LocalRefResolver;
  /** Required: function to check current connectivity state */
  onConnectivityCheck: () => { isOnline: boolean; quality: string };
}

export function createSyncEngine(params: CreateSyncEngineParams): SyncEngine {
  if (activeEngine) {
    activeEngine.destroy();
  }
  const options: SyncEngineOptions = {
    tenantKey: params.tenantKey,
    enabledFeatures: params.enabledFeatures,
    autoSyncIntervalMs: params.autoSyncIntervalMs ?? DEFAULT_AUTO_SYNC_INTERVAL_MS,
    batchSize: params.batchSize ?? 5,
    enableDeltaSync: params.enableDeltaSync ?? true,
    operationAdapter: params.operationAdapter,
    localRefResolver: params.localRefResolver,
    onConnectivityCheck: params.onConnectivityCheck,
  };
  activeEngine = new SyncEngine(options);
  return activeEngine;
}

export function getActiveSyncEngine(): SyncEngine | null {
  return activeEngine;
}

export function destroySyncEngine(): void {
  if (activeEngine) {
    activeEngine.destroy();
    activeEngine = null;
  }
}

// ── React Hook ───────────────────────────────────────────────────────────────

export interface UseSyncEngineReturn {
  state: SyncEngineState;
  sync: () => Promise<SyncResult | null>;
  isSyncing: boolean;
  pendingCount: number;
}

export function useSyncEngine(
  engine: SyncEngine | null,
): UseSyncEngineReturn {
  const [state, setState] = useState<SyncEngineState>(
    engine?.getState() ?? "idle",
  );
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!engine) return;

    // Listen for state changes
    const unsubscribe = engine.onStateChange(setState);

    // Listen for outbox changes to update pending count
    const handleOutboxChange = () => {
      // We can't easily get the count here without a tenantKey,
      // so we'll just trigger a re-render and let the UI fetch
      setPendingCount((c) => c + 0); // force re-render context
    };
    window.addEventListener("huchu:offline-outbox-changed", handleOutboxChange);

    return () => {
      unsubscribe();
      window.removeEventListener(
        "huchu:offline-outbox-changed",
        handleOutboxChange,
      );
    };
  }, [engine]);

  const sync = useCallback(async () => {
    if (!engine) return null;
    return engine.syncIfOnline(true);
  }, [engine]);

  return {
    state,
    sync,
    isSyncing: state === "syncing",
    pendingCount,
  };
}
