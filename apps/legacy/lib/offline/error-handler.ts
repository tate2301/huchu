/**
 * Huchu Error Handling & Reliability
 * ---------------------------------------------------------------------------
 * Comprehensive error categorization, recovery strategies, health monitoring,
 * and self-repair for the offline infrastructure.
 *
 * Features:
 *   • 8-category error classification
 *   • Recovery strategies per error type
 *   • Self-repairing health check
 *   • Health score computation (0-100)
 *   • React hook for health monitoring
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  listRecords,
  countRecords,
  deleteRecord,
  findByIndex,
  DB_STORES,
  openOfflineDatabaseV2,
  type DeadLetterEntry,
  type LocalEntityRecordV2,
  type OfflineOutboxOperationV2,
  type SyncLogEntry,
} from "@/lib/offline/db-v2";

// ── Error Categorization ─────────────────────────────────────────────────────

export type ErrorCategory =
  | "network"
  | "server"
  | "auth"
  | "validation"
  | "business_rule"
  | "storage"
  | "crypto"
  | "unknown";

export type ErrorSeverity =
  | "recoverable"
  | "degraded"
  | "critical"
  | "fatal";

export interface ClassifiedError {
  category: ErrorCategory;
  severity: ErrorSeverity;
  originalError: Error;
  message: string;
  /** Recommended action */
  action: string;
  /** Whether to retry automatically */
  autoRetry: boolean;
  /** Maximum retry attempts for this error category */
  maxRetries: number;
}

// ── Error Classifier ─────────────────────────────────────────────────────────

export function classifyError(error: unknown): ClassifiedError {
  const originalError =
    error instanceof Error ? error : new Error(String(error));
  const message = originalError.message;
  const statusCode = extractStatusCode(error);

  // Server errors by status code
  if (statusCode) {
    if (statusCode >= 500) {
      return {
        category: "server",
        severity: "recoverable",
        originalError,
        message: `Server error (${statusCode}). Please try again.`,
        action: "Retry automatically",
        autoRetry: true,
        maxRetries: 10,
      };
    }
    if (statusCode === 429) {
      return {
        category: "server",
        severity: "recoverable",
        originalError,
        message: "Rate limited. Waiting before retry.",
        action: "Wait and retry with exponential backoff",
        autoRetry: true,
        maxRetries: 20,
      };
    }
    if (statusCode === 401) {
      return {
        category: "auth",
        severity: "critical",
        originalError,
        message: "Session expired. Please log in again.",
        action: "Redirect to login",
        autoRetry: false,
        maxRetries: 0,
      };
    }
    if (statusCode === 403) {
      return {
        category: "auth",
        severity: "critical",
        originalError,
        message: "Permission denied.",
        action: "Request permission or contact admin",
        autoRetry: false,
        maxRetries: 0,
      };
    }
    if (statusCode === 409) {
      return {
        category: "business_rule",
        severity: "degraded",
        originalError,
        message: "Conflict with existing data.",
        action: "Review and resolve conflict",
        autoRetry: false,
        maxRetries: 0,
      };
    }
    if (statusCode === 422) {
      return {
        category: "validation",
        severity: "critical",
        originalError,
        message: `Validation failed: ${message}`,
        action: "Fix the data and retry",
        autoRetry: false,
        maxRetries: 0,
      };
    }
    if (statusCode === 404) {
      return {
        category: "business_rule",
        severity: "critical",
        originalError,
        message: "Resource not found. It may have been deleted.",
        action: "Verify the resource exists",
        autoRetry: false,
        maxRetries: 0,
      };
    }
  }

  // Network errors (no status code)
  if (isNetworkError(originalError)) {
    return {
      category: "network",
      severity: "recoverable",
      originalError,
      message:
        "Network unavailable. Changes saved locally and will sync automatically.",
      action: "Wait for connectivity and auto-retry",
      autoRetry: true,
      maxRetries: Infinity,
    };
  }

  // IndexedDB / storage errors
  if (isStorageError(originalError)) {
    return {
      category: "storage",
      severity: "critical",
      originalError,
      message: "Local storage error. Data may not be saved.",
      action: "Check browser storage permissions or clear space",
      autoRetry: false,
      maxRetries: 0,
    };
  }

  // Crypto errors
  if (isCryptoError(originalError)) {
    return {
      category: "crypto",
      severity: "fatal",
      originalError,
      message: "Session encryption failed. Please log in again.",
      action: "Re-authenticate",
      autoRetry: false,
      maxRetries: 0,
    };
  }

  // Default: unknown
  return {
    category: "unknown",
    severity: "degraded",
    originalError,
    message: `An unexpected error occurred: ${message}`,
    action: "Retry once, then report if persistent",
    autoRetry: true,
    maxRetries: 1,
  };
}

// ── Error Pattern Detectors ──────────────────────────────────────────────────

function isNetworkError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes("network") ||
    msg.includes("failed to fetch") ||
    msg.includes("load failed") ||
    msg.includes("networkerror") ||
    msg.includes("abort") ||
    msg.includes("timeout") ||
    msg.includes("internet") ||
    error.name === "AbortError" ||
    error.name === "TypeError"
  );
}

function isStorageError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes("indexeddb") ||
    msg.includes("quota") ||
    msg.includes("storage") ||
    msg.includes("quotaexceeded") ||
    error.name === "QuotaExceededError"
  );
}

function isCryptoError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes("crypto") ||
    msg.includes("decrypt") ||
    msg.includes("encrypt") ||
    error.name === "OperationError"
  );
}

function extractStatusCode(error: unknown): number | null {
  if (error && typeof error === "object") {
    if ("status" in error && typeof (error as any).status === "number") {
      return (error as any).status;
    }
    if ("response" in error && (error as any).response?.status) {
      return (error as any).response.status;
    }
  }
  const match = String(error).match(/(\d{3})/);
  if (match) {
    const code = parseInt(match[1], 10);
    if (code >= 400 && code < 600) return code;
  }
  return null;
}

// ── Recovery Strategies ──────────────────────────────────────────────────────

export interface ErrorContext {
  operationId?: string;
  entityType?: string;
  moduleId?: string;
  tenantKey?: string;
  retryCount: number;
}

export type RecoveryHandler = (
  error: ClassifiedError,
  context: ErrorContext,
) => Promise<boolean>;

const recoveryHandlers = new Map<ErrorCategory, RecoveryHandler>();

export function registerRecoveryHandler(
  category: ErrorCategory,
  handler: RecoveryHandler,
): void {
  recoveryHandlers.set(category, handler);
}

export async function attemptRecovery(
  error: unknown,
  context: ErrorContext,
): Promise<{ recovered: boolean; action: string }> {
  const classified = classifyError(error);

  if (!classified.autoRetry) {
    return { recovered: false, action: classified.action };
  }

  if (context.retryCount >= classified.maxRetries) {
    return { recovered: false, action: "Max retries exceeded" };
  }

  const handler = recoveryHandlers.get(classified.category);
  if (handler) {
    try {
      const recovered = await handler(classified, context);
      if (recovered) {
        return {
          recovered: true,
          action: `Recovered via ${classified.category} handler`,
        };
      }
    } catch {
      // Handler failed — fall through to default
    }
  }

  // Default: exponential backoff delay
  const delay = Math.min(30000, 1000 * 2 ** context.retryCount);
  await sleep(delay);
  return { recovered: true, action: `Delayed ${delay}ms before retry` };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Built-in Recovery Handlers ───────────────────────────────────────────────

// Network recovery: wait for online event
registerRecoveryHandler("network", async () => {
  return new Promise((resolve) => {
    if (typeof navigator !== "undefined" && navigator.onLine) {
      resolve(true);
      return;
    }
    const timeout = setTimeout(() => resolve(false), 60_000);
    const handler = () => {
      clearTimeout(timeout);
      window.removeEventListener("online", handler);
      resolve(true);
    };
    window.addEventListener("online", handler);
  });
});

// Server recovery: exponential backoff with jitter
registerRecoveryHandler("server", async (_classified, context) => {
  const baseDelay = 1000;
  const maxDelay = 30000;
  const delay = Math.min(maxDelay, baseDelay * 2 ** context.retryCount);
  await sleep(delay + Math.random() * 1000);
  return true;
});

// Storage recovery: attempt to repair IndexedDB
registerRecoveryHandler("storage", async (classified) => {
  if (classified.originalError.message.includes("quota")) {
    try {
      await openOfflineDatabaseV2();
      // Additional quota recovery could clear old caches here
      return true;
    } catch {
      return false;
    }
  }
  if (classified.originalError.message.includes("version")) {
    return true; // Close and reopen might trigger upgrade
  }
  return false;
});

// Auth recovery: attempt silent refresh
registerRecoveryHandler("auth", async () => {
  try {
    const { getActiveSessionManager } = await import(
      "@/lib/offline/session-manager"
    );
    const manager = getActiveSessionManager();
    if (!manager) return false;
    return manager.attemptSilentRefresh();
  } catch {
    return false;
  }
});

// ── Health Check & Self-Repair ───────────────────────────────────────────────

export interface HealthCheckResult {
  passed: boolean;
  checks: HealthCheckItem[];
  repairs: string[];
  healthScore: number;
}

export interface HealthCheckItem {
  name: string;
  passed: boolean;
  severity: "info" | "warning" | "critical";
  message: string;
  value?: number;
}

const HEALTH_CHECK_THRESHOLDS = {
  maxPendingOperations: 100,
  maxFailedBlocking: 10,
  maxStaleCacheEntries: 500,
  maxLogEntries: 1000,
  maxDeadLetterEntries: 50,
  maxZombieSyncDurationMs: 5 * 60 * 1000,
};

export async function runHealthCheck(
  tenantKey: string,
): Promise<HealthCheckResult> {
  const checks: HealthCheckItem[] = [];
  const repairs: string[] = [];

  // Check 1: Database accessibility
  try {
    await openOfflineDatabaseV2();
    checks.push({
      name: "database_accessible",
      passed: true,
      severity: "info",
      message: "IndexedDB is accessible",
    });
  } catch {
    checks.push({
      name: "database_accessible",
      passed: false,
      severity: "critical",
      message: "IndexedDB is not accessible",
    });
    return {
      passed: false,
      checks,
      repairs: [],
      healthScore: 0,
    };
  }

  // Check 2: Pending operations count
  const pendingOps = await getPendingOperations(tenantKey);
  const pendingCount = pendingOps.length;
  checks.push({
    name: "pending_operations",
    passed: pendingCount < HEALTH_CHECK_THRESHOLDS.maxPendingOperations,
    severity:
      pendingCount > HEALTH_CHECK_THRESHOLDS.maxPendingOperations
        ? "warning"
        : "info",
    message: `${pendingCount} pending operations`,
    value: pendingCount,
  });

  // Check 3: Blocking failures
  const blockingCount = pendingOps.filter(
    (op) => op.status === "FAILED_BLOCKING",
  ).length;
  checks.push({
    name: "blocking_failures",
    passed: blockingCount < HEALTH_CHECK_THRESHOLDS.maxFailedBlocking,
    severity: blockingCount > 0 ? "warning" : "info",
    message: `${blockingCount} blocking failures`,
    value: blockingCount,
  });

  // Check 4: Zombie operations (stuck in SYNCING)
  const zombieOps = pendingOps.filter(
    (op) =>
      op.status === "SYNCING" &&
      op.lastAttemptAt &&
      Date.now() - Date.parse(op.lastAttemptAt) >
        HEALTH_CHECK_THRESHOLDS.maxZombieSyncDurationMs,
  );
  checks.push({
    name: "zombie_operations",
    passed: zombieOps.length === 0,
    severity: zombieOps.length > 0 ? "warning" : "info",
    message: `${zombieOps.length} zombie operations detected`,
    value: zombieOps.length,
  });

  // Auto-repair: Reset zombie operations
  for (const zombie of zombieOps) {
    try {
      const { resetOfflineOperationToQueued } = await import(
        "@/lib/offline/outbox"
      );
      await resetOfflineOperationToQueued(zombie.operationId);
      repairs.push(`Reset zombie operation ${zombie.operationId}`);
    } catch {
      // Best effort
    }
  }

  // Check 5: Orphan entities
  const orphanCount = await countOrphanEntities(tenantKey, pendingOps);
  checks.push({
    name: "orphan_entities",
    passed: orphanCount === 0,
    severity: orphanCount > 0 ? "warning" : "info",
    message: `${orphanCount} orphan entities`,
    value: orphanCount,
  });

  // Check 6: Dead letter queue size
  const deadLetterCount = await countDeadLetters(tenantKey);
  checks.push({
    name: "dead_letter_queue",
    passed: deadLetterCount < HEALTH_CHECK_THRESHOLDS.maxDeadLetterEntries,
    severity: deadLetterCount > 10 ? "warning" : "info",
    message: `${deadLetterCount} dead letter entries`,
    value: deadLetterCount,
  });

  // Check 7: Sync log size
  const syncLogCount = await countRecords(
    DB_STORES.syncLog,
    "tenantKey",
    tenantKey,
  );
  checks.push({
    name: "sync_log_size",
    passed: syncLogCount < HEALTH_CHECK_THRESHOLDS.maxLogEntries,
    severity: syncLogCount > 500 ? "warning" : "info",
    message: `${syncLogCount} sync log entries`,
    value: syncLogCount,
  });

  // Auto-repair: Trim old sync log entries
  if (syncLogCount > HEALTH_CHECK_THRESHOLDS.maxLogEntries) {
    try {
      const trimmed = await trimOldSyncLogs(tenantKey);
      if (trimmed > 0) repairs.push(`Trimmed ${trimmed} old sync log entries`);
    } catch {
      // Best effort
    }
  }

  // Calculate health score
  const criticalChecks = checks.filter(
    (c) => c.severity === "critical" && !c.passed,
  );
  const warningChecks = checks.filter(
    (c) => c.severity === "warning" && !c.passed,
  );
  const healthScore = Math.max(
    0,
    100 - criticalChecks.length * 30 - warningChecks.length * 10,
  );

  return {
    passed: criticalChecks.length === 0,
    checks,
    repairs,
    healthScore,
  };
}

// ── Health Check Helpers ─────────────────────────────────────────────────────

async function getPendingOperations(
  tenantKey: string,
): Promise<OfflineOutboxOperationV2[]> {
  const ops = await listRecords<OfflineOutboxOperationV2>(DB_STORES.outbox);
  return ops.filter(
    (op) => op.tenantKey === tenantKey && op.status !== "SYNCED",
  );
}

async function countOrphanEntities(
  tenantKey: string,
  pendingOps: OfflineOutboxOperationV2[],
): Promise<number> {
  const entities = await listRecords<LocalEntityRecordV2>(DB_STORES.entityStore);
  const pendingOpEntityIds = new Set(
    pendingOps
      .filter((op) => op.localRefs?.entityId)
      .map((op) => op.localRefs!.entityId),
  );

  let orphanCount = 0;
  for (const entity of entities) {
    if (entity.tenantKey !== tenantKey) continue;
    if ((entity.status ?? "LOCAL") !== "LOCAL") continue;
    if (!pendingOpEntityIds.has(entity.tempId)) {
      orphanCount++;
    }
  }
  return orphanCount;
}

async function countDeadLetters(tenantKey: string): Promise<number> {
  const entries = await listRecords<DeadLetterEntry>(DB_STORES.deadLetterQueue);
  return entries.filter((e) => e.tenantKey === tenantKey).length;
}

async function trimOldSyncLogs(tenantKey: string): Promise<number> {
  const entries = await listRecords<SyncLogEntry>(DB_STORES.syncLog);
  const tenantEntries = entries.filter((e) => e.tenantKey === tenantKey);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days

  let trimmed = 0;
  for (const entry of tenantEntries) {
    const entryTime = Date.parse(entry.startedAt);
    if (entryTime < cutoff) {
      await deleteRecord(DB_STORES.syncLog, entry.id);
      trimmed++;
    }
  }
  return trimmed;
}

// ── Periodic Self-Repair ─────────────────────────────────────────────────────

let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

export function startPeriodicHealthCheck(
  tenantKey: string,
  intervalMs = 5 * 60 * 1000,
): void {
  stopPeriodicHealthCheck();

  healthCheckTimer = setInterval(async () => {
    try {
      const result = await runHealthCheck(tenantKey);
      if (!result.passed) {
        console.warn(
          "[HealthCheck] Issues detected:",
          result.checks.filter((c) => !c.passed),
        );
      }
      if (result.repairs.length > 0) {
        console.info("[HealthCheck] Auto-repairs applied:", result.repairs);
      }
    } catch (e) {
      console.error("[HealthCheck] Error running health check:", e);
    }
  }, intervalMs);
}

export function stopPeriodicHealthCheck(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}

// ── React Hook ───────────────────────────────────────────────────────────────

export interface UseOfflineHealthReturn {
  health: HealthCheckResult | null;
  isLoading: boolean;
  check: () => Promise<void>;
  startAutoCheck: (intervalMs?: number) => void;
  stopAutoCheck: () => void;
}

export function useOfflineHealth(
  tenantKey: string,
): UseOfflineHealthReturn {
  const [health, setHealth] = useState<HealthCheckResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const check = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await runHealthCheck(tenantKey);
      setHealth(result);
    } catch (e) {
      console.error("[useOfflineHealth] Health check failed:", e);
    } finally {
      setIsLoading(false);
    }
  }, [tenantKey]);

  const startAutoCheck = useCallback(
    (intervalMs?: number) => {
      startPeriodicHealthCheck(tenantKey, intervalMs);
    },
    [tenantKey],
  );

  const stopAutoCheck = useCallback(() => {
    stopPeriodicHealthCheck();
  }, []);

  useEffect(() => {
    // Initial check
    check();
    return () => {
      stopPeriodicHealthCheck();
    };
  }, [check]);

  return {
    health,
    isLoading,
    check,
    startAutoCheck,
    stopAutoCheck,
  };
}
