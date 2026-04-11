import { OFFLINE_DB_STORES, deleteOfflineRecord, getOfflineRecord, listOfflineRecords, putOfflineRecord } from "@/lib/offline/db";
import { emitOfflineOutboxChanged } from "@/lib/offline/events";
import type { OfflineOutboxOperation, OfflineOutboxStatus } from "@/lib/offline/types";

function nowIso() {
  return new Date().toISOString();
}

export function createOfflineOperationId(moduleId: string, operation: string) {
  return `op:${moduleId}:${operation}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

export async function enqueueOfflineOperation<TPayload = Record<string, unknown>>(
  input: Omit<
    OfflineOutboxOperation<TPayload>,
    "operationId" | "status" | "retryCount" | "createdAt" | "updatedAt"
  > & { operationId?: string },
) {
  const timestamp = nowIso();
  const operation: OfflineOutboxOperation<TPayload> = {
    ...input,
    operationId: input.operationId ?? createOfflineOperationId(input.moduleId, input.operation),
    status: "QUEUED",
    retryCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await putOfflineRecord(OFFLINE_DB_STORES.outbox, operation);
  emitOfflineOutboxChanged();
  return operation;
}

export function listOfflineOperations() {
  return listOfflineRecords<OfflineOutboxOperation>(OFFLINE_DB_STORES.outbox);
}

export function getOfflineOperation(operationId: string) {
  return getOfflineRecord<OfflineOutboxOperation>(OFFLINE_DB_STORES.outbox, operationId);
}

export async function updateOfflineOperation(
  operationId: string,
  updater: (current: OfflineOutboxOperation) => OfflineOutboxOperation,
) {
  const current = await getOfflineOperation(operationId);
  if (!current) return null;
  const next = updater(current);
  await putOfflineRecord(OFFLINE_DB_STORES.outbox, {
    ...next,
    updatedAt: nowIso(),
  });
  emitOfflineOutboxChanged();
  return next;
}

export function listPendingOfflineOperations() {
  return listOfflineOperations().then((operations) =>
    operations
      .filter((operation) => operation.status !== "SYNCED")
      .sort((left, right) => {
        if (left.syncPriority !== right.syncPriority) {
          return left.syncPriority - right.syncPriority;
        }
        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      }),
  );
}

export function listOfflineOperationsForModule(moduleId: string) {
  return listOfflineOperations().then((operations) =>
    operations.filter(
      (operation) =>
        operation.moduleId === moduleId && operation.status !== "SYNCED",
    ),
  );
}

export function findOfflineOperationForLocalEntity(
  moduleId: string,
  tempId: string,
  operation?: string,
) {
  return listOfflineOperations().then((operations) =>
    operations.find(
      (candidate) =>
        candidate.moduleId === moduleId &&
        candidate.status !== "SYNCED" &&
        candidate.localRefs?.entityId === tempId &&
        (!operation || candidate.operation === operation),
    ) ?? null,
  );
}

export function markOfflineOperationStatus(
  operationId: string,
  status: OfflineOutboxStatus,
  extra?: Partial<OfflineOutboxOperation>,
) {
  return updateOfflineOperation(operationId, (current) => ({
    ...current,
    ...extra,
    status,
    lastAttemptAt: extra?.lastAttemptAt ?? (status === "SYNCING" ? nowIso() : current.lastAttemptAt),
  }));
}

export function markOfflineOperationRetryableFailure(
  operationId: string,
  message: string,
  retryAt?: string,
) {
  return updateOfflineOperation(operationId, (current) => ({
    ...current,
    status: "FAILED_RETRYABLE",
    retryCount: current.retryCount + 1,
    lastAttemptAt: nowIso(),
    lastError: message.slice(0, 220),
    nextRetryAt: retryAt,
  }));
}

export function markOfflineOperationBlockingFailure(
  operationId: string,
  message: string,
) {
  return updateOfflineOperation(operationId, (current) => ({
    ...current,
    status: "FAILED_BLOCKING",
    lastAttemptAt: nowIso(),
    lastError: message.slice(0, 220),
  }));
}

export function markOfflineOperationSynced(operationId: string) {
  return updateOfflineOperation(operationId, (current) => ({
    ...current,
    status: "SYNCED",
    nextRetryAt: undefined,
    lastError: undefined,
    lastAttemptAt: nowIso(),
  }));
}

export function resetOfflineOperationToQueued(operationId: string) {
  return updateOfflineOperation(operationId, (current) => ({
    ...current,
    status: "QUEUED",
    nextRetryAt: undefined,
    lastError: undefined,
  }));
}

export async function removeOfflineOperation(operationId: string) {
  await deleteOfflineRecord(OFFLINE_DB_STORES.outbox, operationId);
  emitOfflineOutboxChanged();
}

export async function getOfflineOutboxSummary() {
  const operations = await listOfflineOperations();
  const pending = operations.filter((operation) => operation.status !== "SYNCED");
  return {
    pendingCount: pending.length,
    blockingCount: pending.filter((operation) => operation.status === "FAILED_BLOCKING").length,
    operations: pending,
  };
}
