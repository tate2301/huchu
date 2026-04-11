import { OFFLINE_DB_STORES, getOfflineRecord, putOfflineRecord } from "@/lib/offline/db";
import { emitOfflineBootstrapChanged } from "@/lib/offline/events";
import type {
  OfflineBootstrapProgress,
  OfflineModuleDefinition,
  OfflineModulePreparation,
} from "@/lib/offline/types";

const OFFLINE_BOOTSTRAP_PROGRESS_ID = "current";

function nowIso() {
  return new Date().toISOString();
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function getWarmupRoutes(moduleDefinition: OfflineModuleDefinition) {
  return unique([
    ...moduleDefinition.criticalRoutes,
    ...(moduleDefinition.warmupRoutes ?? []),
  ]);
}

function createModulePreparation(
  moduleDefinition: OfflineModuleDefinition,
  existing?: OfflineModulePreparation | null,
): OfflineModulePreparation {
  const warmupRoutes = getWarmupRoutes(moduleDefinition);
  const preparedRoutes = unique(
    (existing?.preparedRoutes ?? []).filter((route) => warmupRoutes.includes(route)),
  );
  const preparedQueryKeys = unique(existing?.preparedQueryKeys ?? []);
  const totalRoutes = warmupRoutes.length;
  const totalQueries = moduleDefinition.preloadQueries.length;
  const isPrepared =
    totalRoutes === preparedRoutes.length && totalQueries === preparedQueryKeys.length;

  return {
    moduleId: moduleDefinition.moduleId,
    primaryFlowLabel: moduleDefinition.primaryFlowLabel,
    bootstrapPriority: moduleDefinition.bootstrapPriority,
    warmupBudget: moduleDefinition.warmupBudget,
    state: isPrepared ? "PREPARED" : existing?.state ?? "NOT_PREPARED",
    totalRoutes,
    preparedRoutes,
    totalQueries,
    preparedQueryKeys,
    lastPreparedAt: existing?.lastPreparedAt ?? null,
  };
}

export function createOfflineBootstrapProgress(
  moduleDefinitions: OfflineModuleDefinition[],
  existing?: OfflineBootstrapProgress | null,
) {
  const existingModules = new Map(
    (existing?.modules ?? []).map((modulePreparation) => [
      modulePreparation.moduleId,
      modulePreparation,
    ]),
  );

  const modules = [...moduleDefinitions]
    .sort((left, right) => left.bootstrapPriority - right.bootstrapPriority)
    .map((moduleDefinition) =>
      createModulePreparation(
        moduleDefinition,
        existingModules.get(moduleDefinition.moduleId) ?? null,
      ),
    );

  const totalSteps = modules.reduce(
    (sum, modulePreparation) =>
      sum + modulePreparation.totalRoutes + modulePreparation.totalQueries,
    0,
  );
  const completedSteps = modules.reduce(
    (sum, modulePreparation) =>
      sum +
      modulePreparation.preparedRoutes.length +
      modulePreparation.preparedQueryKeys.length,
    0,
  );
  const preparedRoutes = unique([
    ...(existing?.preparedRoutes ?? []),
    ...modules.flatMap((modulePreparation) => modulePreparation.preparedRoutes),
  ]);

  return {
    id: OFFLINE_BOOTSTRAP_PROGRESS_ID,
    phase:
      totalSteps > 0 && completedSteps >= totalSteps
        ? "complete"
        : existing?.phase ?? "idle",
    currentStepLabel: existing?.currentStepLabel ?? null,
    totalSteps,
    completedSteps,
    preparedRoutes,
    startedAt: existing?.startedAt ?? null,
    updatedAt: nowIso(),
    lastPreparedAt: existing?.lastPreparedAt ?? null,
    lastSyncedAt: existing?.lastSyncedAt ?? null,
    modules,
  } satisfies OfflineBootstrapProgress;
}

export function getOfflineBootstrapProgress() {
  return getOfflineRecord<OfflineBootstrapProgress>(
    OFFLINE_DB_STORES.bootstrapState,
    OFFLINE_BOOTSTRAP_PROGRESS_ID,
  );
}

export async function saveOfflineBootstrapProgress(progress: OfflineBootstrapProgress) {
  await putOfflineRecord(OFFLINE_DB_STORES.bootstrapState, {
    ...progress,
    updatedAt: nowIso(),
  });
  emitOfflineBootstrapChanged();
}
