type StoreMap = Map<string, unknown>;

const queryCacheStore: StoreMap = new Map();
const outboxStore: StoreMap = new Map();
const attachmentStore: StoreMap = new Map();
const deletedAttachmentIds: string[] = [];

function resetStores() {
  queryCacheStore.clear();
  outboxStore.clear();
  attachmentStore.clear();
  deletedAttachmentIds.length = 0;
}

function makeOfflineAttachmentRef(tenantKey: string, attachment: { offlineAttachmentId: string; pathname?: string; contentType: string; size: number; context: string }) {
  return {
    tenantKey,
    attachmentId: attachment.offlineAttachmentId,
    context: attachment.context,
    fileName:
      attachment.pathname?.replace("offline-attachment:", "") ??
      attachment.offlineAttachmentId,
    contentType: attachment.contentType,
    size: attachment.size,
  };
}

vi.mock("@/lib/offline/db", () => ({
  OFFLINE_DB_STORES: {
    queryCache: "queryCache",
  },
  getOfflineRecord: async (storeName: string, key: string) => {
    if (storeName !== "queryCache") return null;
    return (queryCacheStore.get(String(key)) as unknown) ?? null;
  },
  putOfflineRecord: async (storeName: string, value: { id: string }) => {
    if (storeName !== "queryCache") return;
    queryCacheStore.set(value.id, value);
  },
  listOfflineRecords: async (storeName: string) => {
    if (storeName !== "queryCache") return [];
    return Array.from(queryCacheStore.values());
  },
  deleteOfflineRecord: async (storeName: string, key: string) => {
    if (storeName !== "queryCache") return;
    queryCacheStore.delete(String(key));
  },
}));

vi.mock("@/lib/offline/outbox", () => ({
  enqueueOfflineOperation: async (input: Record<string, unknown>) => {
    const timestamp = new Date().toISOString();
    const operation = {
      ...input,
      operationId: `op:${String(input.clientRequestId)}`,
      status: "QUEUED",
      retryCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    outboxStore.set(operation.operationId, operation);
    return operation;
  },
  listPendingOfflineOperations: async (options?: { tenantKey?: string }) =>
    Array.from(outboxStore.values()).filter((operation) => {
      if (operation && typeof operation === "object") {
        const typed = operation as { status?: string; tenantKey?: string };
        return (
          typed.status !== "SYNCED" &&
          (!options?.tenantKey || typed.tenantKey === options.tenantKey)
        );
      }
      return false;
    }),
  findOfflineOperationForLocalEntity: async (
    moduleId: string,
    tenantKey: string,
    tempId: string,
    operation?: string,
  ) =>
    Array.from(outboxStore.values()).find((candidate) => {
      const typed = candidate as {
        moduleId?: string;
        tenantKey?: string;
        operation?: string;
        localRefs?: Record<string, string>;
      };
      return (
        typed.moduleId === moduleId &&
        typed.tenantKey === tenantKey &&
        typed.localRefs?.entityId === tempId &&
        (!operation || typed.operation === operation)
      );
    }) ?? null,
  updateOfflineOperation: async (
    operationId: string,
    updater: (current: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    const current = outboxStore.get(operationId) as Record<string, unknown> | undefined;
    if (!current) return null;
    const next = {
      ...updater(current),
      updatedAt: new Date().toISOString(),
    };
    outboxStore.set(operationId, next);
    return next;
  },
}));

vi.mock("@/lib/offline/attachment-store", () => ({
  getOfflineAttachmentRecord: async (attachmentId: string) =>
    (attachmentStore.get(attachmentId) as unknown) ?? null,
  deleteOfflineAttachmentRecord: async (attachmentId: string) => {
    deletedAttachmentIds.push(attachmentId);
    attachmentStore.delete(attachmentId);
  },
}));

vi.mock("@/lib/scrap-metal/offline-runtime", () => ({
  SCRAP_OFFLINE_MODULE_ID: "scrap-metal",
  isOfflineScrapEntityId: (value: string | null | undefined) =>
    Boolean(value && value.startsWith("local:scrap-metal:seller:")),
  queueOfflineScrapInboundTicket: async (input: {
    tenantKey: string;
    clientRequestId: string;
    payload: Record<string, unknown>;
    attachments: Array<{
      offlineAttachmentId?: string;
      pathname?: string;
      contentType: string;
      size: number;
      context: string;
      url: string;
      uploadedAt: string;
    }>;
    sellerTempId?: string | null;
  }) => {
    const remoteAttachments = input.attachments
      .filter((attachment) => !attachment.offlineAttachmentId)
      .map((attachment) => ({
        url: attachment.url,
        pathname: attachment.pathname,
        contentType: attachment.contentType,
        size: attachment.size,
        context: attachment.context,
        uploadedAt: attachment.uploadedAt,
      }));
    const attachmentRefs = input.attachments
      .filter((attachment) => attachment.offlineAttachmentId)
      .map((attachment) => makeOfflineAttachmentRef(input.tenantKey, attachment as {
        offlineAttachmentId: string;
        pathname?: string;
        contentType: string;
        size: number;
        context: string;
      }));

    const operation = {
      tenantKey: input.tenantKey,
      moduleId: "scrap-metal",
      clientRequestId: input.clientRequestId,
      entityType: "scrap-inbound-ticket",
      operation: "create-inbound-ticket",
      dependsOn: [],
      payload: {
        ...input.payload,
        attachments: remoteAttachments,
      },
      localRefs: input.sellerTempId ? { sellerProfileId: input.sellerTempId } : undefined,
      attachments: attachmentRefs,
      syncPriority: 20,
      operationId: `op:${input.clientRequestId}`,
      status: "QUEUED",
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    outboxStore.set(operation.operationId, operation);
    return operation;
  },
  queueOfflineScrapOutboundTicket: async (input: {
    tenantKey: string;
    clientRequestId: string;
    payload: Record<string, unknown>;
    attachments: Array<{
      offlineAttachmentId?: string;
      pathname?: string;
      contentType: string;
      size: number;
      context: string;
      url: string;
      uploadedAt: string;
    }>;
  }) => {
    const remoteAttachments = input.attachments
      .filter((attachment) => !attachment.offlineAttachmentId)
      .map((attachment) => ({
        url: attachment.url,
        pathname: attachment.pathname,
        contentType: attachment.contentType,
        size: attachment.size,
        context: attachment.context,
        uploadedAt: attachment.uploadedAt,
      }));
    const attachmentRefs = input.attachments
      .filter((attachment) => attachment.offlineAttachmentId)
      .map((attachment) => makeOfflineAttachmentRef(input.tenantKey, attachment as {
        offlineAttachmentId: string;
        pathname?: string;
        contentType: string;
        size: number;
        context: string;
      }));

    const operation = {
      tenantKey: input.tenantKey,
      moduleId: "scrap-metal",
      clientRequestId: input.clientRequestId,
      entityType: "scrap-outbound-ticket",
      operation: "create-outbound-ticket",
      dependsOn: [],
      payload: {
        ...input.payload,
        attachments: remoteAttachments,
      },
      attachments: attachmentRefs,
      syncPriority: 20,
      operationId: `op:${input.clientRequestId}`,
      status: "QUEUED",
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    outboxStore.set(operation.operationId, operation);
    return operation;
  },
}));

vi.mock("@/lib/scrap-metal/offline-sellers", () => ({
  addRecentSeller: async () => undefined,
}));

import {
  createPurchaseTicketOffline,
  createSaleTicketOffline,
  updatePurchaseTicketOffline,
  updateSaleTicketOffline,
} from "@/lib/scrap-metal/offline-ticket";

describe("offline scrap tickets", () => {
  beforeEach(() => {
    resetStores();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock"),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("updates an existing queued inbound ticket in place", async () => {
    attachmentStore.set("att-remove", {
      attachmentId: "att-remove",
      tenantKey: "tenant-a",
      fileName: "remove.jpg",
      contentType: "image/jpeg",
      size: 120,
      context: "scrap-purchase-ticket-photo",
      createdAt: "2026-04-24T08:00:00.000Z",
      blob: new Blob(["remove"]),
    });
    attachmentStore.set("att-keep", {
      attachmentId: "att-keep",
      tenantKey: "tenant-a",
      fileName: "keep.jpg",
      contentType: "image/jpeg",
      size: 150,
      context: "scrap-purchase-ticket-photo",
      createdAt: "2026-04-24T08:00:00.000Z",
      blob: new Blob(["keep"]),
    });

    const created = await createPurchaseTicketOffline("tenant-a", {
      clientRequestId: "req-inbound",
      ticketDate: "2026-04-24T08:30:00.000Z",
      sellerId: "seller-1",
      sellerName: "Seller One",
      materialId: "material-1",
      category: "COPPER",
      weight: 10,
      pricePerKg: 2.5,
      currency: "USD",
      photos: [
        {
          url: "https://example.com/remote.jpg",
          pathname: "/remote.jpg",
          contentType: "image/jpeg",
          size: 100,
          context: "scrap-purchase-ticket-photo",
          uploadedAt: "2026-04-24T08:30:00.000Z",
        },
        {
          url: "blob:remove",
          pathname: "offline-attachment:att-remove",
          contentType: "image/jpeg",
          size: 120,
          context: "scrap-purchase-ticket-photo",
          uploadedAt: "2026-04-24T08:30:00.000Z",
          offlineAttachmentId: "att-remove",
        },
      ],
      status: "DRAFT",
      siteId: "site-1",
      employeeId: "employee-1",
      intent: "hold",
    });

    outboxStore.set(created.operationId, {
      ...(outboxStore.get(created.operationId) as Record<string, unknown>),
      status: "FAILED_RETRYABLE",
      retryCount: 2,
      lastError: "network lost",
    });

    const updated = await updatePurchaseTicketOffline("tenant-a", "req-inbound", {
      sellerId: "seller-1",
      sellerName: "Seller One Updated",
      materialId: "material-2",
      category: "ALUMINUM",
      weight: 12,
      pricePerKg: 3,
      currency: "USD",
      photos: [
        {
          url: "blob:keep",
          pathname: "offline-attachment:att-keep",
          contentType: "image/jpeg",
          size: 150,
          context: "scrap-purchase-ticket-photo",
          uploadedAt: "2026-04-25T09:00:00.000Z",
          offlineAttachmentId: "att-keep",
        },
      ],
      paymentMethod: "Cash",
      paymentReference: "REF-1",
      notes: "Updated note",
      status: "POSTED",
      siteId: "site-1",
      employeeId: "employee-2",
      ticketDate: "2026-04-25T09:00:00.000Z",
      intent: "finalize",
    });

    expect(updated.ticket.id).toBe("req-inbound");
    expect(updated.ticket.ticketNumber).toBe(created.ticket.ticketNumber);
    expect(updated.ticket.ticketDate).toBe("2026-04-25T09:00:00.000Z");

    const operation = outboxStore.get("op:req-inbound") as {
      payload: Record<string, unknown>;
      attachments: Array<{ attachmentId: string }>;
      status: string;
      retryCount: number;
      lastError?: string;
    };
    expect(operation.payload.purchaseNumber).toBe(created.ticket.ticketNumber);
    expect(operation.payload.purchaseDate).toBe("2026-04-25T09:00:00.000Z");
    expect(operation.attachments.map((attachment) => attachment.attachmentId)).toEqual(["att-keep"]);
    expect(operation.status).toBe("QUEUED");
    expect(operation.retryCount).toBe(0);
    expect(operation.lastError).toBeUndefined();
    expect(deletedAttachmentIds).toEqual(["att-remove"]);
  });

  it("updates an existing queued outbound ticket in place", async () => {
    attachmentStore.set("att-sale-old", {
      attachmentId: "att-sale-old",
      tenantKey: "tenant-a",
      fileName: "sale-old.jpg",
      contentType: "image/jpeg",
      size: 100,
      context: "scrap-sale-ticket-photo",
      createdAt: "2026-04-24T08:00:00.000Z",
      blob: new Blob(["old"]),
    });

    const created = await createSaleTicketOffline("tenant-a", {
      clientRequestId: "req-sale",
      ticketDate: "2026-04-24T11:00:00.000Z",
      batchId: "batch-1",
      buyerName: "Buyer One",
      recordedWeight: 20,
      soldWeight: 18,
      pricePerKg: 5,
      currency: "USD",
      photos: [
        {
          url: "blob:sale-old",
          pathname: "offline-attachment:att-sale-old",
          contentType: "image/jpeg",
          size: 100,
          context: "scrap-sale-ticket-photo",
          uploadedAt: "2026-04-24T11:00:00.000Z",
          offlineAttachmentId: "att-sale-old",
        },
      ],
      status: "DRAFT",
      siteId: "site-2",
      intent: "hold",
    });

    outboxStore.set(created.operationId, {
      ...(outboxStore.get(created.operationId) as Record<string, unknown>),
      status: "FAILED_BLOCKING",
      lastError: "validation failed",
    });

    const updated = await updateSaleTicketOffline("tenant-a", "req-sale", {
      batchId: "batch-2",
      buyerName: "Buyer Updated",
      buyerContact: "0772000111",
      recordedWeight: 21,
      soldWeight: 19,
      pricePerKg: 6,
      currency: "USD",
      photos: [],
      paymentMethod: "Bank Transfer",
      paymentReference: "PAY-9",
      notes: "Updated sale",
      status: "PENDING_APPROVAL",
      siteId: "site-2",
      ticketDate: "2026-04-25T12:15:00.000Z",
      intent: "submit",
    });

    expect(updated.ticket.id).toBe("req-sale");
    expect(updated.ticket.ticketNumber).toBe(created.ticket.ticketNumber);
    expect(updated.ticket.ticketDate).toBe("2026-04-25T12:15:00.000Z");

    const operation = outboxStore.get("op:req-sale") as {
      payload: Record<string, unknown>;
      attachments: unknown[];
      status: string;
      lastError?: string;
    };
    expect(operation.payload.saleNumber).toBe(created.ticket.ticketNumber);
    expect(operation.payload.saleDate).toBe("2026-04-25T12:15:00.000Z");
    expect(operation.attachments).toEqual([]);
    expect(operation.status).toBe("QUEUED");
    expect(operation.lastError).toBeUndefined();
    expect(deletedAttachmentIds).toContain("att-sale-old");
  });
});
