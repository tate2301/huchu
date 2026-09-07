/**
 * Which offline modules exist, and how an outbox operation is synced.
 *
 * The definitions — which routes to warm, which queries to preload, how to
 * sync a held sale — belong to the modules that own the screens. The host
 * registers them on both sides (`modules.client.ts`); this file keeps the
 * registry and the engine and names no module.
 */
import { markOfflineLocalEntitySynced, resolveOfflineEntityServerId } from "./entity-store";
import { registry } from "@corelithzw/platform/registry";
import { getOfflineWarmupModuleIds } from "./workflow-catalog";
import {
  markOfflineOperationBlockingFailure,
  markOfflineOperationRetryableFailure,
  markOfflineOperationStatus,
  markOfflineOperationSynced,
} from "./outbox";
import type {
  OfflineModuleDefinition,
  OfflineMutationPolicy,
  OfflineMutationAdapter,
  OfflineOutboxOperation,
  OfflinePreloadQuery,
  OfflineSyncOutcome,
} from "./types";

const modules = registry<Map<string, OfflineModuleDefinition>>("offline.modules", () => new Map());

export function registerOfflineModules(definitions: readonly OfflineModuleDefinition[]): void {
  for (const definition of definitions) modules.set(definition.moduleId, definition);
}

export function registeredOfflineModules(): OfflineModuleDefinition[] {
  return [...modules.values()];
}

/** For a sync adapter deciding whether a failed request is worth retrying. */
export function isLikelyNetworkFailure(message: string) {
  return /network|failed to fetch|load failed|networkerror/i.test(message);
}

export function asErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Offline sync failed";
}

export function getOfflineModule(moduleId: string) {
  return registeredOfflineModules().find((moduleDefinition) => moduleDefinition.moduleId === moduleId) ?? null;
}

export function getEnabledOfflineModules(enabledFeatures?: string[]) {
  const allowedModuleIds = new Set(getOfflineWarmupModuleIds(enabledFeatures));
  return registeredOfflineModules().filter((moduleDefinition) =>
    allowedModuleIds.has(moduleDefinition.moduleId),
  );
}

export function getOfflineMutationPolicy(
  moduleId: string,
  operation: string,
): OfflineMutationPolicy {
  const moduleDefinition = getOfflineModule(moduleId);
  if (!moduleDefinition) {
    return "excluded";
  }
  const adapter = moduleDefinition.mutationAdapters.find(
    (candidate) => candidate.operation === operation,
  );
  if (adapter) {
    return "offline-safe";
  }
  return "online-only";
}

function defaultRetryAt(retryCount: number) {
  const delayMs = Math.min(15 * 60_000, Math.max(5_000, 5_000 * 2 ** retryCount));
  return new Date(Date.now() + delayMs).toISOString();
}

function clonePayload<T>(payload: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(payload);
  }
  return JSON.parse(JSON.stringify(payload)) as T;
}

async function resolvePayloadLocalRefs(operation: OfflineOutboxOperation) {
  const payload = clonePayload(operation.payload) as Record<string, unknown>;
  if (!operation.localRefs) return payload;
  for (const [field, tempId] of Object.entries(operation.localRefs)) {
    if (field === "entityId") continue;
    const serverId = await resolveOfflineEntityServerId(
      operation.tenantKey,
      tempId,
    );
    if (serverId) {
      payload[field] = serverId;
    }
  }
  return payload;
}

export async function syncOfflineOperation(operation: OfflineOutboxOperation) {
  const moduleDefinition = getOfflineModule(operation.moduleId);
  const adapter = moduleDefinition?.mutationAdapters.find(
    (candidate) => candidate.operation === operation.operation,
  );

  if (!moduleDefinition || !adapter) {
    await markOfflineOperationBlockingFailure(
      operation.operationId,
      `No offline sync handler exists for ${operation.moduleId}:${operation.operation}`,
    );
    return {
      moduleId: operation.moduleId,
      outcome: "blocking" as const,
      invalidateQueryKeys: [] as unknown[][],
    };
  }

  await markOfflineOperationStatus(operation.operationId, "SYNCING");

  const resolvedPayload = await resolvePayloadLocalRefs(operation);
  const outcome = await adapter.sync({
    operation,
    resolvedPayload,
  });

  if (outcome.status === "synced") {
    await markOfflineOperationSynced(operation.operationId);
    const localEntityId = operation.localRefs?.entityId;
    if (localEntityId && outcome.serverEntityId) {
      await markOfflineLocalEntitySynced(
        operation.tenantKey,
        localEntityId,
        outcome.serverEntityId,
      );
    }
    return {
      moduleId: operation.moduleId,
      outcome: "synced" as const,
      invalidateQueryKeys: outcome.invalidateQueryKeys ?? [],
    };
  }

  if (outcome.status === "retryable") {
    await markOfflineOperationRetryableFailure(
      operation.operationId,
      outcome.message,
      outcome.retryAt ?? defaultRetryAt(operation.retryCount + 1),
    );
    return {
      moduleId: operation.moduleId,
      outcome: "retryable" as const,
      invalidateQueryKeys: outcome.invalidateQueryKeys ?? [],
    };
  }

  await markOfflineOperationBlockingFailure(operation.operationId, outcome.message);
  return {
    moduleId: operation.moduleId,
    outcome: "blocking" as const,
    invalidateQueryKeys: outcome.invalidateQueryKeys ?? [],
  };
}

