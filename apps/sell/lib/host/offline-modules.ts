/**
 * The offline modules this host composes: the workforce essentials and the
 * till. Each names its module's routes, queries and sync adapters, and moves
 * into that module when the manifests carry offline workflows; the runtime
 * they plug into is `@corelithzw/module-offline`.
 */
import { fetchDisciplinaryActions, fetchEmployees, fetchHrIncidents, fetchShiftGroups, fetchShiftGroupSchedules } from "@corelithzw/module-people/api-client";
import { fetchSites } from "@corelithzw/platform/client/sites";
import { fetchJson } from "@corelithzw/platform/api-client";
import { markOfflineLocalEntitySynced, resolveOfflineEntityServerId } from "@corelithzw/module-offline/entity-store";
import { asErrorMessage, isLikelyNetworkFailure } from "@corelithzw/module-offline/module-registry";
import type {
  OfflineModuleDefinition,
  OfflineMutationAdapter,
  OfflineOutboxOperation,
  OfflinePreloadQuery,
  OfflineSyncOutcome,
} from "@corelithzw/module-offline/types";

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

async function syncRetailSale(
  operation: OfflineOutboxOperation,
  payload: Record<string, unknown>,
): Promise<OfflineSyncOutcome> {
  try {
    const saleNo = normalizeLegacyDocumentNumber("RSL", payload.saleNo);
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
     * The payload's own stamp wins when it has one (`lib/retail/offline-sale.ts`
     * writes it); otherwise the outbox row's `createdAt` is the moment the sale
     * was queued, which is the moment it was rung.
     */
    const offlineCreatedAt =
      typeof payload.offlineCreatedAt === "string" ? payload.offlineCreatedAt : operation.createdAt;
    await fetchJson("/api/v2/retail/pos/sales", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        saleNo,
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
