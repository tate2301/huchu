import { getEnabledOfflineModules, syncOfflineOperation } from "@/lib/offline/module-registry";
import { listPendingOfflineOperations } from "@/lib/offline/outbox";

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

export async function syncOfflineRuntime(options?: {
  enabledFeatures?: string[];
  force?: boolean;
}) {
  const modules = getEnabledOfflineModules(options?.enabledFeatures);
  const allowedModuleIds = new Set(modules.map((moduleDefinition) => moduleDefinition.moduleId));
  const pendingOperations = (await listPendingOfflineOperations()).filter((operation) =>
    allowedModuleIds.has(operation.moduleId),
  );

  const pendingOperationIds = new Set(
    pendingOperations.map((operation) => operation.operationId),
  );
  const syncedOrSkipped = new Set<string>();
  const invalidateQueryKeys: unknown[][] = [];
  let syncedCount = 0;
  let retryableCount = 0;
  let blockingCount = 0;

  for (const operation of pendingOperations) {
    if (
      operation.status === "FAILED_BLOCKING" &&
      !options?.force
    ) {
      syncedOrSkipped.add(operation.operationId);
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
