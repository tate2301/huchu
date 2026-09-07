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
 *   } from "@corelithzw/module-offline";
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
} from "./db-v2";

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
} from "./db-v2";

// ── Sync Engine ──────────────────────────────────────────────────────────────

export {
  SyncEngine,
  createSyncEngine,
  getActiveSyncEngine,
  destroySyncEngine,
  useSyncEngine,
} from "./sync-engine";

export type {
  SyncEngineState,
  SyncOperationOutcome,
  SyncResult,
  SyncEngineConfig,
  SyncOperationAdapter,
  LocalRefResolver,
  CreateSyncEngineParams,
  UseSyncEngineReturn,
} from "./sync-engine";

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
} from "./connectivity";

export type {
  ConnectivityQuality,
  ConnectivityState,
  LatencyMeasurement,
  UseConnectivityReturn,
} from "./connectivity";

// ── Session Manager ──────────────────────────────────────────────────────────

export {
  OfflineSessionManager,
  createOfflineSessionManager,
  getActiveSessionManager,
  recordUserActivity,
  useOfflineSession,
} from "./session-manager";

export type {
  SessionState,
  SessionStatus,
  UseOfflineSessionReturn,
} from "./session-manager";

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
} from "./offline-eligibility";

export type {
  OfflineEligibleRole,
  OfflineRoleConfig,
  OfflineEligibilityResult,
  PrefetchConfig,
} from "./offline-eligibility";

// ── Conflict Resolver ────────────────────────────────────────────────────────

export {
  detectConflict,
  resolveConflict,
  markConflictUserNotified,
  resolveConflictManually,
  useConflictNotifications,
} from "./conflict-resolver";

export type {
  ConflictResolution,
  ConflictType,
  ConflictDetectionResult,
  ConflictResolutionResult,
  ConflictNotification,
  UseConflictNotificationsReturn,
} from "./conflict-resolver";

// ── Error Handler ────────────────────────────────────────────────────────────

export {
  classifyError,
  registerRecoveryHandler,
  attemptRecovery,
  runHealthCheck,
  startPeriodicHealthCheck,
  stopPeriodicHealthCheck,
  useOfflineHealth,
} from "./error-handler";

export type {
  ErrorCategory,
  ErrorSeverity,
  ClassifiedError,
  ErrorContext,
  RecoveryHandler,
  HealthCheckResult,
  HealthCheckItem,
  UseOfflineHealthReturn,
} from "./error-handler";

// ── Initialization Orchestrator ──────────────────────────────────────────────

export { initOffline } from "./init-offline";
export type { OfflineInitPhase, OfflineInitResult } from "./init-offline";

// ── Composition ─────────────────────────────────────────────────────────────
// The manifest a host composes with, and the registries it fills on both
// sides (`modules.client.ts`): which offline modules exist, which workflows.
export { manifest } from "./manifest";
export { registerOfflineModules, registeredOfflineModules } from "./module-registry";
export { registerOfflineWorkflows, registeredOfflineWorkflows } from "./workflow-catalog";
