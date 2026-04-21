/**
 * Offline Shift Management
 * ---------------------------------------------------------------------------
 * Manages shift open/close operations for POS offline mode.
 * All mutations are queued to the outbox for background sync.
 *
 * Critical dependency rule: sales cannot sync until their shift is synced.
 * This is enforced by the dependency resolver in the sync engine.
 */

import { OFFLINE_DB_STORES } from "@/lib/offline/db";
import { putRecord, getRecord } from "@/lib/offline/db-v2";
import {
  upsertOfflineLocalEntity,
  listOfflineLocalEntities,
  markOfflineLocalEntitySynced,
} from "@/lib/offline/entity-store";
import { enqueueOfflineOperation, listOfflineOperationsForModule } from "@/lib/offline/outbox";
import type { OfflineTenantKey, OfflineOutboxOperation } from "@/lib/offline/types";
import type { POSShiftData } from "./offline-bootstrap";

export type { POSShiftData };

// ── Constants ───────────────────────────────────────────────────────────────

const RETAIL_POS_OFFLINE_MODULE_ID = "retail-pos";
const SHIFT_CACHE_KEY = "pos_offline_shift";

let localShiftCounter = 0;

function generateShiftNo(): string {
  const timestamp = Date.now();
  localShiftCounter = (localShiftCounter + 1) % 1000;
  return `SHIFT-${timestamp}-${String(localShiftCounter).padStart(3, "0")}`;
}

function generateTempShiftId(): string {
  return `local:retail-pos:shift:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

// ── Shift Cache Operations ──────────────────────────────────────────────────

/**
 * Cache the current shift data locally.
 */
export async function cacheShift(shift: POSShiftData): Promise<void> {
  await putRecord(OFFLINE_DB_STORES.queryCache, {
    id: SHIFT_CACHE_KEY,
    tenantKey: "",
    queryKey: [SHIFT_CACHE_KEY],
    data: shift,
    updatedAt: Date.now(),
    maxAgeMs: 12 * 60 * 60 * 1000, // 12 hours (shift is short-lived)
    moduleId: "retail-pos",
  });
}

/**
 * Get the cached current shift.
 */
export async function getCurrentShift(): Promise<POSShiftData | null> {
  try {
    const record = await getRecord<{ data: POSShiftData; updatedAt: number }>(
      OFFLINE_DB_STORES.queryCache,
      SHIFT_CACHE_KEY
    );
    if (!record) return null;
    const age = Date.now() - (record.updatedAt ?? 0);
    if (age > 12 * 60 * 60 * 1000) return null; // stale after 12h
    return record.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Clear the cached shift (e.g., after closing).
 */
export async function clearCachedShift(): Promise<void> {
  try {
    const { deleteOfflineRecord } = await import("@/lib/offline/db");
    await deleteOfflineRecord(OFFLINE_DB_STORES.queryCache, SHIFT_CACHE_KEY);
  } catch {
    // Ignore
  }
}

// ── Shift Open (Offline) ────────────────────────────────────────────────────

export interface OfflineShiftOpenInput {
  siteId: string;
  openingCash: number;
  registerName?: string;
  employeeId: string;
  openedAt?: string;
}

/**
 * Open a shift offline.
 * 1. Creates a local entity for the shift with a tempId
 * 2. Caches the shift locally for immediate use
 * 3. Queues an "open-shift" operation in the outbox
 *
 * Sales created after this will depend on this shift operation being synced first.
 */
export async function openShiftOffline(
  tenantKey: OfflineTenantKey,
  input: OfflineShiftOpenInput
): Promise<{
  shift: POSShiftData;
  operation: OfflineOutboxOperation;
}> {
  const tempShiftId = generateTempShiftId();
  const shiftNo = generateShiftNo();
  const timestamp = input.openedAt ?? new Date().toISOString();

  const shiftData: POSShiftData = {
    id: tempShiftId,
    shiftNo,
    siteId: input.siteId,
    registerName: input.registerName ?? "POS Register",
    openingFloat: input.openingCash,
    expectedCash: input.openingCash,
    cashierId: input.employeeId,
    openedAt: timestamp,
    status: "OPEN",
    actorRole: "CASHIER",
    netSalesValue: 0,
    refundValue: 0,
    saleCount: 0,
    refundCount: 0,
    voidCount: 0,
    cashSales: 0,
    nonCashSales: 0,
    site: null, // Will be resolved on sync
  };

  // 1. Create local entity for the shift
  await upsertOfflineLocalEntity({
    tenantKey,
    moduleId: RETAIL_POS_OFFLINE_MODULE_ID,
    entityType: "shift",
    tempId: tempShiftId,
    displayLabel: `Shift ${shiftNo}`,
    searchableText: `${shiftNo} ${input.registerName ?? ""}`,
    payload: {
      siteId: input.siteId,
      openingCash: input.openingCash,
      registerName: input.registerName,
      openedAt: timestamp,
      employeeId: input.employeeId,
    },
  });

  // 2. Cache shift locally for immediate POS use
  await cacheShift(shiftData);

  // 3. Queue sync operation
  const operation = await enqueueOfflineOperation({
    tenantKey,
    moduleId: RETAIL_POS_OFFLINE_MODULE_ID,
    clientRequestId: tempShiftId,
    entityType: "shift",
    operation: "open-shift",
    dependsOn: [], // No dependencies — shift can sync immediately
    payload: {
      siteId: input.siteId,
      openingCash: input.openingCash,
      registerName: input.registerName,
      openedAt: timestamp,
      employeeId: input.employeeId,
      offlineCreated: true,
      tempShiftId,
      deviceId: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    },
    localRefs: {
      entityId: tempShiftId,
    },
    attachments: [],
    syncPriority: 5, // High priority — blocks sale sync
  });

  return { shift: shiftData, operation };
}

// ── Shift Close (Offline) ───────────────────────────────────────────────────

export interface OfflineShiftCloseInput {
  shiftId: string;
  closingCash: number;
  closingNotes?: string;
  closedAt?: string;
}

/**
 * Close a shift offline.
 * 1. Updates the local shift cache
 * 2. Queues a "close-shift" operation in the outbox
 *
 * Note: Full reconciliation requires connectivity.
 * Offline close records the intent; reconciliation happens on sync.
 */
export async function closeShiftOffline(
  tenantKey: OfflineTenantKey,
  input: OfflineShiftCloseInput
): Promise<{
  operation: OfflineOutboxOperation;
}> {
  const timestamp = input.closedAt ?? new Date().toISOString();

  // Get the current cached shift for context
  const currentShift = await getCurrentShift();

  // Update local cache
  if (currentShift && currentShift.id === input.shiftId) {
    await cacheShift({
      ...currentShift,
      status: "CLOSED",
    });
  }

  // Build dependencies: close depends on the shift-open operation
  const dependencies: string[] = [];
  if (isTempShiftId(input.shiftId)) {
    const shiftOps = await listOfflineOperationsForModule(
      RETAIL_POS_OFFLINE_MODULE_ID,
      tenantKey
    );
    const openOp = shiftOps.find(
      (op) =>
        op.operation === "open-shift" &&
        op.localRefs?.entityId === input.shiftId
    );
    if (openOp && openOp.status !== "SYNCED") {
      dependencies.push(openOp.operationId);
    }
  }

  // Queue close operation
  const operation = await enqueueOfflineOperation({
    tenantKey,
    moduleId: RETAIL_POS_OFFLINE_MODULE_ID,
    clientRequestId: `close:${input.shiftId}:${Date.now()}`,
    entityType: "shift",
    operation: "close-shift",
    dependsOn: dependencies,
    payload: {
      shiftId: input.shiftId,
      closingCash: input.closingCash,
      closingNotes: input.closingNotes,
      closedAt: timestamp,
      offlineCreated: true,
      finalSaleCount: currentShift?.saleCount ?? 0,
      finalCashSales: currentShift?.cashSales ?? 0,
      finalNonCashSales: currentShift?.nonCashSales ?? 0,
      expectedCash: currentShift?.expectedCash ?? input.closingCash,
    },
    attachments: [],
    syncPriority: 5, // Same priority as open
  });

  return { operation };
}

// ── Helper: Check if a shift ID is a temp (offline) ID ──────────────────────

function isTempShiftId(shiftId: string): boolean {
  return shiftId.startsWith("local:retail-pos:shift:");
}

// ── Shift-dependent Operations ──────────────────────────────────────────────

/**
 * Check if a shift is ready for sales (synced to server).
 * Returns true if the shift has a server ID or doesn't exist as a temp entity.
 */
export async function isShiftReadyForSales(
  tenantKey: OfflineTenantKey,
  shiftId: string
): Promise<boolean> {
  if (!isTempShiftId(shiftId)) {
    // Server-shift ID — ready
    return true;
  }

  // Check if the shift entity has been synced
  const { resolveOfflineEntityServerId } = await import("@/lib/offline/entity-store");
  const serverId = await resolveOfflineEntityServerId(tenantKey, shiftId);
  return serverId !== null;
}

/**
 * Get the effective shift ID to use in a sale payload.
 * If the shift has been synced, returns the server ID.
 * Otherwise returns the tempId (sale will depend on shift sync).
 */
export async function resolveShiftIdForSale(
  tenantKey: OfflineTenantKey,
  shiftId: string
): Promise<string> {
  if (!isTempShiftId(shiftId)) {
    return shiftId;
  }

  const { resolveOfflineEntityServerId } = await import("@/lib/offline/entity-store");
  const serverId = await resolveOfflineEntityServerId(tenantKey, shiftId);
  return serverId ?? shiftId;
}

// ── Offline Shift Status ────────────────────────────────────────────────────

/**
 * Get the status of offline shift operations.
 */
export async function getOfflineShiftOperations(tenantKey: OfflineTenantKey): Promise<{
  openOps: OfflineOutboxOperation[];
  closeOps: OfflineOutboxOperation[];
}> {
  const operations = await listOfflineOperationsForModule(
    RETAIL_POS_OFFLINE_MODULE_ID,
    tenantKey
  );

  return {
    openOps: operations.filter((op) => op.operation === "open-shift"),
    closeOps: operations.filter((op) => op.operation === "close-shift"),
  };
}

/**
 * Mark an offline-opened shift as synced.
 * Called when the server confirms shift creation.
 */
export async function markShiftSynced(
  tenantKey: OfflineTenantKey,
  tempId: string,
  serverId: string,
  serverShiftNo?: string
): Promise<void> {
  await markOfflineLocalEntitySynced(tenantKey, tempId, serverId);

  // Update cached shift with server ID
  const cached = await getCurrentShift();
  if (cached && cached.id === tempId) {
    await cacheShift({
      ...cached,
      id: serverId,
      shiftNo: serverShiftNo ?? cached.shiftNo,
    });
  }
}

// ── Shift Metrics (Local) ───────────────────────────────────────────────────

/**
 * Update local shift metrics after a sale.
 * This is purely for local display — server recalculates on sync.
 */
export async function updateShiftMetricsAfterSale(params: {
  totalAmount: number;
  cashNet: number;
  nonCashAmount: number;
  isRefund?: boolean;
}): Promise<void> {
  const shift = await getCurrentShift();
  if (!shift) return;

  const updated: POSShiftData = {
    ...shift,
    saleCount: shift.saleCount + (params.isRefund ? 0 : 1),
    refundCount: shift.refundCount + (params.isRefund ? 1 : 0),
    netSalesValue: shift.netSalesValue + params.totalAmount,
    cashSales: shift.cashSales + params.cashNet,
    nonCashSales: shift.nonCashSales + params.nonCashAmount,
    expectedCash: shift.expectedCash + params.cashNet,
  };

  await cacheShift(updated);
}
