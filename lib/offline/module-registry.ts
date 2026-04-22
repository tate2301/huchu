import {
  fetchDisciplinaryActions,
  fetchEmployees,
  fetchHrIncidents,
  fetchScrapTicketContext,
  fetchShiftGroups,
  fetchShiftGroupSchedules,
  fetchSites,
} from "@/lib/api";
import { fetchJson } from "@/lib/api-client";
import { getOfflineAttachmentRecord } from "@/lib/offline/attachment-store";
import { markOfflineLocalEntitySynced, resolveOfflineEntityServerId } from "@/lib/offline/entity-store";
import { SCRAP_OPERATIONS_SECTIONS } from "@/lib/scrap-metal/tab-config";
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

type UploadResponse = {
  url: string;
  pathname?: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  size: number;
};

function isLikelyNetworkFailure(message: string) {
  return /network|failed to fetch|load failed|networkerror/i.test(message);
}

function asErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Offline sync failed";
}

function normalizeLegacyDocumentNumber(
  prefix: "SCPUR" | "SCSAL" | "RSL",
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

async function uploadOfflineAttachments(
  operation: OfflineOutboxOperation,
  existing: unknown,
) {
  const alreadyUploaded = Array.isArray(existing) ? existing : [];
  if (!operation.attachments || operation.attachments.length === 0) {
    return alreadyUploaded;
  }

  const uploaded = [];
  for (const attachment of operation.attachments) {
    const record = await getOfflineAttachmentRecord(
      attachment.attachmentId,
      operation.tenantKey,
    );
    if (!record) {
      continue;
    }
    const body = new FormData();
    body.append("context", attachment.context);
    body.append(
      "file",
      new File([record.blob], record.fileName, {
        type: record.contentType,
      }),
    );
    const response = await fetch("/api/uploads", {
      method: "POST",
      credentials: "include",
      body,
    });
    const payload = (await response.json().catch(() => null)) as UploadResponse | { error?: string } | null;
    if (!response.ok || !payload || !("url" in payload)) {
      throw new Error(
        payload && "error" in payload && payload.error
          ? payload.error
          : `Attachment upload failed (${response.status})`,
      );
    }
    uploaded.push({
      url: payload.url,
      pathname: payload.pathname,
      contentType: payload.contentType,
      size: payload.size,
      context: attachment.context,
      uploadedAt: new Date().toISOString(),
    });
  }

  return [...alreadyUploaded, ...uploaded];
}

async function syncScrapSeller(payload: Record<string, unknown>): Promise<OfflineSyncOutcome> {
  try {
    const created = await fetchJson<{ id: string }>("/api/scrap-metal/sellers", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return {
      status: "synced",
      serverEntityId: created.id,
      invalidateQueryKeys: [["scrap-sellers", "tickets"]],
    };
  } catch (error) {
    const message = asErrorMessage(error);
    return isLikelyNetworkFailure(message)
      ? { status: "retryable", message }
      : { status: "blocking", message };
  }
}

async function syncScrapInboundTicket(
  operation: OfflineOutboxOperation,
  payload: Record<string, unknown>,
): Promise<OfflineSyncOutcome> {
  try {
    const purchaseNumber = normalizeLegacyDocumentNumber(
      "SCPUR",
      payload.purchaseNumber,
    );
    const attachments = await uploadOfflineAttachments(operation, payload.attachments);
    const created = await fetchJson<{ id: string }>("/api/scrap-metal/purchases", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        purchaseNumber,
        attachments,
      }),
    });
    return {
      status: "synced",
      serverEntityId: created.id,
      invalidateQueryKeys: [
        ["scrap-held-inbound-total"],
        ["scrap-metal-purchases"],
      ],
    };
  } catch (error) {
    const message = asErrorMessage(error);
    return isLikelyNetworkFailure(message)
      ? { status: "retryable", message }
      : { status: "blocking", message };
  }
}

async function syncScrapOutboundTicket(
  operation: OfflineOutboxOperation,
  payload: Record<string, unknown>,
): Promise<OfflineSyncOutcome> {
  try {
    const saleNumber = normalizeLegacyDocumentNumber(
      "SCSAL",
      payload.saleNumber,
    );
    const attachments = await uploadOfflineAttachments(operation, payload.attachments);
    const created = await fetchJson<{ id: string }>("/api/scrap-metal/sales", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        saleNumber,
        attachments,
      }),
    });
    return {
      status: "synced",
      serverEntityId: created.id,
      invalidateQueryKeys: [
        ["scrap-held-outbound-total"],
        ["scrap-metal-sales"],
      ],
    };
  } catch (error) {
    const message = asErrorMessage(error);
    return isLikelyNetworkFailure(message)
      ? { status: "retryable", message }
      : { status: "blocking", message };
  }
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

const scrapTicketingPreloadQueries: OfflinePreloadQuery[] = [
  {
    key: "scrap-ticket-context",
    queryKey: ["scrap-ticket-context"],
    fetcher: async () => fetchScrapTicketContext(),
  },
  {
    key: "scrap-materials",
    queryKey: ["scrap-materials", "tickets"],
    fetcher: async () => fetchJson("/api/scrap-metal/materials?active=true&limit=500"),
  },
  {
    key: "scrap-sellers",
    queryKey: ["scrap-sellers", "tickets"],
    fetcher: async () => fetchJson("/api/scrap-metal/sellers?active=true&limit=500"),
  },
  {
    key: "scrap-prices",
    queryKey: ["scrap-prices", "tickets"],
    fetcher: async () => fetchJson("/api/scrap-metal/pricing?limit=500"),
  },
  {
    key: "scrap-batches",
    queryKey: ["scrap-batches", "tickets"],
    fetcher: async () => fetchJson("/api/scrap-metal/batches?limit=500"),
  },
  {
    key: "scrap-held-inbound-total",
    queryKey: ["scrap-held-inbound-total"],
    fetcher: async () => fetchJson("/api/scrap-metal/purchases?status=DRAFT&limit=1"),
  },
  {
    key: "scrap-held-outbound-total",
    queryKey: ["scrap-held-outbound-total"],
    fetcher: async () => fetchJson("/api/scrap-metal/sales?status=DRAFT&limit=1"),
  },
  {
    key: "scrap-held-inbound-tickets",
    queryKey: ["scrap-held-inbound-tickets"],
    fetcher: async () => fetchJson("/api/scrap-metal/purchases?status=DRAFT&limit=500"),
  },
  {
    key: "scrap-held-outbound-tickets",
    queryKey: ["scrap-held-outbound-tickets"],
    fetcher: async () => fetchJson("/api/scrap-metal/sales?status=DRAFT&limit=500"),
  },
  {
    key: "scrap-purchases-register",
    queryKey: ["scrap-metal-purchases"],
    fetcher: async () => fetchJson("/api/scrap-metal/purchases?limit=500"),
  },
  {
    key: "scrap-sales-register",
    queryKey: ["scrap-metal-sales"],
    fetcher: async () => fetchJson("/api/scrap-metal/sales?limit=500"),
  },
  {
    key: "scrap-ready-batches",
    queryKey: ["scrap-ready-batches"],
    fetcher: async () => fetchJson("/api/scrap-metal/batches?status=READY&limit=500"),
  },
];

const scrapLotsPreloadQueries: OfflinePreloadQuery[] = [
  {
    key: "scrap-metal-batches",
    queryKey: ["scrap-metal-batches"],
    fetcher: async () => fetchJson("/api/scrap-metal/batches?limit=200"),
  },
  {
    key: "scrap-sites-batches",
    queryKey: ["sites", "scrap-batches"],
    fetcher: async () => fetchSites(),
  },
  {
    key: "scrap-materials-batch-form",
    queryKey: ["scrap-materials", "batch-form"],
    fetcher: async () => fetchJson("/api/scrap-metal/materials?active=true&limit=500"),
  },
  {
    key: "scrap-unassigned-purchases-page",
    queryKey: ["scrap-unassigned-purchases-page"],
    fetcher: async () => fetchJson("/api/scrap-metal/purchases?limit=500&unbatched=true"),
  },
];

const scrapReportsSnapshotPreloadQueries: OfflinePreloadQuery[] = [
  {
    key: "scrap-home-daily-snapshot",
    queryKey: ["scrap-home-daily-snapshot"],
    fetcher: async () => fetchJson("/api/scrap-metal/dashboard"),
  },
  {
    key: "scrap-dashboard-reporting",
    queryKey: ["scrap-dashboard-reporting"],
    fetcher: async () => fetchJson("/api/scrap-metal/dashboard"),
  },
  {
    key: "scrap-daily-snapshot",
    queryKey: ["scrap-daily-snapshot"],
    fetcher: async () => fetchJson("/api/scrap-metal/dashboard"),
  },
  {
    key: "scrap-supplier-performance",
    queryKey: ["scrap-supplier-performance"],
    fetcher: async () => fetchJson("/api/scrap-metal/dashboard"),
  },
  {
    key: "scrap-variance-report",
    queryKey: ["scrap-variance-report"],
    fetcher: async () => fetchJson("/api/scrap-metal/sales?limit=400"),
  },
  {
    key: "scrap-aging-report",
    queryKey: ["scrap-aging-report"],
    fetcher: async () => fetchJson("/api/scrap-metal/batches?limit=400"),
  },
];

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

const scrapMasterDataPreloadQueries: OfflinePreloadQuery[] = [
  {
    key: "scrap-master-materials",
    queryKey: ["management", "master-data", "scrap-materials", ""],
    fetcher: async () => fetchJson("/api/scrap-metal/materials?limit=500"),
  },
  {
    key: "scrap-master-sellers",
    queryKey: ["management", "master-data", "scrap-sellers", ""],
    fetcher: async () => fetchJson("/api/scrap-metal/sellers?limit=500"),
  },
  {
    key: "scrap-materials-selector",
    queryKey: ["scrap-materials"],
    fetcher: async () => fetchJson("/api/scrap-metal/materials?active=true&limit=500"),
  },
  {
    key: "scrap-sellers-selector",
    queryKey: ["scrap-seller-profiles"],
    fetcher: async () => fetchJson("/api/scrap-metal/sellers?active=true&limit=500"),
  },
];

const scrapPriceBoardPreloadQueries: OfflinePreloadQuery[] = [
  {
    key: "scrap-pricing-board",
    queryKey: ["scrap-pricing"],
    fetcher: async () => fetchJson("/api/scrap-metal/pricing?limit=500"),
  },
  {
    key: "scrap-materials-for-pricing",
    queryKey: ["scrap-materials-for-pricing"],
    fetcher: async () => fetchJson("/api/scrap-metal/materials?active=true&limit=500"),
  },
];

const scrapStaffSettlementsPreloadQueries: OfflinePreloadQuery[] = [
  {
    key: "scrap-balances",
    queryKey: ["scrap-balances"],
    fetcher: async () => fetchJson("/api/scrap-metal/employee-balances?limit=500&nonZero=true"),
  },
  {
    key: "scrap-payout-batches",
    queryKey: ["scrap-payout-batches"],
    fetcher: async () => fetchJson("/api/hr/payout-batches?source=SCRAP&limit=500"),
  },
  {
    key: "scrap-settlement-employees",
    queryKey: ["employees", "scrap-settlements"],
    fetcher: async () => fetchJson("/api/employees?active=true&limit=500"),
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

const scrapMutationAdapters: OfflineMutationAdapter[] = [
  {
    operation: "create-seller",
    sync: ({ resolvedPayload }) => syncScrapSeller(resolvedPayload),
  },
  {
    operation: "create-inbound-ticket",
    sync: ({ operation, resolvedPayload }) => syncScrapInboundTicket(operation, resolvedPayload),
  },
  {
    operation: "create-outbound-ticket",
    sync: ({ operation, resolvedPayload }) => syncScrapOutboundTicket(operation, resolvedPayload),
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

const scrapTicketingRoutes = [
  "/scrap-metal",
  "/scrap-metal/tickets",
  "/scrap-metal/purchases",
  "/scrap-metal/sales",
  "/scrap-metal/tickets/held",
];
const scrapLotsRoutes = Array.from(new Set(SCRAP_OPERATIONS_SECTIONS.lots));
const scrapMasterDataRoutes = [
  "/management/master-data/operations/scrap-materials",
  "/management/master-data/operations/scrap-sellers",
];
const scrapPriceBoardRoutes = ["/scrap-metal/pricing"];
const scrapStaffSettlementRoutes = ["/scrap-metal/settlements"];
const scrapReportSnapshotRoutes = [
  "/scrap-metal/reports",
  "/scrap-metal/reports/daily-snapshot",
  "/scrap-metal/reports/supplier-performance",
  "/scrap-metal/reports/variance-aging",
];
const hrWorkforceCoreRoutes = [
  "/human-resources",
  "/human-resources/shift-groups",
  "/human-resources/incidents",
];

export const OFFLINE_MODULES: OfflineModuleDefinition[] = [
  {
    moduleId: "scrap-metal",
    syncPriority: 10,
    bootstrapPriority: 10,
    primaryFlowLabel: "Scrap ticketing",
    warmupBudget: "aggressive",
    criticalRoutes: scrapTicketingRoutes,
    routes: createWarmupRoutes(scrapTicketingRoutes),
    shellAssets: ["/icon-192.svg", "/icon-512.svg"],
    preloadQueries: scrapTicketingPreloadQueries,
    entityAdapters: [
      {
        entityType: "seller",
        displayLabel: (payload) => String(payload.fullName ?? "Supplier"),
        searchableText: (payload) =>
          [payload.fullName, payload.phone, payload.nationalId].filter(Boolean).join(" "),
      },
    ],
    mutationAdapters: scrapMutationAdapters,
  },
  {
    moduleId: "scrap-lots",
    syncPriority: 11,
    bootstrapPriority: 11,
    primaryFlowLabel: "Scrap lots",
    warmupBudget: "aggressive",
    criticalRoutes: scrapLotsRoutes,
    routes: createWarmupRoutes(scrapLotsRoutes),
    preloadQueries: scrapLotsPreloadQueries,
    entityAdapters: [],
    mutationAdapters: [],
  },
  {
    moduleId: "scrap-master-data",
    syncPriority: 12,
    bootstrapPriority: 12,
    primaryFlowLabel: "Scrap master data",
    warmupBudget: "aggressive",
    criticalRoutes: scrapMasterDataRoutes,
    routes: createWarmupRoutes(scrapMasterDataRoutes),
    preloadQueries: scrapMasterDataPreloadQueries,
    entityAdapters: [],
    mutationAdapters: [],
  },
  {
    moduleId: "scrap-price-board",
    syncPriority: 13,
    bootstrapPriority: 13,
    primaryFlowLabel: "Scrap price board",
    warmupBudget: "aggressive",
    criticalRoutes: scrapPriceBoardRoutes,
    routes: createWarmupRoutes(scrapPriceBoardRoutes),
    preloadQueries: scrapPriceBoardPreloadQueries,
    entityAdapters: [],
    mutationAdapters: [],
  },
  {
    moduleId: "scrap-staff-settlements",
    syncPriority: 14,
    bootstrapPriority: 14,
    primaryFlowLabel: "Scrap staff settlements",
    warmupBudget: "aggressive",
    criticalRoutes: scrapStaffSettlementRoutes,
    routes: createWarmupRoutes(scrapStaffSettlementRoutes),
    preloadQueries: scrapStaffSettlementsPreloadQueries,
    entityAdapters: [],
    mutationAdapters: [],
  },
  {
    moduleId: "scrap-reports-snapshot",
    syncPriority: 15,
    bootstrapPriority: 15,
    primaryFlowLabel: "Scrap reporting snapshots",
    warmupBudget: "aggressive",
    criticalRoutes: scrapReportSnapshotRoutes,
    routes: createWarmupRoutes(scrapReportSnapshotRoutes, [
      "/scrap-metal/reports",
      "/scrap-metal/reports/daily-snapshot",
    ]),
    preloadQueries: scrapReportsSnapshotPreloadQueries,
    entityAdapters: [],
    mutationAdapters: [],
  },
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

