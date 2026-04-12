import { getEnabledOfflineModules, syncOfflineOperation } from "@/lib/offline/module-registry";
import { listPendingOfflineOperations } from "@/lib/offline/outbox";
import type { OfflineOutboxOperation } from "@/lib/offline/types";

function operationIsReady(
  operationId: string,
  syncedOrSkipped: Set<string>,
  pendingOperationIds: Set<string>,
  dependsOn: string[],
) {
  if (dependsOn.length === 0) return true;
  return dependsOn.every(
    (dependencyId) =>
      syncedOrSkipped.has(dependencyId) || !pendingOperationIds.has(dependencyId),
  );
}

function shouldSkipForRetryWindow(nextRetryAt: string | undefined, force: boolean) {
  if (force || !nextRetryAt) return false;
  const parsed = Date.parse(nextRetryAt);
  if (Number.isNaN(parsed)) return false;
  return parsed > Date.now();
}

function asRecordPayload(
  payload: unknown,
): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}

function isLegacyScrapIdRecoverable(operation: OfflineOutboxOperation) {
  if (operation.moduleId !== "scrap-metal") return false;
  if (operation.status !== "FAILED_BLOCKING") return false;

  const payload = asRecordPayload(operation.payload);
  const lastError = String(operation.lastError ?? "").toUpperCase();

  if (operation.operation === "create-inbound-ticket") {
    const number = String(payload?.purchaseNumber ?? "").toUpperCase();
    return (
      number.startsWith("SMP-") ||
      lastError.includes("INVALID SCRAP_METAL_PURCHASE IDENTIFIER FORMAT")
    );
  }

  if (operation.operation === "create-outbound-ticket") {
    const number = String(payload?.saleNumber ?? "").toUpperCase();
    return (
      number.startsWith("SMS-") ||
      lastError.includes("INVALID SCRAP_METAL_SALE IDENTIFIER FORMAT")
    );
  }

  return false;
}

export async function syncOfflineRuntime(options?: {
  enabledFeatures?: string[];
  force?: boolean;
  tenantKey?: string;
}) {
  const modules = getEnabledOfflineModules(options?.enabledFeatures);
  const allowedModuleIds = new Set(modules.map((moduleDefinition) => moduleDefinition.moduleId));
  const pendingOperations = (
    await listPendingOfflineOperations({ tenantKey: options?.tenantKey })
  ).filter((operation) => allowedModuleIds.has(operation.moduleId));

  const pendingOperationIds = new Set(
    pendingOperations.map((operation) => operation.operationId),
  );
  const syncedOrSkipped = new Set<string>();
  const invalidateQueryKeys: unknown[][] = [];
  let syncedCount = 0;
  let retryableCount = 0;
  let blockingCount = 0;

  for (const operation of pendingOperations) {
    const autoRecoverableBlocking = isLegacyScrapIdRecoverable(operation);

    if (
      operation.status === "FAILED_BLOCKING" &&
      !options?.force &&
      !autoRecoverableBlocking
    ) {
      blockingCount += 1;
      continue;
    }

    if (shouldSkipForRetryWindow(operation.nextRetryAt, Boolean(options?.force))) {
      syncedOrSkipped.add(operation.operationId);
      continue;
    }

    if (
      !operationIsReady(
        operation.operationId,
        syncedOrSkipped,
        pendingOperationIds,
        operation.dependsOn,
      )
    ) {
      continue;
    }

    const result = await syncOfflineOperation(operation);
    invalidateQueryKeys.push(...result.invalidateQueryKeys);
    syncedOrSkipped.add(operation.operationId);

    if (result.outcome === "synced") {
      syncedCount += 1;
    } else if (result.outcome === "retryable") {
      retryableCount += 1;
    } else {
      blockingCount += 1;
    }
  }

  return {
    syncedCount,
    retryableCount,
    blockingCount,
    invalidateQueryKeys,
  };
}
