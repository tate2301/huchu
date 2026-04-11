import { fetchEmployees, fetchSites } from "@/lib/api";
import { fetchJson } from "@/lib/api-client";
import { getOfflineAttachmentRecord } from "@/lib/offline/attachment-store";
import { markOfflineLocalEntitySynced, resolveOfflineEntityServerId } from "@/lib/offline/entity-store";
import {
  markOfflineOperationBlockingFailure,
  markOfflineOperationRetryableFailure,
  markOfflineOperationStatus,
  markOfflineOperationSynced,
} from "@/lib/offline/outbox";
import type {
  OfflineModuleDefinition,
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
    const record = await getOfflineAttachmentRecord(attachment.attachmentId);
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
    const attachments = await uploadOfflineAttachments(operation, payload.attachments);
    const created = await fetchJson<{ id: string }>("/api/scrap-metal/purchases", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
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
    const attachments = await uploadOfflineAttachments(operation, payload.attachments);
    const created = await fetchJson<{ id: string }>("/api/scrap-metal/sales", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
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
    await fetchJson("/api/v2/retail/pos/sales", {
      method: "POST",
      body: JSON.stringify(payload),
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

const scrapPreloadQueries: OfflinePreloadQuery[] = [
  {
    key: "scrap-sites",
    queryKey: ["sites", "scrap-tickets"],
    fetcher: async () => fetchSites(),
  },
  {
    key: "scrap-employees",
    queryKey: ["employees", "scrap-tickets"],
    fetcher: async () => fetchEmployees({ active: true, limit: 500 }),
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

export const OFFLINE_MODULES: OfflineModuleDefinition[] = [
  {
    moduleId: "scrap-metal",
    syncPriority: 10,
    bootstrapPriority: 10,
    primaryFlowLabel: "Scrap ticketing",
    warmupBudget: "aggressive",
    criticalRoutes: ["/scrap-metal/tickets", "/scrap-metal/tickets/held"],
    warmupRoutes: [
      "/scrap-metal/tickets",
      "/scrap-metal/tickets/held",
      "/scrap-metal/purchases",
      "/scrap-metal/sales",
    ],
    shellAssets: ["/icon-192.svg", "/icon-512.svg"],
    preloadQueries: scrapPreloadQueries,
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
    moduleId: "retail-pos",
    syncPriority: 20,
    bootstrapPriority: 20,
    primaryFlowLabel: "POS checkout",
    warmupBudget: "aggressive",
    criticalRoutes: ["/portal/pos", "/portal/pos/overview", "/portal/pos/history", "/portal/pos/held"],
    warmupRoutes: [
      "/portal/pos",
      "/portal/pos/overview",
      "/portal/pos/history",
      "/portal/pos/held",
      "/portal/pos/customers",
      "/portal/pos/shift",
      "/portal/pos/price-check",
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
  const features = new Set(enabledFeatures ?? []);
  return OFFLINE_MODULES.filter((moduleDefinition) => {
    if (moduleDefinition.moduleId === "scrap-metal") {
      return [...features].some((feature) => feature.startsWith("scrap-metal."));
    }
    if (moduleDefinition.moduleId === "retail-pos") {
      return [...features].some(
        (feature) => feature.startsWith("retail.") || feature.startsWith("portal.pos"),
      );
    }
    return true;
  });
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
    const serverId = await resolveOfflineEntityServerId(tempId);
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
      await markOfflineLocalEntitySynced(localEntityId, outcome.serverEntityId);
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
