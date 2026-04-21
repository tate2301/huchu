/**
 * Huchu Offline Storage — Enhanced IndexedDB Schema (v2)
 * ---------------------------------------------------------------------------
 * Database: huchu-offline-v2
 * Version:  4
 *
 * Contains 13 object stores for comprehensive offline-first operation:
 *   Existing (v1-v3): offlineContext, sessionBootstrap, bootstrapState,
 *                     queryCache, entityStore, outbox, attachmentStore
 *   New (v4):         sessionTokens, syncLog, conflictLog, connectivityLog,
 *                     deadLetterQueue, schemaVersion
 *
 * All stores are tenant-scoped for multi-tenant isolation.
 */

import type {
  OfflineActiveTenantContext,
  OfflineAttachmentRecord,
  OfflineOutboxOperation,
  OfflineOutboxStatus,
  OfflineSessionBootstrap,
  OfflineModulePreparation,
  PersistedQueryRecord,
} from "@/lib/offline/types";

// ── Constants ────────────────────────────────────────────────────────────────

export const OFFLINE_DB_NAME = "huchu-offline-v2";
export const OFFLINE_DB_VERSION = 4;

export const DB_STORES = {
  // Existing (v1–v3)
  offlineContext: "offlineContext",
  sessionBootstrap: "sessionBootstrap",
  bootstrapState: "bootstrapState",
  queryCache: "queryCache",
  entityStore: "entityStore",
  outbox: "outbox",
  attachmentStore: "attachmentStore",

  // New in v4
  sessionTokens: "sessionTokens",
  syncLog: "syncLog",
  conflictLog: "conflictLog",
  connectivityLog: "connectivityLog",
  deadLetterQueue: "deadLetterQueue",
  schemaVersion: "schemaVersion",
} as const;

export type StoreName = (keyof typeof DB_STORES) & string;

// ── Enhanced TypeScript Interfaces ───────────────────────────────────────────

/** Extended entity status with CONFLICTED state */
export type EnhancedEntityStatus = "LOCAL" | "SYNCED" | "CONFLICTED";

/** Entity store record (enhanced with version vector) */
export interface LocalEntityRecordV2<TPayload = Record<string, unknown>> {
  id: string; // Composite: `${tenantKey}:${moduleId}:${entityType}:${tempId}`
  tenantKey: string;
  moduleId: string;
  entityType: string;
  tempId: string;
  serverId: string | null;
  status: EnhancedEntityStatus;
  displayLabel: string;
  searchableText: string;
  payload: TPayload;
  /** Lamport timestamp for conflict detection */
  versionVector: number;
  /** Client-generated timestamp */
  clientTimestamp: string;
  createdAt: string;
  updatedAt: string;
}

/** Outbox operation record (enhanced with conflict metadata) */
export interface OfflineOutboxOperationV2<
  TPayload = Record<string, unknown>,
> {
  operationId: string;
  tenantKey: string;
  moduleId: string;
  clientRequestId: string;
  entityType: string;
  operation: string;
  dependsOn: string[];
  payload: TPayload;
  localRefs?: Record<string, string>;
  attachments?: import("@/lib/offline/types").OfflineAttachmentRef[];
  syncPriority: number;
  status:
    | "QUEUED"
    | "SYNCING"
    | "FAILED_BLOCKING"
    | "FAILED_RETRYABLE"
    | "SYNCED"
    | "CONFLICTED";
  retryCount: number;
  /** Exponential backoff: next allowed retry time */
  nextRetryAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  /** Delta payload — only changed fields since last sync */
  deltaPayload: Record<string, unknown> | null;
  /** Server-assigned version at time of fetch */
  serverVersion: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Session token storage (secure, encrypted) */
export interface SessionTokenRecord {
  tenantKey: string;
  /** Serialized encrypted access token (AES-256-GCM via Web Crypto) */
  encryptedAccessToken: number[];
  /** Serialized encrypted refresh token */
  encryptedRefreshToken: number[];
  /** Token expiry timestamp */
  expiresAt: string;
  /** Refresh token expiry (typically longer) */
  refreshExpiresAt: string;
  /** Last successful refresh timestamp */
  lastRefreshedAt: string;
  /** Number of refresh cycles completed */
  refreshCount: number;
}

/** Sync log entry — complete audit trail */
export interface SyncLogEntry {
  id: string; // ULID-like: `sync:${operationId}:${timestamp}`
  tenantKey: string;
  operationId: string;
  moduleId: string;
  operation: string;
  status:
    | "started"
    | "success"
    | "retryable_failure"
    | "blocking_failure"
    | "conflict_detected";
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  requestPayload: Record<string, unknown> | null;
  responsePayload: Record<string, unknown> | null;
  errorMessage: string | null;
  retryCount: number;
  /** Network conditions at time of sync */
  connectivityState: "online" | "offline" | "degraded";
}

/** Conflict log entry */
export interface ConflictLogEntry {
  id: string;
  tenantKey: string;
  operationId: string;
  entityType: string;
  serverId: string | null;
  /** Client version vector at time of edit */
  clientVersion: number;
  /** Server version vector at time of conflict */
  serverVersion: number;
  /** Fields that conflicted */
  conflictingFields: string[];
  /** Client payload that was rejected */
  clientPayload: Record<string, unknown>;
  /** Server payload that won */
  serverPayload: Record<string, unknown>;
  /** Resolution applied */
  resolution: "server_wins" | "client_wins" | "merge" | "manual";
  /** Whether user was notified */
  userNotified: boolean;
  /** User's chosen resolution (if manual) */
  userResolution: Record<string, unknown> | null;
  detectedAt: string;
  resolvedAt: string | null;
}

/** Connectivity state log */
export interface ConnectivityLogEntry {
  id: string;
  timestamp: string;
  /** Detected state */
  state: "online" | "offline" | "degraded";
  /** Detection method that triggered */
  detectionMethod: "navigator" | "heartbeat" | "fetch_timeout" | "manual";
  /** RTT in ms (if available) */
  latencyMs: number | null;
  /** Additional context */
  detail: string | null;
}

/** Dead letter queue — mutations that can never be processed */
export interface DeadLetterEntry {
  id: string;
  tenantKey: string;
  originalOperationId: string;
  moduleId: string;
  operation: string;
  payload: Record<string, unknown>;
  /** Why this was rejected permanently */
  rejectionReason: string;
  /** Category of failure */
  failureCategory:
    | "validation"
    | "permissions"
    | "not_found"
    | "business_rule"
    | "unknown";
  /** How many times it was retried */
  totalRetries: number;
  /** Last error message from server */
  lastServerError: string;
  enqueuedAt: string;
  diedAt: string;
  /** Whether admin has been notified */
  adminNotified: boolean;
}

/** Schema version tracking */
export interface SchemaVersionRecord {
  id: string; // "current"
  version: number;
  appliedAt: string;
  migrations: string[];
}

/** Query cache record (enhanced with staleness tracking) */
export interface PersistedQueryRecordV2 extends PersistedQueryRecord {
  /** Whether this cache entry was served stale from SW */
  isStale: boolean;
  /** Last server-confirmation timestamp */
  serverValidatedAt: number | null;
}

// ── Connection Management ────────────────────────────────────────────────────

let openPromise: Promise<IDBDatabase> | null = null;

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function waitForTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () =>
      reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

// ── Store Creation ───────────────────────────────────────────────────────────

function createStores(
  db: IDBDatabase,
  transaction: IDBTransaction | null,
): void {
  // ── v1–v3 stores (existing) ──────────────────────────────────────────

  if (!db.objectStoreNames.contains(DB_STORES.offlineContext)) {
    db.createObjectStore(DB_STORES.offlineContext, { keyPath: "id" });
  }

  if (!db.objectStoreNames.contains(DB_STORES.sessionBootstrap)) {
    db.createObjectStore(DB_STORES.sessionBootstrap, { keyPath: "id" });
  }

  if (!db.objectStoreNames.contains(DB_STORES.bootstrapState)) {
    db.createObjectStore(DB_STORES.bootstrapState, { keyPath: "id" });
  }

  if (!db.objectStoreNames.contains(DB_STORES.queryCache)) {
    const store = db.createObjectStore(DB_STORES.queryCache, {
      keyPath: "id",
    });
    store.createIndex("updatedAt", "updatedAt");
    store.createIndex("tenantKey", "tenantKey");
    store.createIndex("moduleId", "moduleId");
  } else if (transaction) {
    const store = transaction.objectStore(DB_STORES.queryCache);
    if (!store.indexNames.contains("moduleId")) {
      store.createIndex("moduleId", "moduleId");
    }
  }

  if (!db.objectStoreNames.contains(DB_STORES.entityStore)) {
    const store = db.createObjectStore(DB_STORES.entityStore, {
      keyPath: "id",
    });
    store.createIndex("tempId", "tempId", { unique: true });
    store.createIndex("moduleId_entityType", ["moduleId", "entityType"]);
    store.createIndex("status", "status");
    store.createIndex("tenantKey", "tenantKey");
    store.createIndex("serverId", "serverId");
  } else if (transaction) {
    const store = transaction.objectStore(DB_STORES.entityStore);
    if (!store.indexNames.contains("serverId")) {
      store.createIndex("serverId", "serverId");
    }
    if (!store.indexNames.contains("moduleId_entityType")) {
      store.createIndex("moduleId_entityType", ["moduleId", "entityType"]);
    }
  }

  if (!db.objectStoreNames.contains(DB_STORES.outbox)) {
    const store = db.createObjectStore(DB_STORES.outbox, {
      keyPath: "operationId",
    });
    store.createIndex("status", "status");
    store.createIndex("moduleId", "moduleId");
    store.createIndex("nextRetryAt", "nextRetryAt");
    store.createIndex("tenantKey", "tenantKey");
    store.createIndex("createdAt", "createdAt");
  } else if (transaction) {
    const store = transaction.objectStore(DB_STORES.outbox);
    if (!store.indexNames.contains("createdAt")) {
      store.createIndex("createdAt", "createdAt");
    }
  }

  if (!db.objectStoreNames.contains(DB_STORES.attachmentStore)) {
    const store = db.createObjectStore(DB_STORES.attachmentStore, {
      keyPath: "attachmentId",
    });
    store.createIndex("tenantKey", "tenantKey");
    store.createIndex("context", "context");
  } else if (transaction) {
    const store = transaction.objectStore(DB_STORES.attachmentStore);
    if (!store.indexNames.contains("context")) {
      store.createIndex("context", "context");
    }
  }

  // ── v4 stores (new) ──────────────────────────────────────────────────

  if (!db.objectStoreNames.contains(DB_STORES.sessionTokens)) {
    db.createObjectStore(DB_STORES.sessionTokens, {
      keyPath: "tenantKey",
    });
  }

  if (!db.objectStoreNames.contains(DB_STORES.syncLog)) {
    const store = db.createObjectStore(DB_STORES.syncLog, { keyPath: "id" });
    store.createIndex("operationId", "operationId");
    store.createIndex("tenantKey", "tenantKey");
    store.createIndex("startedAt", "startedAt");
    store.createIndex("status", "status");
  }

  if (!db.objectStoreNames.contains(DB_STORES.conflictLog)) {
    const store = db.createObjectStore(DB_STORES.conflictLog, {
      keyPath: "id",
    });
    store.createIndex("operationId", "operationId");
    store.createIndex("tenantKey", "tenantKey");
    store.createIndex("resolvedAt", "resolvedAt");
    store.createIndex("userNotified", "userNotified");
  }

  if (!db.objectStoreNames.contains(DB_STORES.connectivityLog)) {
    const store = db.createObjectStore(DB_STORES.connectivityLog, {
      keyPath: "id",
    });
    store.createIndex("timestamp", "timestamp");
    store.createIndex("state", "state");
  }

  if (!db.objectStoreNames.contains(DB_STORES.deadLetterQueue)) {
    const store = db.createObjectStore(DB_STORES.deadLetterQueue, {
      keyPath: "id",
    });
    store.createIndex("tenantKey", "tenantKey");
    store.createIndex("failureCategory", "failureCategory");
    store.createIndex("adminNotified", "adminNotified");
  }

  if (!db.objectStoreNames.contains(DB_STORES.schemaVersion)) {
    db.createObjectStore(DB_STORES.schemaVersion, { keyPath: "id" });
  }
}

// ── Migration Runner ─────────────────────────────────────────────────────────

async function runMigrations(
  db: IDBDatabase,
  transaction: IDBTransaction,
  oldVersion: number,
  newVersion: number,
): Promise<void> {
  const appliedMigrations: string[] = [];

  // v3 → v4: Add version vectors to existing entities
  if (oldVersion < 4) {
    // Migrate entityStore: add versionVector + clientTimestamp
    try {
      const entityStore = transaction.objectStore(DB_STORES.entityStore);
      const allEntities = await promisifyRequest(entityStore.getAll());
      for (const entity of allEntities) {
        if (entity.versionVector === undefined) {
          entity.versionVector = 1;
          entity.clientTimestamp =
            entity.updatedAt || new Date().toISOString();
          if (entity.status === undefined) entity.status = "LOCAL";
          await promisifyRequest(entityStore.put(entity));
        }
      }
      appliedMigrations.push("v3-to-v4-add-version-vectors");
    } catch (e) {
      console.warn("[db-v2] Entity migration skipped:", e);
    }

    // Migrate outbox: add deltaPayload + serverVersion
    try {
      const outboxStore = transaction.objectStore(DB_STORES.outbox);
      const allOps = await promisifyRequest(outboxStore.getAll());
      for (const op of allOps) {
        if (op.deltaPayload === undefined) op.deltaPayload = null;
        if (op.serverVersion === undefined) op.serverVersion = null;
        // Also ensure CONFLICTED status is recognized
        if (
          op.status !== "SYNCED" &&
          op.status !== "QUEUED" &&
          op.status !== "SYNCING" &&
          op.status !== "FAILED_BLOCKING" &&
          op.status !== "FAILED_RETRYABLE"
        ) {
          op.status = "QUEUED";
        }
        await promisifyRequest(outboxStore.put(op));
      }
      appliedMigrations.push("v3-to-v4-add-delta-tracking");
    } catch (e) {
      console.warn("[db-v2] Outbox migration skipped:", e);
    }

    // Migrate queryCache: add isStale + serverValidatedAt
    try {
      const queryStore = transaction.objectStore(DB_STORES.queryCache);
      const allQueries = await promisifyRequest(queryStore.getAll());
      for (const q of allQueries) {
        if (q.isStale === undefined) q.isStale = false;
        if (q.serverValidatedAt === undefined) q.serverValidatedAt = null;
        await promisifyRequest(queryStore.put(q));
      }
      appliedMigrations.push("v3-to-v4-add-staleness-tracking");
    } catch (e) {
      console.warn("[db-v2] QueryCache migration skipped:", e);
    }
  }

  // Record migration
  try {
    const versionStore = transaction.objectStore(DB_STORES.schemaVersion);
    await promisifyRequest(
      versionStore.put({
        id: "current",
        version: newVersion,
        appliedAt: new Date().toISOString(),
        migrations: appliedMigrations,
      }),
    );
  } catch {
    // Non-critical
  }
}

// ── Database Open ────────────────────────────────────────────────────────────

export function openOfflineDatabaseV2(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new IndexedDBUnavailableError());
  }

  if (!openPromise) {
    openPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const transaction = request.transaction;
        if (!transaction) {
          reject(new Error("Upgrade transaction not available"));
          return;
        }
        createStores(db, transaction);
        runMigrations(
          db,
          transaction,
          event.oldVersion,
          event.newVersion ?? OFFLINE_DB_VERSION,
        ).catch(
          console.error,
        );
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("Failed to open IndexedDB"));
      request.onblocked = () => {
        reject(new Error("IndexedDB upgrade blocked — close other tabs"));
      };
    });
  }

  return openPromise;
}

/** Close the database connection and clear the open promise.
 *  Call this when you need to re-open with a new version. */
export function closeOfflineDatabaseV2(): void {
  openPromise?.then((db) => db.close()).catch(() => {});
  openPromise = null;
}

// ── CRUD Operations ──────────────────────────────────────────────────────────

export async function getRecord<T>(
  storeName: StoreName,
  key: IDBValidKey,
): Promise<T | null> {
  const db = await openOfflineDatabaseV2();
  const tx = db.transaction(storeName, "readonly");
  const result = await promisifyRequest(tx.objectStore(storeName).get(key));
  await waitForTransaction(tx);
  return result ?? null;
}

export async function putRecord<T>(
  storeName: StoreName,
  value: T,
): Promise<void> {
  const db = await openOfflineDatabaseV2();
  const tx = db.transaction(storeName, "readwrite");
  await promisifyRequest(tx.objectStore(storeName).put(value));
  await waitForTransaction(tx);
}

export async function deleteRecord(
  storeName: StoreName,
  key: IDBValidKey,
): Promise<void> {
  const db = await openOfflineDatabaseV2();
  const tx = db.transaction(storeName, "readwrite");
  await promisifyRequest(tx.objectStore(storeName).delete(key));
  await waitForTransaction(tx);
}

export async function listRecords<T>(storeName: StoreName): Promise<T[]> {
  const db = await openOfflineDatabaseV2();
  const tx = db.transaction(storeName, "readonly");
  const result = await promisifyRequest(tx.objectStore(storeName).getAll());
  await waitForTransaction(tx);
  return (result ?? []) as T[];
}

/** Find records by index value */
export async function findByIndex<T>(
  storeName: StoreName,
  indexName: string,
  key: IDBValidKey | IDBKeyRange,
): Promise<T[]> {
  const db = await openOfflineDatabaseV2();
  const tx = db.transaction(storeName, "readonly");
  const index = tx.objectStore(storeName).index(indexName);
  const result = await promisifyRequest(index.getAll(key));
  await waitForTransaction(tx);
  return (result ?? []) as T[];
}

/** Find a single record by unique index value */
export async function findOneByIndex<T>(
  storeName: StoreName,
  indexName: string,
  key: IDBValidKey,
): Promise<T | null> {
  const db = await openOfflineDatabaseV2();
  const tx = db.transaction(storeName, "readonly");
  const index = tx.objectStore(storeName).index(indexName);
  const result = await promisifyRequest(index.get(key));
  await waitForTransaction(tx);
  return result ?? null;
}

/** Count records in a store or by index */
export async function countRecords(
  storeName: StoreName,
  indexName?: string,
  key?: IDBValidKey | IDBKeyRange,
): Promise<number> {
  const db = await openOfflineDatabaseV2();
  const tx = db.transaction(storeName, "readonly");
  let result: number;
  if (indexName) {
    result = await promisifyRequest(
      tx.objectStore(storeName).index(indexName).count(key),
    );
  } else {
    result = await promisifyRequest(tx.objectStore(storeName).count());
  }
  await waitForTransaction(tx);
  return result;
}

/** Clear all records from a store */
export async function clearStore(storeName: StoreName): Promise<void> {
  const db = await openOfflineDatabaseV2();
  const tx = db.transaction(storeName, "readwrite");
  await promisifyRequest(tx.objectStore(storeName).clear());
  await waitForTransaction(tx);
}

// ── Batch Operations ─────────────────────────────────────────────────────────

export interface BatchWrite<T> {
  storeName: StoreName;
  operation: "put" | "delete";
  value?: T;
  key?: IDBValidKey;
}

/** Execute multiple writes atomically across one or more stores */
export async function executeBatch<T>(writes: BatchWrite<T>[]): Promise<void> {
  if (writes.length === 0) return;

  const db = await openOfflineDatabaseV2();
  const storeNames = [...new Set(writes.map((w) => w.storeName))];
  const tx = db.transaction(storeNames, "readwrite");

  for (const write of writes) {
    const store = tx.objectStore(write.storeName);
    if (write.operation === "put") {
      store.put(write.value);
    } else {
      store.delete(write.key!);
    }
  }

  await waitForTransaction(tx);
}

// ── Transactional Scoped Query ───────────────────────────────────────────────

/** Get all records scoped to a tenant */
export async function listRecordsByTenant<T>(
  storeName: StoreName,
  tenantKey: string,
): Promise<T[]> {
  return findByIndex<T>(storeName, "tenantKey", tenantKey);
}

/** Delete all records scoped to a tenant */
export async function deleteRecordsByTenant(
  storeName: StoreName,
  tenantKey: string,
): Promise<void> {
  const records = await findByIndex<{ id: string }>(
    storeName,
    "tenantKey",
    tenantKey,
  );
  const db = await openOfflineDatabaseV2();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  for (const record of records) {
    store.delete(record.id);
  }
  await waitForTransaction(tx);
}

// ── Convenience: Schema Version ──────────────────────────────────────────────

export async function getCurrentSchemaVersion(): Promise<SchemaVersionRecord | null> {
  return getRecord<SchemaVersionRecord>(DB_STORES.schemaVersion, "current");
}

// ── Convenience: Sync Log ────────────────────────────────────────────────────

export async function addSyncLogEntry(
  entry: SyncLogEntry,
): Promise<void> {
  return putRecord(DB_STORES.syncLog, entry);
}

export async function getSyncLogsForOperation(
  operationId: string,
): Promise<SyncLogEntry[]> {
  return findByIndex<SyncLogEntry>(DB_STORES.syncLog, "operationId", operationId);
}

// ── Convenience: Conflict Log ────────────────────────────────────────────────

export async function addConflictLogEntry(
  entry: ConflictLogEntry,
): Promise<void> {
  return putRecord(DB_STORES.conflictLog, entry);
}

export async function getUnresolvedConflicts(
  tenantKey: string,
): Promise<ConflictLogEntry[]> {
  const all = await findByIndex<ConflictLogEntry>(
    DB_STORES.conflictLog,
    "tenantKey",
    tenantKey,
  );
  return all.filter((c) => !c.resolvedAt);
}

// ── Convenience: Dead Letter Queue ───────────────────────────────────────────

export async function addDeadLetterEntry(
  entry: DeadLetterEntry,
): Promise<void> {
  return putRecord(DB_STORES.deadLetterQueue, entry);
}

export async function getDeadLettersForTenant(
  tenantKey: string,
): Promise<DeadLetterEntry[]> {
  return findByIndex<DeadLetterEntry>(
    DB_STORES.deadLetterQueue,
    "tenantKey",
    tenantKey,
  );
}

// ── Convenience: Connectivity Log ────────────────────────────────────────────

export async function addConnectivityLogEntry(
  entry: ConnectivityLogEntry,
): Promise<void> {
  return putRecord(DB_STORES.connectivityLog, entry);
}

export async function getRecentConnectivityLogs(
  limit = 100,
): Promise<ConnectivityLogEntry[]> {
  const all = await listRecords<ConnectivityLogEntry>(
    DB_STORES.connectivityLog,
  );
  return all
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, limit);
}

// ── Errors ───────────────────────────────────────────────────────────────────

export class IndexedDBUnavailableError extends Error {
  constructor() {
    super("IndexedDB is not available in this environment");
    this.name = "IndexedDBUnavailableError";
  }
}

export class IndexedDBQuotaExceededError extends Error {
  constructor(storeName: string) {
    super(`IndexedDB quota exceeded for store: ${storeName}`);
    this.name = "IndexedDBQuotaExceededError";
  }
}

export class IndexedDBVersionError extends Error {
  constructor(expected: number, actual: number) {
    super(`Schema version mismatch: expected ${expected}, got ${actual}`);
    this.name = "IndexedDBVersionError";
  }
}
