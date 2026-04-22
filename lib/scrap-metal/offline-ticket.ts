/**
 * Offline Ticket Creation
 *
 * Handles creation of purchase tickets and sales batches offline.
 * Integrates with the outbox for mutation queuing and
 * attachment store for photo handling.
 */

import { enqueueOfflineOperation, listPendingOfflineOperations } from "@/lib/offline/outbox";
import {
  OFFLINE_DB_STORES,
  deleteOfflineRecord,
  getOfflineRecord,
  listOfflineRecords,
  putOfflineRecord,
} from "@/lib/offline/db";
import { getOfflineAttachmentRecord } from "@/lib/offline/attachment-store";
import type { OfflineAttachmentRef, OfflineOutboxStatus, PersistedQueryRecord } from "@/lib/offline/types";

import {
  type LocalScrapTicketPhoto,
  SCRAP_OFFLINE_MODULE_ID,
  isOfflineScrapEntityId,
  queueOfflineScrapInboundTicket,
  queueOfflineScrapOutboundTicket,
} from "./offline-runtime";
import { addRecentSeller } from "./offline-sellers";
import type { ScrapSeller } from "./offline-sellers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrapPurchaseTicket {
  id: string;
  sellerId: string;
  sellerName: string;
  materialId?: string;
  category: string;
  weight: number;
  pricePerKg: number;
  total: number;
  currency: string;
  paymentMethod?: string;
  paymentReference?: string;
  notes?: string;
  photos: LocalScrapTicketPhoto[];
  status: "DRAFT" | "POSTED";
  siteId: string;
  employeeId: string;
  createdAt: string;
  offlineCreated: boolean;
}

export interface ScrapSaleTicket {
  id: string;
  batchId: string;
  buyerName: string;
  buyerContact?: string;
  recordedWeight: number;
  soldWeight: number;
  pricePerKg: number;
  total: number;
  currency: string;
  paymentMethod?: string;
  paymentReference?: string;
  notes?: string;
  photos: LocalScrapTicketPhoto[];
  status: "DRAFT" | "PENDING_APPROVAL";
  siteId: string;
  createdAt: string;
  offlineCreated: boolean;
}

export interface ScrapSalesBatchItem {
  purchaseTicketId: string;
  weight: number;
  materialId?: string;
  category: string;
}

export interface ScrapSalesBatch {
  id: string;
  batchNumber?: string;
  siteId: string;
  category: string;
  materialId?: string;
  items: ScrapSalesBatchItem[];
  status: "COLLECTING" | "READY" | "SOLD";
  totalWeight: number;
  totalValue: number;
  collectionStartDate: string;
  notes?: string;
  createdAt: string;
  offlineCreated: boolean;
}

export interface CreatePurchaseTicketInput {
  sellerId: string;
  sellerName: string;
  materialId?: string;
  category: string;
  weight: number;
  pricePerKg: number;
  currency?: string;
  paymentMethod?: string;
  paymentReference?: string;
  notes?: string;
  photos: LocalScrapTicketPhoto[];
  status: "DRAFT" | "POSTED";
  siteId: string;
  employeeId: string;
  intent: "hold" | "finalize" | "finalize_print";
}

export interface CreateSalesBatchInput {
  siteId: string;
  category: string;
  materialId?: string;
  collectionStartDate: string;
  notes?: string;
  items?: ScrapSalesBatchItem[];
  status?: "COLLECTING" | "READY";
}

export interface CreateSaleTicketInput {
  batchId: string;
  buyerName: string;
  buyerContact?: string;
  recordedWeight: number;
  soldWeight: number;
  pricePerKg: number;
  currency?: string;
  paymentMethod?: string;
  paymentReference?: string;
  notes?: string;
  photos: LocalScrapTicketPhoto[];
  status: "DRAFT" | "PENDING_APPROVAL";
  siteId: string;
  intent: "hold" | "submit" | "submit_print" | "request_approval";
}

export interface PendingTicketSummary {
  operationId: string;
  type: "inbound" | "outbound";
  status: string;
  label: string;
  createdAt: string;
  lastError?: string;
  blockedBy?: string;
}

export interface PendingPurchaseTicketRecord extends ScrapPurchaseTicket {
  operationId: string;
  outboxStatus: OfflineOutboxStatus;
  lastError?: string;
}

export interface PendingSaleTicketRecord extends ScrapSaleTicket {
  operationId: string;
  outboxStatus: OfflineOutboxStatus;
  lastError?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TICKET_COUNTER_KEY = "scrap:ticket:counter";
const BATCH_COUNTER_KEY = "scrap:batch:counter";
const PENDING_PURCHASE_TICKET_KEY_PREFIX = "scrap:pending:ticket:";
const PENDING_SALE_TICKET_KEY_PREFIX = "scrap:pending:sale-ticket:";

// ---------------------------------------------------------------------------
// Ticket numbering (local sequence)
// ---------------------------------------------------------------------------

/**
 * Generate a local purchase ticket number.
 * Format: SCPUR-{timestamp}-{counter}
 */
export async function generateLocalPurchaseTicketNumber(): Promise<string> {
  const counter = await incrementCounter(TICKET_COUNTER_KEY);
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `SCPUR-${timestamp}-${String(counter).padStart(4, "0")}`;
}

/**
 * Generate a local sales batch number.
 * Format: SCBAT-{timestamp}-{counter}
 */
export async function generateLocalBatchNumber(): Promise<string> {
  const counter = await incrementCounter(BATCH_COUNTER_KEY);
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `SCBAT-${timestamp}-${String(counter).padStart(4, "0")}`;
}

/**
 * Generate a local outbound ticket number.
 * Format: SCSAL-{timestamp}-{counter}
 */
export async function generateLocalSaleTicketNumber(): Promise<string> {
  const counter = await incrementCounter(TICKET_COUNTER_KEY);
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `SCSAL-${timestamp}-${String(counter).padStart(4, "0")}`;
}

async function incrementCounter(key: string): Promise<number> {
  const record = await getOfflineRecord<{ data: { value: number } }>(
    OFFLINE_DB_STORES.queryCache,
    key,
  );
  const next = (record?.data?.value ?? 0) + 1;
  await putOfflineRecord(OFFLINE_DB_STORES.queryCache, {
    id: key,
    tenantKey: "",
    queryKey: [key],
    data: { value: next },
    updatedAt: Date.now(),
    maxAgeMs: 90 * 24 * 60 * 60 * 1000, // 90 days
    moduleId: SCRAP_OFFLINE_MODULE_ID,
  });
  return next;
}

// ---------------------------------------------------------------------------
// Purchase ticket creation (offline)
// ---------------------------------------------------------------------------

/**
 * Create a purchase ticket offline.
 * Queues the ticket in the outbox for later sync.
 */
export async function createPurchaseTicketOffline(
  tenantKey: string,
  input: CreatePurchaseTicketInput,
): Promise<{ ticket: ScrapPurchaseTicket; operationId: string }> {
  const purchaseNumber = await generateLocalPurchaseTicketNumber();
  const clientRequestId = `scrap-purchase-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const isNewSeller = isOfflineScrapEntityId(input.sellerId);

  // Calculate total
  const total = input.weight * input.pricePerKg;
  const currency = (input.currency ?? "USD").toUpperCase();

  const ticket: ScrapPurchaseTicket = {
    id: clientRequestId,
    sellerId: input.sellerId,
    sellerName: input.sellerName,
    materialId: input.materialId,
    category: input.category,
    weight: input.weight,
    pricePerKg: input.pricePerKg,
    total,
    currency,
    paymentMethod: input.paymentMethod,
    paymentReference: input.paymentReference,
    notes: input.notes,
    photos: input.photos,
    status: input.status,
    siteId: input.siteId,
    employeeId: input.employeeId,
    createdAt: new Date().toISOString(),
    offlineCreated: true,
  };

  // Build payload for outbox
  const payload: Record<string, unknown> = {
    purchaseNumber,
    purchaseDate: new Date().toISOString(),
    siteId: input.siteId,
    employeeId: input.employeeId,
    sellerProfileId: input.sellerId, // May be tempId — dependency resolver handles this
    materialId: input.materialId,
    category: input.category,
    weight: input.weight,
    pricePerKg: input.pricePerKg,
    currency,
    paymentMethod: input.paymentMethod,
    paymentReference: input.paymentReference,
    sellerName: input.sellerName,
    notes: input.notes,
    status: input.status,
    totalAmount: total,
    offlineCreated: true,
    offlineCreatedAt: new Date().toISOString(),
    intent: input.intent,
  };

  // Queue in outbox — dependency on seller creation is auto-resolved
  const operation = await queueOfflineScrapInboundTicket({
    tenantKey,
    clientRequestId,
    payload,
    attachments: input.photos,
    sellerTempId: isNewSeller ? input.sellerId : null,
  });

  // Track seller as recently used
  await addRecentSeller({
    id: input.sellerId,
    name: input.sellerName,
    nationalId: "", // Will be resolved from entity store
    phone: "",
    status: "active",
    verified: false,
  });

  // Cache the ticket locally for quick recall
  await cachePendingTicket(ticket, tenantKey);

  return {
    ticket,
    operationId: operation.operationId,
  };
}

/**
 * Create an outbound sale ticket offline.
 * Queues the ticket in the outbox for later sync and caches it for local recall.
 */
export async function createSaleTicketOffline(
  tenantKey: string,
  input: CreateSaleTicketInput,
): Promise<{ ticket: ScrapSaleTicket; operationId: string }> {
  const saleNumber = await generateLocalSaleTicketNumber();
  const clientRequestId = `scrap-sale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const currency = (input.currency ?? "USD").toUpperCase();
  const total = input.soldWeight * input.pricePerKg;

  const ticket: ScrapSaleTicket = {
    id: clientRequestId,
    batchId: input.batchId,
    buyerName: input.buyerName,
    buyerContact: input.buyerContact,
    recordedWeight: input.recordedWeight,
    soldWeight: input.soldWeight,
    pricePerKg: input.pricePerKg,
    total,
    currency,
    paymentMethod: input.paymentMethod,
    paymentReference: input.paymentReference,
    notes: input.notes,
    photos: input.photos,
    status: input.status,
    siteId: input.siteId,
    createdAt: new Date().toISOString(),
    offlineCreated: true,
  };

  const payload: Record<string, unknown> = {
    saleNumber,
    saleDate: new Date().toISOString(),
    siteId: input.siteId,
    batchId: input.batchId,
    buyerName: input.buyerName,
    buyerContact: input.buyerContact,
    recordedWeight: input.recordedWeight,
    soldWeight: input.soldWeight,
    pricePerKg: input.pricePerKg,
    currency,
    paymentMethod: input.paymentMethod,
    paymentReference: input.paymentReference,
    notes: input.notes,
    status: input.status,
    totalAmount: total,
    offlineCreated: true,
    offlineCreatedAt: new Date().toISOString(),
    intent: input.intent,
  };

  const operation = await queueOfflineScrapOutboundTicket({
    tenantKey,
    clientRequestId,
    payload,
    attachments: input.photos,
  });

  await cachePendingSaleTicket(ticket, tenantKey);

  return {
    ticket,
    operationId: operation.operationId,
  };
}

// ---------------------------------------------------------------------------
// Sales batch creation (offline)
// ---------------------------------------------------------------------------

/**
 * Create a sales batch offline.
 * Queues the batch in the outbox for later sync.
 */
export async function createSalesBatchOffline(
  tenantKey: string,
  input: CreateSalesBatchInput,
): Promise<{ batch: ScrapSalesBatch; operationId: string }> {
  const batchNumber = await generateLocalBatchNumber();
  const clientRequestId = `scrap-batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const items = input.items ?? [];
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);

  const batch: ScrapSalesBatch = {
    id: clientRequestId,
    batchNumber,
    siteId: input.siteId,
    category: input.category,
    materialId: input.materialId,
    items,
    status: input.status ?? "COLLECTING",
    totalWeight,
    totalValue: 0, // Calculated when items have pricing
    collectionStartDate: input.collectionStartDate,
    notes: input.notes,
    createdAt: new Date().toISOString(),
    offlineCreated: true,
  };

  const operation = await enqueueOfflineOperation({
    tenantKey,
    moduleId: SCRAP_OFFLINE_MODULE_ID,
    clientRequestId,
    entityType: "scrap-batch",
    operation: "create-batch",
    dependsOn: [],
    payload: {
      batchNumber,
      siteId: input.siteId,
      materialId: input.materialId,
      category: input.category,
      collectionStartDate: input.collectionStartDate,
      collectionEndDate: null,
      status: input.status ?? "COLLECTING",
      notes: input.notes,
      offlineCreated: true,
      offlineCreatedAt: new Date().toISOString(),
    },
    syncPriority: 15,
  });

  // Cache batch locally
  await cachePendingBatch(batch, tenantKey);

  return {
    batch,
    operationId: operation.operationId,
  };
}

// ---------------------------------------------------------------------------
// Ticket-to-batch association
// ---------------------------------------------------------------------------

/**
 * Add a purchase ticket to a sales batch.
 * Creates an offline association that syncs with the server.
 */
export async function addTicketToBatch(
  tenantKey: string,
  ticketId: string,
  batchId: string,
): Promise<{ operationId: string }> {
  const clientRequestId = `scrap-assoc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const operation = await enqueueOfflineOperation({
    tenantKey,
    moduleId: SCRAP_OFFLINE_MODULE_ID,
    clientRequestId,
    entityType: "scrap-batch-item",
    operation: "add-ticket-to-batch",
    dependsOn: [], // Ticket and batch should already be queued
    payload: {
      purchaseTicketId: ticketId,
      batchId,
      offlineCreated: true,
      offlineCreatedAt: new Date().toISOString(),
    },
    localRefs: {
      ticketId,
      batchId,
    },
    syncPriority: 18,
  });

  return { operationId: operation.operationId };
}

// ---------------------------------------------------------------------------
// Pending tickets / batches queries
// ---------------------------------------------------------------------------

/**
 * Get all pending (queued) tickets from the outbox.
 */
export async function getPendingTickets(): Promise<PendingTicketSummary[]> {
  const operations = await listPendingOfflineOperations();

  return operations
    .filter(
      (op) =>
        op.moduleId === SCRAP_OFFLINE_MODULE_ID &&
        (op.operation === "create-inbound-ticket" || op.operation === "create-outbound-ticket"),
    )
    .map((op) => ({
      operationId: op.operationId,
      type:
        op.operation === "create-inbound-ticket"
          ? ("inbound" as const)
          : ("outbound" as const),
      status: op.status,
      label: describeTicketOperation(op),
      createdAt: op.createdAt,
      lastError: op.lastError,
      blockedBy: op.dependsOn.find((depId) => {
        // Check if any dependency is not synced
        const dep = operations.find((d) => d.operationId === depId);
        return dep && dep.status !== "SYNCED";
      }),
    }));
}

/**
 * Get all pending (queued) batches from the outbox.
 */
export async function getPendingBatches(): Promise<PendingTicketSummary[]> {
  const operations = await listPendingOfflineOperations();

  return operations
    .filter(
      (op) =>
        op.moduleId === SCRAP_OFFLINE_MODULE_ID && op.operation === "create-batch",
    )
    .map((op) => ({
      operationId: op.operationId,
      type: "inbound" as const, // Batches are collections (inbound)
      status: op.status,
      label: `Batch ${(op.payload as Record<string, unknown>).batchNumber ?? "(new)"}`,
      createdAt: op.createdAt,
      lastError: op.lastError,
      blockedBy: undefined,
    }));
}

/**
 * Get all pending scrap operations (tickets + batches + associations).
 */
export async function getAllPendingScrapOperations(): Promise<PendingTicketSummary[]> {
  const [tickets, batches] = await Promise.all([getPendingTickets(), getPendingBatches()]);
  return [...tickets, ...batches].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

// ---------------------------------------------------------------------------
// Attachment queue handling
// ---------------------------------------------------------------------------

/**
 * Queue photo attachments for a ticket.
 * Photos are stored in IndexedDB and uploaded during sync.
 */
export async function queueTicketAttachments(
  tenantKey: string,
  ticketId: string,
  photos: LocalScrapTicketPhoto[],
): Promise<{ attachmentCount: number; totalSize: number }> {
  let totalSize = 0;

  for (const photo of photos) {
    if (photo.size) {
      totalSize += photo.size;
    }
  }

  return {
    attachmentCount: photos.length,
    totalSize,
  };
}

// ---------------------------------------------------------------------------
// Local cache for pending tickets/batches
// ---------------------------------------------------------------------------

async function cachePendingTicket(
  ticket: ScrapPurchaseTicket,
  tenantKey: string,
): Promise<void> {
  const key = `${PENDING_PURCHASE_TICKET_KEY_PREFIX}${ticket.id}`;
  await putOfflineRecord(OFFLINE_DB_STORES.queryCache, {
    id: key,
    tenantKey,
    queryKey: ["scrap-pending-tickets"],
    data: ticket,
    updatedAt: Date.now(),
    maxAgeMs: 90 * 24 * 60 * 60 * 1000, // 90 days
    moduleId: SCRAP_OFFLINE_MODULE_ID,
  });
}

async function cachePendingSaleTicket(
  ticket: ScrapSaleTicket,
  tenantKey: string,
): Promise<void> {
  const key = `${PENDING_SALE_TICKET_KEY_PREFIX}${ticket.id}`;
  await putOfflineRecord(OFFLINE_DB_STORES.queryCache, {
    id: key,
    tenantKey,
    queryKey: ["scrap-pending-sale-tickets"],
    data: ticket,
    updatedAt: Date.now(),
    maxAgeMs: 90 * 24 * 60 * 60 * 1000,
    moduleId: SCRAP_OFFLINE_MODULE_ID,
  });
}

async function cachePendingBatch(
  batch: ScrapSalesBatch,
  tenantKey: string,
): Promise<void> {
  const key = `scrap:pending:batch:${batch.id}`;
  await putOfflineRecord(OFFLINE_DB_STORES.queryCache, {
    id: key,
    tenantKey,
    queryKey: ["scrap-pending-batches"],
    data: batch,
    updatedAt: Date.now(),
    maxAgeMs: 90 * 24 * 60 * 60 * 1000, // 90 days
    moduleId: SCRAP_OFFLINE_MODULE_ID,
  });
}

export async function rehydrateLocalTicketPhotos(
  tenantKey: string,
  photos: LocalScrapTicketPhoto[],
) {
  return Promise.all(
    photos.map(async (photo) => {
      if (!photo.offlineAttachmentId) {
        return photo;
      }
      const attachment = await getOfflineAttachmentRecord(
        photo.offlineAttachmentId,
        tenantKey,
      );
      if (!attachment) {
        return photo;
      }
      return {
        ...photo,
        url: URL.createObjectURL(attachment.blob),
        pathname: `offline-attachment:${attachment.attachmentId}`,
        size: attachment.size,
        contentType:
          attachment.contentType === "image/png" ||
          attachment.contentType === "image/webp"
            ? attachment.contentType
            : "image/jpeg",
      } satisfies LocalScrapTicketPhoto;
    }),
  );
}

async function listCachedPendingRecords<T>(
  prefix: string,
  tenantKey?: string,
): Promise<Array<PersistedQueryRecord & { data: T }>> {
  const records = await listOfflineRecords<PersistedQueryRecord>(
    OFFLINE_DB_STORES.queryCache,
  );
  return records.filter(
    (record) =>
      record.id.startsWith(prefix) &&
      record.moduleId === SCRAP_OFFLINE_MODULE_ID &&
      (!tenantKey || record.tenantKey === tenantKey),
  ) as Array<PersistedQueryRecord & { data: T }>;
}

export async function listPendingPurchaseTickets(
  tenantKey?: string,
): Promise<PendingPurchaseTicketRecord[]> {
  const [records, operations] = await Promise.all([
    listCachedPendingRecords<ScrapPurchaseTicket>(
      PENDING_PURCHASE_TICKET_KEY_PREFIX,
      tenantKey,
    ),
    listPendingOfflineOperations({ tenantKey }),
  ]);

  const operationMap = new Map(
    operations
      .filter(
        (operation) =>
          operation.moduleId === SCRAP_OFFLINE_MODULE_ID &&
          operation.operation === "create-inbound-ticket",
      )
      .map((operation) => [operation.clientRequestId, operation]),
  );

  const hydrated = await Promise.all(
    records.map(async (record) => {
      const ticket = record.data;
      const operation = operationMap.get(ticket.id);
      const photos = await rehydrateLocalTicketPhotos(
        record.tenantKey,
        ticket.photos,
      );
      return {
        ...ticket,
        photos,
        operationId: operation?.operationId ?? ticket.id,
        outboxStatus: operation?.status ?? "QUEUED",
        lastError: operation?.lastError,
      } satisfies PendingPurchaseTicketRecord;
    }),
  );

  return hydrated.sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export async function listPendingSaleTickets(
  tenantKey?: string,
): Promise<PendingSaleTicketRecord[]> {
  const [records, operations] = await Promise.all([
    listCachedPendingRecords<ScrapSaleTicket>(
      PENDING_SALE_TICKET_KEY_PREFIX,
      tenantKey,
    ),
    listPendingOfflineOperations({ tenantKey }),
  ]);

  const operationMap = new Map(
    operations
      .filter(
        (operation) =>
          operation.moduleId === SCRAP_OFFLINE_MODULE_ID &&
          operation.operation === "create-outbound-ticket",
      )
      .map((operation) => [operation.clientRequestId, operation]),
  );

  const hydrated = await Promise.all(
    records.map(async (record) => {
      const ticket = record.data;
      const operation = operationMap.get(ticket.id);
      const photos = await rehydrateLocalTicketPhotos(
        record.tenantKey,
        ticket.photos,
      );
      return {
        ...ticket,
        photos,
        operationId: operation?.operationId ?? ticket.id,
        outboxStatus: operation?.status ?? "QUEUED",
        lastError: operation?.lastError,
      } satisfies PendingSaleTicketRecord;
    }),
  );

  return hydrated.sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export async function removePendingTicketCache(
  type: "purchase" | "sale",
  clientRequestId: string,
) {
  const prefix =
    type === "purchase"
      ? PENDING_PURCHASE_TICKET_KEY_PREFIX
      : PENDING_SALE_TICKET_KEY_PREFIX;
  await deleteOfflineRecord(
    OFFLINE_DB_STORES.queryCache,
    `${prefix}${clientRequestId}`,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function describeTicketOperation(operation: {
  operation: string;
  payload: Record<string, unknown>;
}): string {
  const payload = operation.payload;
  if (operation.operation === "create-inbound-ticket") {
    const purchaseNumber = String(payload.purchaseNumber ?? "(new)");
    const sellerName = String(payload.sellerName ?? "Unknown seller");
    const category = String(payload.category ?? "");
    const weight = Number(payload.weight ?? 0);
    return `Purchase ${purchaseNumber} — ${sellerName} — ${category} ${weight.toFixed(2)}kg`;
  }
  if (operation.operation === "create-outbound-ticket") {
    const saleNumber = String(payload.saleNumber ?? "(new)");
    const buyerName = String(payload.buyerName ?? "Unknown buyer");
    return `Sale ${saleNumber} — ${buyerName}`;
  }
  return operation.operation;
}
