import { getEnabledOfflineModules, syncOfflineOperation } from "./module-registry";
import { listPendingOfflineOperations } from "./outbox";

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
    // A blocked operation stays blocked until a human forces it. Scrap used to
    // carve out an exception here for tickets numbered by a superseded scheme;
    // that vertical is gone (ST-2.3), and no surviving module has a class of
    // failure that is safe to retry unattended.
    if (operation.status === "FAILED_BLOCKING" && !options?.force) {
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
