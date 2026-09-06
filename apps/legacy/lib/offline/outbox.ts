import { OFFLINE_DB_STORES, deleteOfflineRecord, getOfflineRecord, listOfflineRecords, putOfflineRecord } from "@/lib/offline/db";
import { emitOfflineOutboxChanged } from "@/lib/offline/events";
import type {
  OfflineOutboxOperation,
  OfflineOutboxStatus,
  OfflineOutboxSummaryItem,
} from "@/lib/offline/types";

function nowIso() {
  return new Date().toISOString();
}

function describeOperation(operation: OfflineOutboxOperation) {
  switch (operation.operation) {
    case "create-seller":
      return "Seller create";
    case "create-inbound-ticket":
      return "Inbound ticket";
    case "create-outbound-ticket":
      return "Outbound ticket";
    case "create-customer":
      return "Customer create";
    case "create-sale":
      return "POS sale";
    default:
      return operation.operation;
  }
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
  const duplicate = (
    await listOfflineOperations()
  ).find(
    (candidate) =>
      candidate.tenantKey === input.tenantKey &&
      candidate.moduleId === input.moduleId &&
      candidate.operation === input.operation &&
      candidate.clientRequestId === input.clientRequestId &&
      candidate.status !== "SYNCED",
  );
  if (duplicate) {
    return duplicate as OfflineOutboxOperation<TPayload>;
  }

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

export function listPendingOfflineOperations(options?: { tenantKey?: string }) {
  return listOfflineOperations().then((operations) =>
    operations
      .filter(
        (operation) =>
          operation.status !== "SYNCED" &&
          (!options?.tenantKey || operation.tenantKey === options.tenantKey),
      )
      .sort((left, right) => {
        if (left.syncPriority !== right.syncPriority) {
          return left.syncPriority - right.syncPriority;
        }
        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      }),
  );
}

export function listOfflineOperationsForModule(
  moduleId: string,
  tenantKey?: string,
) {
  return listOfflineOperations().then((operations) =>
    operations.filter(
      (operation) =>
        operation.moduleId === moduleId &&
        operation.status !== "SYNCED" &&
        (!tenantKey || operation.tenantKey === tenantKey),
    ),
  );
}

export function findOfflineOperationForLocalEntity(
  moduleId: string,
  tenantKey: string,
  tempId: string,
  operation?: string,
) {
  return listOfflineOperations().then((operations) =>
    operations.find(
      (candidate) =>
        candidate.tenantKey === tenantKey &&
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
  return getOfflineOutboxSummaryForTenant();
}

export async function getOfflineOutboxSummaryForTenant(tenantKey?: string) {
  const operations = await listOfflineOperations();
  const pending = operations.filter(
    (operation) =>
      operation.status !== "SYNCED" &&
      (!tenantKey || operation.tenantKey === tenantKey),
  );
  const operationMap = new Map(
    pending.map((operation) => [operation.operationId, operation]),
  );
  const items: OfflineOutboxSummaryItem[] = pending.map((operation) => {
    const blockingDependency = operation.dependsOn
      .map((dependencyId) => operationMap.get(dependencyId) ?? null)
      .find((dependency) => dependency?.status === "FAILED_BLOCKING");

    return {
      operationId: operation.operationId,
      tenantKey: operation.tenantKey,
      moduleId: operation.moduleId,
      entityType: operation.entityType,
      operation: operation.operation,
      label: describeOperation(operation),
      status: operation.status,
      createdAt: operation.createdAt,
      lastError: operation.lastError,
      blockedByOperationId: blockingDependency?.operationId,
      blockedReason: blockingDependency
        ? blockingDependency.lastError ||
          `Waiting for ${describeOperation(blockingDependency)}`
        : undefined,
    };
  });
  return {
    pendingCount: pending.length,
    blockingCount: items.filter(
      (operation) =>
        operation.status === "FAILED_BLOCKING" ||
        Boolean(operation.blockedByOperationId),
    ).length,
    operations: pending,
    items,
  };
}
