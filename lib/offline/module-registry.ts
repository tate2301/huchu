import {
  fetchDisciplinaryActions,
  fetchEmployees,
  fetchHrIncidents,
  fetchShiftGroups,
  fetchShiftGroupSchedules,
  fetchSites,
} from "@/lib/api";
import { fetchJson } from "@/lib/api-client";
import { markOfflineLocalEntitySynced, resolveOfflineEntityServerId } from "@/lib/offline/entity-store";
import { getOfflineWarmupModuleIds } from "@/lib/offline/workflow-catalog";
import {
  markOfflineOperationBlockingFailure,
  markOfflineOperationRetryableFailure,
  markOfflineOperationStatus,
  markOfflineOperationSynced,
} from "@/lib/offline/outbox";
import type {
  OfflineModuleDefinition,
  OfflineMutationPolicy,
  OfflineMutationAdapter,
  OfflineOutboxOperation,
  OfflinePreloadQuery,
  OfflineSyncOutcome,
} from "@/lib/offline/types";

function isLikelyNetworkFailure(message: string) {
  return /network|failed to fetch|load failed|networkerror/i.test(message);
}

function asErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Offline sync failed";
}

function normalizeLegacyDocumentNumber(
  prefix: "RSL",
  rawValue: unknown,
) {
  if (typeof rawValue !== "string") return undefined;
  const trimmed = rawValue.trim().toUpperCase();
  if (!trimmed) return undefined;
  if (new RegExp(`^${prefix}-\\d+$`, "i").test(trimmed)) {
    return trimmed;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return undefined;
  return `${prefix}-${digits.slice(-12)}`;
}

async function syncRetailCustomer(payload: Record<string, unknown>): Promise<OfflineSyncOutcome> {
  try {
    const created = await fetchJson<{ data: { id: string } }>("/api/v2/retail/customers", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return {
      status: "synced",
      serverEntityId: created.data.id,
      invalidateQueryKeys: [["retail-pos-customer-search"]],
    };
  } catch (error) {
    const message = asErrorMessage(error);
    return isLikelyNetworkFailure(message)
      ? { status: "retryable", message }
      : { status: "blocking", message };
  }
}

async function syncRetailSale(payload: Record<string, unknown>): Promise<OfflineSyncOutcome> {
  try {
    const saleNo = normalizeLegacyDocumentNumber("RSL", payload.saleNo);
    await fetchJson("/api/v2/retail/pos/sales", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        saleNo,
      }),
    });
    return {
      status: "synced",
      invalidateQueryKeys: [
        ["retail-current-shift"],
        ["retail-pos-sales"],
        ["retail-pos-catalog"],
      ],
    };
  } catch (error) {
    const message = asErrorMessage(error);
    return isLikelyNetworkFailure(message)
      ? { status: "retryable", message }
      : { status: "blocking", message };
  }
}

const hrWorkforceCorePreloadQueries: OfflinePreloadQuery[] = [
  {
    key: "hr-employees-active",
    queryKey: ["employees", "", "active"],
    fetcher: async () => fetchEmployees({ active: true, limit: 500 }),
  },
  {
    key: "hr-sites-default",
    queryKey: ["sites"],
    fetcher: async () => fetchSites(),
  },
  {
    key: "hr-shift-groups-default",
    queryKey: ["shift-groups", "", undefined],
    fetcher: async () => fetchShiftGroups({ limit: 300 }),
  },
  {
    key: "hr-shift-schedules-default",
    queryKey: ["shift-group-schedules", "", undefined],
    fetcher: async () => fetchShiftGroupSchedules({ limit: 300 }),
  },
  {
    key: "hr-incident-employees",
    queryKey: ["employees", "hr-incidents"],
    fetcher: async () => fetchEmployees({ active: true, limit: 500 }),
  },
  {
    key: "hr-incident-sites",
    queryKey: ["sites", "hr-incidents"],
    fetcher: async () => fetchSites(),
  },
  {
    key: "hr-incidents-default",
    queryKey: ["hr-incidents", "", "ALL"],
    fetcher: async () => fetchHrIncidents({ limit: 300 }),
  },
  {
    key: "hr-disciplinary-actions-default",
    queryKey: ["disciplinary-actions", "", "ALL"],
    fetcher: async () => fetchDisciplinaryActions({ limit: 300 }),
  },
];

const retailPreloadQueries: OfflinePreloadQuery[] = [
  {
    key: "retail-sites",
    queryKey: ["pos-sites"],
    fetcher: async () => fetchSites(),
  },
  {
    key: "retail-current-shift",
    queryKey: ["retail-current-shift"],
    fetcher: async () => fetchJson("/api/v2/retail/pos/current-shift"),
  },
  {
    key: "retail-promotions",
    queryKey: ["retail-pos-promotions"],
    fetcher: async () => fetchJson("/api/v2/retail/promotions?status=ACTIVE&pos=1"),
  },
  {
    key: "retail-tender-policy",
    queryKey: ["retail-pos-tender-policy"],
    fetcher: async () => fetchJson("/api/v2/retail/setup/tender-policy"),
  },
  {
    key: "retail-catalog-default",
    queryKey: async () => {
      const shift = await fetchJson<{ data: { siteId?: string | null } | null }>(
        "/api/v2/retail/pos/current-shift",
      );
      const siteId = shift.data?.siteId;
      return siteId ? ["retail-pos-catalog", siteId, ""] : null;
    },
    fetcher: async (queryKey) => {
      const siteId = String(queryKey[1] ?? "");
      return fetchJson(
        `/api/v2/retail/pos/catalog?siteId=${encodeURIComponent(siteId)}&search=`,
      );
    },
  },
  {
    key: "retail-held-carts",
    queryKey: async () => {
      const shift = await fetchJson<{ data: { id?: string | null } | null }>(
        "/api/v2/retail/pos/current-shift",
      );
      const shiftId = shift.data?.id;
      return shiftId ? ["retail-held-carts", shiftId] : null;
    },
    fetcher: async (queryKey) => {
      const shiftId = String(queryKey[1] ?? "");
      return fetchJson(
        `/api/v2/retail/pos/held-carts?shiftId=${encodeURIComponent(shiftId)}`,
      );
    },
  },
  {
    key: "retail-pos-sales-overview",
    queryKey: async () => {
      const shift = await fetchJson<{ data: { id?: string | null } | null }>(
        "/api/v2/retail/pos/current-shift",
      );
      const shiftId = shift.data?.id;
      return shiftId ? ["retail-pos-sales-overview", shiftId] : null;
    },
    fetcher: async () =>
      fetchJson("/api/v2/retail/pos/sales?scope=mine&limit=12"),
  },
  {
    key: "retail-pos-sales-history",
    queryKey: ["retail-pos-sales", ""],
    fetcher: async () =>
      fetchJson("/api/v2/retail/pos/sales?scope=mine&limit=120&search="),
  },
  {
    key: "retail-pos-customers-default",
    queryKey: ["retail-pos-customers", ""],
    fetcher: async () =>
      fetchJson("/api/v2/retail/customers/search?q=&limit=40"),
  },
  {
    key: "retail-pos-price-check-default",
    queryKey: async () => {
      const shift = await fetchJson<{ data: { siteId?: string | null } | null }>(
        "/api/v2/retail/pos/current-shift",
      );
      const siteId = shift.data?.siteId;
      return siteId ? ["retail-pos-price-check", siteId, ""] : null;
    },
    fetcher: async (queryKey) => {
      const siteId = String(queryKey[1] ?? "");
      return fetchJson(
        `/api/v2/retail/pos/catalog?siteId=${encodeURIComponent(siteId)}&search=`,
      );
    },
  },
];

const retailMutationAdapters: OfflineMutationAdapter[] = [
  {
    operation: "create-customer",
    sync: ({ resolvedPayload }) => syncRetailCustomer(resolvedPayload),
  },
  {
    operation: "create-sale",
    sync: ({ resolvedPayload }) => syncRetailSale(resolvedPayload),
  },
];

function createWarmupRoutes(
  routes: string[],
  criticalRoutes?: string[],
) {
  const criticalSet = new Set(criticalRoutes ?? routes);
  return Array.from(new Set(routes)).map((href) => ({
    canonicalRoute: href,
    matchPaths: [href],
    warmupUrls: [href],
    critical: criticalSet.has(href),
  }));
}

const hrWorkforceCoreRoutes = [
  "/people",
  "/people/rosters",
  "/people/incidents",
];

export const OFFLINE_MODULES: OfflineModuleDefinition[] = [
  {
    moduleId: "hr-workforce-core",
    syncPriority: 16,
    bootstrapPriority: 16,
    primaryFlowLabel: "HR workforce support",
    warmupBudget: "standard",
    criticalRoutes: hrWorkforceCoreRoutes,
    routes: createWarmupRoutes(hrWorkforceCoreRoutes),
    preloadQueries: hrWorkforceCorePreloadQueries,
    entityAdapters: [],
    mutationAdapters: [],
  },
  {
    moduleId: "retail-pos",
    syncPriority: 20,
    bootstrapPriority: 20,
    primaryFlowLabel: "POS checkout",
    warmupBudget: "aggressive",
    criticalRoutes: [
      "/portal/pos",
      "/portal/pos/overview",
      "/portal/pos/history",
      "/portal/pos/held",
      "/portal/pos/customers",
      "/portal/pos/shift",
      "/portal/pos/price-check",
      "/portal/pos/login",
    ],
    routes: [
      {
        canonicalRoute: "pos-checkout",
        matchPaths: ["/portal/pos", "/"],
        warmupUrls: ["/portal/pos", "/"],
        critical: true,
      },
      {
        canonicalRoute: "pos-overview",
        matchPaths: ["/portal/pos/overview", "/overview"],
        warmupUrls: ["/portal/pos/overview", "/overview"],
        critical: true,
      },
      {
        canonicalRoute: "pos-history",
        matchPaths: ["/portal/pos/history", "/history"],
        warmupUrls: ["/portal/pos/history", "/history"],
        critical: true,
      },
      {
        canonicalRoute: "pos-held",
        matchPaths: ["/portal/pos/held", "/held"],
        warmupUrls: ["/portal/pos/held", "/held"],
        critical: true,
      },
      {
        canonicalRoute: "pos-customers",
        matchPaths: ["/portal/pos/customers", "/customers"],
        warmupUrls: ["/portal/pos/customers", "/customers"],
      },
      {
        canonicalRoute: "pos-shift",
        matchPaths: ["/portal/pos/shift", "/shift"],
        warmupUrls: ["/portal/pos/shift", "/shift"],
      },
      {
        canonicalRoute: "pos-price-check",
        matchPaths: ["/portal/pos/price-check", "/price-check"],
        warmupUrls: ["/portal/pos/price-check", "/price-check"],
      },
      {
        canonicalRoute: "pos-login",
        matchPaths: ["/portal/pos/login", "/login"],
        warmupUrls: ["/portal/pos/login", "/login"],
      },
    ],
    shellAssets: ["/icon-192.svg", "/icon-512.svg"],
    preloadQueries: retailPreloadQueries,
    entityAdapters: [
      {
        entityType: "customer",
        displayLabel: (payload) => String(payload.name ?? "Customer"),
        searchableText: (payload) =>
          [payload.name, payload.phone, payload.email].filter(Boolean).join(" "),
      },
    ],
    mutationAdapters: retailMutationAdapters,
  },
];

export function getOfflineModule(moduleId: string) {
  return OFFLINE_MODULES.find((moduleDefinition) => moduleDefinition.moduleId === moduleId) ?? null;
}

export function getEnabledOfflineModules(enabledFeatures?: string[]) {
  const allowedModuleIds = new Set(getOfflineWarmupModuleIds(enabledFeatures));
  return OFFLINE_MODULES.filter((moduleDefinition) =>
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

