/**
 * Huchu Offline Infrastructure — Main Export Barrel
 * ---------------------------------------------------------------------------
 * Single entry point for all offline modules. Import from here to access:
 *
 *   import {
 *     initOffline,
 *     createSyncEngine,
 *     useConnectivity,
 *     useOfflineSession,
 *     useConflictNotifications,
 *     useOfflineHealth,
 *   } from "@/lib/offline";
 *
 * Modules are organized by concern:
 *   • Service Worker        — Shell caching, background sync
 *   • IndexedDB (db-v2)     — 13-store schema, CRUD, batch ops
 *   • Sync Engine           — Outbox processing, retry, circuit breaker
 *   • Connectivity          — 3-layer detection, quality estimation
 *   • Session Manager       — Encrypted tokens, sliding-window expiry
 *   • Offline Eligibility   — Role-based module gating
 *   • Conflict Resolver     — Server-wins with field-level diff
 *   • Error Handler         — Classification, recovery, health monitoring
 */

// ── Core Infrastructure ──────────────────────────────────────────────────────

export {
  // Database v2
  OFFLINE_DB_NAME,
  OFFLINE_DB_VERSION,
  DB_STORES,
  openOfflineDatabaseV2,
  closeOfflineDatabaseV2,
  getRecord,
  putRecord,
  deleteRecord,
  listRecords,
  findByIndex,
  findOneByIndex,
  countRecords,
  clearStore,
  executeBatch,
  listRecordsByTenant,
  deleteRecordsByTenant,
  getCurrentSchemaVersion,
  addSyncLogEntry,
  getSyncLogsForOperation,
  addConflictLogEntry,
  getUnresolvedConflicts,
  addDeadLetterEntry,
  getDeadLettersForTenant,
  addConnectivityLogEntry,
  getRecentConnectivityLogs,
  // Errors
  IndexedDBUnavailableError,
  IndexedDBQuotaExceededError,
  IndexedDBVersionError,
} from "@/lib/offline/db-v2";

export type {
  StoreName,
  LocalEntityRecordV2,
  OfflineOutboxOperationV2,
  SessionTokenRecord,
  SyncLogEntry,
  ConflictLogEntry,
  ConnectivityLogEntry,
  DeadLetterEntry,
  SchemaVersionRecord,
  PersistedQueryRecordV2,
  EnhancedEntityStatus,
  BatchWrite,
} from "@/lib/offline/db-v2";

// ── Sync Engine ──────────────────────────────────────────────────────────────

export {
  SyncEngine,
  createSyncEngine,
  getActiveSyncEngine,
  destroySyncEngine,
  useSyncEngine,
} from "@/lib/offline/sync-engine";

export type {
  SyncEngineState,
  SyncOperationOutcome,
  SyncResult,
  SyncEngineConfig,
  SyncOperationAdapter,
  LocalRefResolver,
  CreateSyncEngineParams,
  UseSyncEngineReturn,
} from "@/lib/offline/sync-engine";

// ── Connectivity ─────────────────────────────────────────────────────────────

export {
  initConnectivityDetector,
  destroyConnectivityDetector,
  checkConnectivity,
  getCurrentConnectivityState,
  onConnectivityChange,
  waitForOnline,
  getLatencyHistory,
  ConnectivityChangeEvent,
  useConnectivity,
} from "@/lib/offline/connectivity";

export type {
  ConnectivityQuality,
  ConnectivityState,
  LatencyMeasurement,
  UseConnectivityReturn,
} from "@/lib/offline/connectivity";

// ── Session Manager ──────────────────────────────────────────────────────────

export {
  OfflineSessionManager,
  createOfflineSessionManager,
  getActiveSessionManager,
  recordUserActivity,
  useOfflineSession,
} from "@/lib/offline/session-manager";

export type {
  SessionState,
  SessionStatus,
  UseOfflineSessionReturn,
} from "@/lib/offline/session-manager";

// ── Offline Eligibility ──────────────────────────────────────────────────────

export {
  OFFLINE_ELIGIBLE_ROLES,
  ROLE_VERTICAL_MAP,
  ROLE_MODULE_FILTER,
  ROLE_PREFETCH_CONFIG,
  isRoleOfflineEligible,
  canEnableOffline,
  getOfflineModulesForRole,
  getOfflineRoleConfig,
  checkOfflineEligibility,
  shouldRegisterServiceWorker,
  getPrefetchConfigForRole,
} from "@/lib/offline/offline-eligibility";

export type {
  OfflineEligibleRole,
  OfflineRoleConfig,
  OfflineEligibilityResult,
  PrefetchConfig,
} from "@/lib/offline/offline-eligibility";

// ── Conflict Resolver ────────────────────────────────────────────────────────

export {
  detectConflict,
  resolveConflict,
  getUnresolvedConflicts,
  markConflictUserNotified,
  resolveConflictManually,
  useConflictNotifications,
} from "@/lib/offline/conflict-resolver";

export type {
  ConflictResolution,
  ConflictType,
  ConflictDetectionResult,
  ConflictResolutionResult,
  ConflictNotification,
  UseConflictNotificationsReturn,
} from "@/lib/offline/conflict-resolver";

// ── Error Handler ────────────────────────────────────────────────────────────

export {
  classifyError,
  registerRecoveryHandler,
  attemptRecovery,
  runHealthCheck,
  startPeriodicHealthCheck,
  stopPeriodicHealthCheck,
  useOfflineHealth,
} from "@/lib/offline/error-handler";

export type {
  ErrorCategory,
  ErrorSeverity,
  ClassifiedError,
  ErrorContext,
  RecoveryHandler,
  HealthCheckResult,
  HealthCheckItem,
  UseOfflineHealthReturn,
} from "@/lib/offline/error-handler";

// ── Initialization Orchestrator ──────────────────────────────────────────────

export { initOffline } from "@/lib/offline/init-offline";
export type { OfflineInitPhase, OfflineInitResult } from "@/lib/offline/init-offline";
