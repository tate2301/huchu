import {
  OFFLINE_DB_STORES,
  clearOfflineStore,
  deleteOfflineRecord,
  getOfflineRecord,
  listOfflineRecords,
  putOfflineRecord,
} from "@/lib/offline/db";
import type {
  OfflineActiveTenantContext,
  OfflineAttachmentRecord,
  OfflineOutboxOperation,
} from "@/lib/offline/types";

const ACTIVE_OFFLINE_TENANT_CONTEXT_ID = "active";

function sessionBootstrapId(tenantKey: string) {
  return `tenant:${tenantKey}`;
}

function bootstrapProgressId(tenantKey: string) {
  return `tenant:${tenantKey}`;
}

function nowIso() {
  return new Date().toISOString();
}

export function getActiveOfflineTenantContext() {
  return getOfflineRecord<OfflineActiveTenantContext>(
    OFFLINE_DB_STORES.offlineContext,
    ACTIVE_OFFLINE_TENANT_CONTEXT_ID,
  );
}

export async function setActiveOfflineTenantContext(
  input: Omit<OfflineActiveTenantContext, "id" | "updatedAt">,
) {
  const record: OfflineActiveTenantContext = {
    id: ACTIVE_OFFLINE_TENANT_CONTEXT_ID,
    ...input,
    updatedAt: nowIso(),
  };
  await putOfflineRecord(OFFLINE_DB_STORES.offlineContext, record);
  return record;
}

export async function clearActiveOfflineTenantContext() {
  await deleteOfflineRecord(
    OFFLINE_DB_STORES.offlineContext,
    ACTIVE_OFFLINE_TENANT_CONTEXT_ID,
  );
}

export async function clearTenantOfflineData(tenantKey: string) {
  const [queryCache, entityStore, outbox, attachmentStore] = await Promise.all([
    listOfflineRecords<{ id: string; tenantKey: string }>(
      OFFLINE_DB_STORES.queryCache,
    ),
    listOfflineRecords<{ id: string; tenantKey: string }>(
      OFFLINE_DB_STORES.entityStore,
    ),
    listOfflineRecords<OfflineOutboxOperation>(OFFLINE_DB_STORES.outbox),
    listOfflineRecords<OfflineAttachmentRecord>(OFFLINE_DB_STORES.attachmentStore),
  ]);

  await Promise.all([
    ...queryCache
      .filter((record) => record.tenantKey === tenantKey)
      .map((record) => deleteOfflineRecord(OFFLINE_DB_STORES.queryCache, record.id)),
    ...entityStore
      .filter((record) => record.tenantKey === tenantKey)
      .map((record) => deleteOfflineRecord(OFFLINE_DB_STORES.entityStore, record.id)),
    ...outbox
      .filter((record) => record.tenantKey === tenantKey)
      .map((record) => deleteOfflineRecord(OFFLINE_DB_STORES.outbox, record.operationId)),
    ...attachmentStore
      .filter((record) => record.tenantKey === tenantKey)
      .map((record) =>
        deleteOfflineRecord(
          OFFLINE_DB_STORES.attachmentStore,
          record.attachmentId,
        ),
      ),
  ]);

  await Promise.all([
    deleteOfflineRecord(
      OFFLINE_DB_STORES.sessionBootstrap,
      sessionBootstrapId(tenantKey),
    ).catch(() => undefined),
    deleteOfflineRecord(
      OFFLINE_DB_STORES.bootstrapState,
      bootstrapProgressId(tenantKey),
    ).catch(() => undefined),
  ]);
}

export async function clearAllOfflineData() {
  await Promise.all([
    clearOfflineStore(OFFLINE_DB_STORES.offlineContext),
    clearOfflineStore(OFFLINE_DB_STORES.sessionBootstrap),
    clearOfflineStore(OFFLINE_DB_STORES.bootstrapState),
    clearOfflineStore(OFFLINE_DB_STORES.queryCache),
    clearOfflineStore(OFFLINE_DB_STORES.entityStore),
    clearOfflineStore(OFFLINE_DB_STORES.outbox),
    clearOfflineStore(OFFLINE_DB_STORES.attachmentStore),
  ]);
}

export function buildTenantScopedSessionId(tenantKey: string) {
  return sessionBootstrapId(tenantKey);
}

export function buildTenantScopedBootstrapId(tenantKey: string) {
  return bootstrapProgressId(tenantKey);
}
