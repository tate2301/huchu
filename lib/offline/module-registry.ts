import {
  fetchDisciplinaryActions,
  fetchEmployees,
  fetchHrIncidents,
  fetchShiftGroups,
  fetchShiftGroupSchedules,
  fetchSites,
} from "@/lib/api";
import type { QueryClient } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import { markOfflineLocalEntitySynced, resolveOfflineEntityServerId } from "@/lib/offline/entity-store";
import { getOfflineWarmupModuleIds } from "@/lib/offline/workflow-catalog";
import {
  markOfflineOperationBlockingFailure,
  markOfflineOperationRetryableFailure,
  markOfflineOperationStatus,
  markOfflineOperationSynced,
} from "@/lib/offline/outbox";
import { hasTokenFeature } from "@/lib/platform/gating/token-check";
import { onPairedTill } from "@/lib/retail/till-presence";
import type {
  OfflineModuleDefinition,
  OfflineMutationAdapter,
  OfflineOutboxOperation,
  OfflinePreloadQuery,
  OfflineRouteDefinition,
  OfflineSyncOutcome,
} from "@/lib/offline/types";

function isLikelyNetworkFailure(message: string) {
  return /network|failed to fetch|load failed|networkerror/i.test(message);
}

function asErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Offline sync failed";
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

async function syncRetailSale(
  operation: OfflineOutboxOperation,
  payload: Record<string, unknown>,
): Promise<OfflineSyncOutcome> {
  try {
    /**
     * S-7.3. When the till actually rang this sale.
     *
     * The server needs it to tell a superseded shelf price from an unexplained
     * one — a price change cannot reach back in time, so a price rewritten after
     * this instant did not reach the device and the device was right. Without it
     * every offline sale whose price the shop has since edited is refused with
     * "manager approval is required", which is approval no queue can obtain, and
     * money the shop already took is lost from the books.
     *
     * The payload's own stamp wins when it has one; otherwise the outbox row's
     * `createdAt` is the moment the sale was queued, which is the moment it was
     * rung.
     */
    const offlineCreatedAt =
      typeof payload.offlineCreatedAt === "string" ? payload.offlineCreatedAt : operation.createdAt;
    await fetchJson("/api/v2/retail/pos/sales", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        offlineCreatedAt,
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

/*
  Every preload names the feature its endpoint is gated on.

  The module being enabled is not the same as every endpoint in it being
  reachable. A gold CLERK holds `hr.employees` and `hr.attendance`, so the HR
  offline module preloads for them — and then asks for incidents, disciplinary
  actions and the site list, none of which they are entitled to. Three 403s per
  page, retried, on screens with nothing to do with HR.

  Keys taken from `lib/platform/gating/route-registry.ts`, which is the one
  place that says what gates a route. An endpoint with no entry there needs no
  tag here.
*/
const hrWorkforceCorePreloadQueries: OfflinePreloadQuery[] = [
  {
    key: "hr-employees-active",
    queryKey: ["employees", "", "active"],
    featureKey: "hr.employees",
    fetcher: async () => fetchEmployees({ active: true, limit: 500 }),
  },
  {
    key: "hr-sites-default",
    queryKey: ["sites"],
    // `/api/sites` is gated on `admin.sites-sections`; a clerk has no admin
    // features at all and took a 403 on every page carrying this module.
    featureKey: "admin.sites-sections",
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
    featureKey: "hr.employees",
    fetcher: async () => fetchEmployees({ active: true, limit: 500 }),
  },
  {
    key: "hr-incident-sites",
    queryKey: ["sites", "hr-incidents"],
    featureKey: "admin.sites-sections",
    fetcher: async () => fetchSites(),
  },
  {
    key: "hr-incidents-default",
    queryKey: ["hr-incidents", "", "ALL"],
    featureKey: "hr.incidents",
    fetcher: async () => fetchHrIncidents({ limit: 300 }),
  },
  {
    key: "hr-disciplinary-actions-default",
    queryKey: ["disciplinary-actions", "", "ALL"],
    featureKey: "hr.disciplinary-actions",
    fetcher: async () => fetchDisciplinaryActions({ limit: 300 }),
  },
];

const retailPreloadQueries: OfflinePreloadQuery[] = [
  {
    key: "retail-sites",
    queryKey: ["pos-sites"],
    featureKey: "admin.sites-sections",
    fetcher: async () => fetchSites(),
  },
  {
    key: "retail-current-shift",
    // `pos/current-shift` answers only a till (409 NOT_A_TILL elsewhere).
    enabled: onPairedTill,
    queryKey: ["retail-current-shift"],
    featureKey: "retail.pos",
    fetcher: async () => fetchJson("/api/v2/retail/pos/current-shift"),
  },
  {
    key: "retail-promotions",
    queryKey: ["retail-pos-promotions"],
    // `route-registry.ts:424` gates /api/v2/retail/promotions on
    // `retail.promotions`. A cashier signing in took a 403 here.
    featureKey: "retail.promotions",
    fetcher: async () => fetchJson("/api/v2/retail/promotions?status=ACTIVE&pos=1"),
  },
  {
    key: "retail-pos-pricing",
    // The price snapshot's live bundles and buy-more deals: offline, the till
    // prices a sale by the same sum `pos/sales` runs (PRD-08).
    enabled: onPairedTill,
    queryKey: ["retail-pos-pricing"],
    featureKey: "retail.pos",
    fetcher: async () => fetchJson("/api/v2/retail/pos/pricing"),
  },
  /*
    No till rules preload: they reach the till through `devices/me`
    (`components/retail/till/state.tsx`, SET-06), and that query is persisted with the
    rest of the tenant's cache, so the till has them offline too.
  */
  {
    key: "retail-catalog-default",
    // `pos/current-shift` answers only a till (409 NOT_A_TILL elsewhere).
    enabled: onPairedTill,
    queryKey: async () => {
      const shift = await fetchJson<{ data: { siteId?: string | null } | null }>(
        "/api/v2/retail/pos/current-shift",
      );
      const siteId = shift.data?.siteId;
      return siteId ? ["retail-pos-catalog", siteId, ""] : null;
    },
    // The key carries the site so the till's own query finds it; the route reads the device's.
    fetcher: async () => fetchJson("/api/v2/retail/pos/catalog?search="),
  },
  {
    key: "retail-held-carts",
    // `pos/current-shift` answers only a till (409 NOT_A_TILL elsewhere).
    enabled: onPairedTill,
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
    // `pos/current-shift` answers only a till (409 NOT_A_TILL elsewhere).
    enabled: onPairedTill,
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
    featureKey: "retail.pos",
    fetcher: async () =>
      fetchJson("/api/v2/retail/pos/sales?scope=mine&limit=120&search="),
  },
  {
    key: "retail-pos-customers-default",
    queryKey: ["retail-pos-customers", ""],
    /*
      30 is the route's ceiling — `customerSearchQuery` caps `limit` there and
      zod refuses anything larger. At 40 this 400'd, and because the offline
      warm-up runs on every page of every tenant, it did so everywhere: the
      e2e suite saw it eighteen times across the school module alone, on pages
      with nothing to do with retail.

      Worth knowing the request is thin either way: the route short-circuits an
      empty `q` to `{ data: [] }`, so this warms the cache with an empty list.
      Whether the offline bundle should instead pre-cache the customer *list*
      is a real question and a separate one; this change only stops it failing.
    */
    // `/api/v2/retail/customers` is gated on `crm.customers`.
    featureKey: "crm.customers",
    fetcher: async () =>
      fetchJson("/api/v2/retail/customers/search?q=&limit=30"),
  },
  {
    key: "retail-pos-price-check-default",
    // `pos/current-shift` answers only a till (409 NOT_A_TILL elsewhere).
    enabled: onPairedTill,
    queryKey: async () => {
      const shift = await fetchJson<{ data: { siteId?: string | null } | null }>(
        "/api/v2/retail/pos/current-shift",
      );
      const siteId = shift.data?.siteId;
      return siteId ? ["retail-pos-price-check", siteId, ""] : null;
    },
    // The key carries the site so the till's own query finds it; the route reads the device's.
    fetcher: async () => fetchJson("/api/v2/retail/pos/catalog?search="),
  },
];

const retailMutationAdapters: OfflineMutationAdapter[] = [
  {
    operation: "create-customer",
    sync: ({ resolvedPayload }) => syncRetailCustomer(resolvedPayload),
  },
  {
    operation: "create-sale",
    sync: ({ operation, resolvedPayload }) => syncRetailSale(operation, resolvedPayload),
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
    primaryFlowLabel: "HR workforce support",
    criticalRoutes: hrWorkforceCoreRoutes,
    routes: createWarmupRoutes(hrWorkforceCoreRoutes),
    preloadQueries: hrWorkforceCorePreloadQueries,
    entityAdapters: [],
    mutationAdapters: [],
  },
  {
    moduleId: "retail-pos",
    syncPriority: 20,
    primaryFlowLabel: "POS checkout",
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

/**
 * The pages a module needs offline. A route with no explicit definitions
 * warms its critical and warm-up paths as they are written.
 */
export function getOfflineRouteDefinitions(
  moduleDefinition: OfflineModuleDefinition,
): OfflineRouteDefinition[] {
  if (moduleDefinition.routes && moduleDefinition.routes.length > 0) {
    return moduleDefinition.routes;
  }
  return [
    ...new Set([...moduleDefinition.criticalRoutes, ...(moduleDefinition.warmupRoutes ?? [])]),
  ].map((route) => ({
    canonicalRoute: route,
    matchPaths: [route],
    warmupUrls: [route],
    critical: moduleDefinition.criticalRoutes.includes(route),
  }));
}

/**
 * Fetch the data each module's pages open on, so they have it offline.
 *
 * Gated by the session's features, not just by the module being on: a module
 * being enabled is not the same as every endpoint in it being reachable, and
 * a preload the session cannot reach is a 403 on every warm-up. Failures are
 * swallowed — a warm-up is best effort, and the page fetches for itself.
 */
export async function prefetchOfflineModuleQueries(
  modules: OfflineModuleDefinition[],
  queryClient: QueryClient,
  enabledFeatures: string[],
) {
  for (const moduleDefinition of modules) {
    for (const preloadQuery of moduleDefinition.preloadQueries) {
      if (preloadQuery.enabled && !preloadQuery.enabled()) continue;
      if (preloadQuery.featureKey && !hasTokenFeature(enabledFeatures, preloadQuery.featureKey)) {
        continue;
      }
      try {
        const queryKey =
          typeof preloadQuery.queryKey === "function"
            ? await preloadQuery.queryKey()
            : preloadQuery.queryKey;
        if (!queryKey) continue;
        await queryClient.prefetchQuery({
          queryKey,
          queryFn: () => preloadQuery.fetcher(queryKey),
          staleTime: preloadQuery.maxAgeMs ?? 5 * 60_000,
        });
      } catch {
        // Best effort; see above.
      }
    }
  }
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

