import { OFFLINE_DB_STORES, findOfflineRecordByIndex, listOfflineRecords, putOfflineRecord } from "@/lib/offline/db";
import { emitOfflineEntitiesChanged } from "@/lib/offline/events";
import type { LocalEntityRecord } from "@/lib/offline/types";

function nowIso() {
  return new Date().toISOString();
}

export function createOfflineTempEntityId(moduleId: string, entityType: string) {
  return `local:${moduleId}:${entityType}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function buildRecordId(moduleId: string, entityType: string, tempId: string) {
  return `${moduleId}:${entityType}:${tempId}`;
}

export async function upsertOfflineLocalEntity<TPayload = Record<string, unknown>>(input: {
  moduleId: string;
  entityType: string;
  tempId?: string;
  displayLabel: string;
  searchableText: string;
  payload: TPayload;
}) {
  const timestamp = nowIso();
  const tempId = input.tempId ?? createOfflineTempEntityId(input.moduleId, input.entityType);
  const existing = await findOfflineRecordByIndex<LocalEntityRecord<TPayload>>(
    OFFLINE_DB_STORES.entityStore,
    "tempId",
    tempId,
  );
  const record: LocalEntityRecord<TPayload> = {
    id: existing?.id ?? buildRecordId(input.moduleId, input.entityType, tempId),
    moduleId: input.moduleId,
    entityType: input.entityType,
    tempId,
    serverId: existing?.serverId ?? null,
    status: existing?.status ?? "LOCAL",
    displayLabel: input.displayLabel,
    searchableText: input.searchableText,
    payload: input.payload,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  await putOfflineRecord(OFFLINE_DB_STORES.entityStore, record);
  emitOfflineEntitiesChanged();
  return record;
}

export async function listOfflineLocalEntities(filters?: {
  moduleId?: string;
  entityType?: string;
  status?: "LOCAL" | "SYNCED";
}) {
  const records = await listOfflineRecords<LocalEntityRecord>(OFFLINE_DB_STORES.entityStore);
  return records.filter((record) => {
    if (filters?.moduleId && record.moduleId !== filters.moduleId) return false;
    if (filters?.entityType && record.entityType !== filters.entityType) return false;
    if (filters?.status && record.status !== filters.status) return false;
    return true;
  });
}

export function searchOfflineLocalEntities(
  records: LocalEntityRecord[],
  search: string,
) {
  const normalized = search.trim().toLowerCase();
  if (!normalized) return records;
  return records.filter((record) => record.searchableText.toLowerCase().includes(normalized));
}

export function findOfflineLocalEntityByTempId(tempId: string) {
  return findOfflineRecordByIndex<LocalEntityRecord>(
    OFFLINE_DB_STORES.entityStore,
    "tempId",
    tempId,
  );
}

export async function markOfflineLocalEntitySynced(tempId: string, serverId: string) {
  const existing = await findOfflineLocalEntityByTempId(tempId);
  if (!existing) return null;
  const next: LocalEntityRecord = {
    ...existing,
    serverId,
    status: "SYNCED",
    updatedAt: nowIso(),
  };
  await putOfflineRecord(OFFLINE_DB_STORES.entityStore, next);
  emitOfflineEntitiesChanged();
  return next;
}

export async function resolveOfflineEntityServerId(tempId: string) {
  const existing = await findOfflineLocalEntityByTempId(tempId);
  return existing?.serverId ?? null;
}
