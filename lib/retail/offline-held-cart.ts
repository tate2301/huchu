/**
 * Offline Held Carts
 * ---------------------------------------------------------------------------
 * Manages held (parked) carts for POS offline operation.
 * Provides hold, recall, list, and delete operations.
 *
 * Merge strategy: server-held carts + locally-held carts are merged
 * with locally-held carts taking priority (newer state).
 */

import { OFFLINE_DB_STORES } from "@/lib/offline/db";
import { putRecord, getRecord } from "@/lib/offline/db-v2";
import { enqueueOfflineOperation, listOfflineOperationsForModule } from "@/lib/offline/outbox";
import type { OfflineTenantKey, OfflineOutboxOperation } from "@/lib/offline/types";
import type { POSHeldCart } from "./offline-bootstrap";
import { getCurrentShift } from "./offline-shift";

export type { POSHeldCart };

// ── Constants ───────────────────────────────────────────────────────────────

const RETAIL_POS_OFFLINE_MODULE_ID = "retail-pos";
const LOCAL_HELD_CARTS_KEY = "pos_offline_local_held_carts";

let localHeldCartCounter = 0;

function generateHoldNo(): string {
  const timestamp = Date.now();
  localHeldCartCounter = (localHeldCartCounter + 1) % 1000;
  return `HOLD-${timestamp}-${String(localHeldCartCounter).padStart(3, "0")}`;
}

function generateTempCartId(): string {
  return `local:retail-pos:held-cart:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

// ── Local Held Cart Storage ─────────────────────────────────────────────────

interface LocalHeldCartEntry {
  id: string;
  holdNo: string;
  label: string | null;
  createdAt: string;
  shiftId: string;
  cashierId: string | null;
  items: POSHeldCart["items"];
  customerName?: string;
  customerPhone?: string;
  note?: string;
  orderDiscountAmount?: string;
  selectedPromotionId?: string;
  synced: boolean; // Whether this has been synced to server
}

async function getLocalHeldCarts(): Promise<LocalHeldCartEntry[]> {
  try {
    const record = await getRecord<{ data: LocalHeldCartEntry[]; updatedAt: number }>(
      OFFLINE_DB_STORES.queryCache,
      LOCAL_HELD_CARTS_KEY
    );
    return record?.data ?? [];
  } catch {
    return [];
  }
}

async function saveLocalHeldCarts(carts: LocalHeldCartEntry[]): Promise<void> {
  await putRecord(OFFLINE_DB_STORES.queryCache, {
    id: LOCAL_HELD_CARTS_KEY,
    tenantKey: "",
    queryKey: [LOCAL_HELD_CARTS_KEY],
    data: carts,
    updatedAt: Date.now(),
    maxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    moduleId: "retail-pos",
  });
}

// ── Hold Cart ───────────────────────────────────────────────────────────────

export interface HoldCartInput {
  shiftId: string;
  items: POSHeldCart["items"];
  customerName?: string;
  customerPhone?: string;
  note?: string;
  orderDiscountAmount?: string;
  selectedPromotionId?: string;
  cashierId?: string | null;
  label?: string;
}

/**
 * Hold a cart locally (offline).
 * 1. Stores the cart in local IndexedDB cache
 * 2. Queues a "create-held-cart" operation in the outbox for sync
 *
 * Held carts depend on their shift being synced first.
 */
export async function holdCartOffline(
  tenantKey: OfflineTenantKey,
  input: HoldCartInput
): Promise<{
  heldCart: POSHeldCart;
  operation: OfflineOutboxOperation;
}> {
  const tempCartId = generateTempCartId();
  const holdNo = generateHoldNo();
  const timestamp = new Date().toISOString();

  // Build local entry
  const localEntry: LocalHeldCartEntry = {
    id: tempCartId,
    holdNo,
    label: input.label ?? input.customerName ?? null,
    createdAt: timestamp,
    shiftId: input.shiftId,
    cashierId: input.cashierId ?? null,
    items: input.items,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    note: input.note,
    orderDiscountAmount: input.orderDiscountAmount,
    selectedPromotionId: input.selectedPromotionId,
    synced: false,
  };

  // Save to local cache
  const existing = await getLocalHeldCarts();
  await saveLocalHeldCarts([localEntry, ...existing]);

  // Build outbox payload
  const outboxPayload = {
    shiftId: input.shiftId,
    items: input.items,
    note: input.note,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    heldAt: timestamp,
    label: input.label,
    orderDiscountAmount: input.orderDiscountAmount,
    selectedPromotionId: input.selectedPromotionId,
    offlineCreated: true,
    tempCartId,
  };

  // Resolve shift dependency
  const dependencies: string[] = [];
  if (isTempShiftId(input.shiftId)) {
    const shiftOps = await listOfflineOperationsForModule(
      RETAIL_POS_OFFLINE_MODULE_ID,
      tenantKey
    );
    const shiftOp = shiftOps.find(
      (op) => op.operation === "open-shift" && op.localRefs?.entityId === input.shiftId
    );
    if (shiftOp && shiftOp.status !== "SYNCED") {
      dependencies.push(shiftOp.operationId);
    }
  }

  // Queue sync operation
  const operation = await enqueueOfflineOperation({
    tenantKey,
    moduleId: RETAIL_POS_OFFLINE_MODULE_ID,
    clientRequestId: tempCartId,
    entityType: "held-cart",
    operation: "create-held-cart",
    dependsOn: dependencies,
    payload: outboxPayload,
    localRefs: {
      entityId: tempCartId,
    },
    attachments: [],
    syncPriority: 15, // Lower than sales but higher than voids
  });

  const heldCart: POSHeldCart = {
    id: tempCartId,
    holdNo,
    label: localEntry.label,
    createdAt: timestamp,
    shiftId: input.shiftId,
    cashierId: input.cashierId ?? null,
    items: input.items,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    note: input.note,
    orderDiscountAmount: input.orderDiscountAmount,
    selectedPromotionId: input.selectedPromotionId,
    isOfflineHeld: true,
  };

  return { heldCart, operation };
}

// ── Recall Held Cart ────────────────────────────────────────────────────────

/**
 * Recall a held cart from local cache by ID.
 * Returns the cart data for restoration into the active cart.
 */
export async function recallHeldCart(cartId: string): Promise<POSHeldCart | null> {
  const localCarts = await getLocalHeldCarts();
  const localEntry = localCarts.find((c) => c.id === cartId);

  if (localEntry) {
    return localEntryToPOSHeldCart(localEntry);
  }

  // If not found locally, it might be a server-held cart
  // Server-held carts should be fetched via the API
  return null;
}

// ── List Held Carts ─────────────────────────────────────────────────────────

/**
 * List all held carts — merges server-cached carts with locally-held carts.
 *
 * @param serverCarts — Held carts fetched from the server API (if online)
 * @returns Merged list with locally-held carts prioritized
 */
export async function getHeldCarts(serverCarts?: POSHeldCart[]): Promise<POSHeldCart[]> {
  const localCarts = await getLocalHeldCarts();
  const localAsPOS = localCarts.map(localEntryToPOSHeldCart);

  if (!serverCarts || serverCarts.length === 0) {
    return localAsPOS;
  }

  // Merge strategy: local carts take priority (newer state)
  // Server carts that don't exist locally are included
  const localIds = new Set(localCarts.map((c) => c.id));

  const merged: POSHeldCart[] = [
    ...localAsPOS,
    ...serverCarts.filter((sc) => !localIds.has(sc.id)),
  ];

  // Sort by createdAt descending (most recent first)
  merged.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return merged;
}

/**
 * Get held carts filtered by current shift.
 */
export async function getHeldCartsForShift(
  shiftId: string,
  serverCarts?: POSHeldCart[]
): Promise<POSHeldCart[]> {
  const all = await getHeldCarts(serverCarts);
  return all.filter((cart) => cart.shiftId === shiftId);
}

// ── Delete Held Cart ────────────────────────────────────────────────────────

/**
 * Delete a held cart locally and queue a delete operation for sync.
 */
export async function deleteHeldCart(
  tenantKey: OfflineTenantKey,
  cartId: string
): Promise<void> {
  // Remove from local cache
  const localCarts = await getLocalHeldCarts();
  const updated = localCarts.filter((c) => c.id !== cartId);
  await saveLocalHeldCarts(updated);

  // If it's a server-held cart (not a tempId), queue a delete operation
  if (!cartId.startsWith("local:")) {
    await enqueueOfflineOperation({
      tenantKey,
      moduleId: RETAIL_POS_OFFLINE_MODULE_ID,
      clientRequestId: `delete-held-cart:${cartId}:${Date.now()}`,
      entityType: "held-cart",
      operation: "delete-held-cart",
      dependsOn: [],
      payload: { cartId, deletedAt: new Date().toISOString() },
      attachments: [],
      syncPriority: 15,
    });
  }
}

/**
 * Mark a held cart as recalled (restored to active cart).
 * This removes it from the held carts list.
 */
export async function markHeldCartRecalled(
  tenantKey: OfflineTenantKey,
  cartId: string
): Promise<void> {
  // Remove from local cache
  const localCarts = await getLocalHeldCarts();
  const updated = localCarts.filter((c) => c.id !== cartId);
  await saveLocalHeldCarts(updated);

  // If it's a server-held cart, queue a delete
  if (!cartId.startsWith("local:")) {
    await enqueueOfflineOperation({
      tenantKey,
      moduleId: RETAIL_POS_OFFLINE_MODULE_ID,
      clientRequestId: `recall-held-cart:${cartId}:${Date.now()}`,
      entityType: "held-cart",
      operation: "delete-held-cart",
      dependsOn: [],
      payload: { cartId, recalledAt: new Date().toISOString() },
      attachments: [],
      syncPriority: 15,
    });
  }
}

// ── Update Held Cart (for background sync) ──────────────────────────────────

/**
 * Mark a locally-held cart as synced after the server confirms creation.
 */
export async function markHeldCartSynced(
  tempCartId: string,
  serverCartId: string,
  serverHoldNo?: string
): Promise<void> {
  const localCarts = await getLocalHeldCarts();
  const updated = localCarts.map((c) => {
    if (c.id === tempCartId) {
      return { ...c, id: serverCartId, holdNo: serverHoldNo ?? c.holdNo, synced: true };
    }
    return c;
  });
  await saveLocalHeldCarts(updated);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function localEntryToPOSHeldCart(entry: LocalHeldCartEntry): POSHeldCart {
  return {
    id: entry.id,
    holdNo: entry.holdNo,
    label: entry.label,
    createdAt: entry.createdAt,
    shiftId: entry.shiftId,
    cashierId: entry.cashierId,
    items: entry.items,
    customerName: entry.customerName,
    customerPhone: entry.customerPhone,
    note: entry.note,
    orderDiscountAmount: entry.orderDiscountAmount,
    selectedPromotionId: entry.selectedPromotionId,
    isOfflineHeld: !entry.synced,
  };
}

function isTempShiftId(shiftId: string): boolean {
  return shiftId.startsWith("local:retail-pos:shift:");
}

// ── Statistics ──────────────────────────────────────────────────────────────

export async function getHeldCartCount(shiftId?: string): Promise<number> {
  const carts = await getHeldCarts();
  if (shiftId) {
    return carts.filter((c) => c.shiftId === shiftId).length;
  }
  return carts.length;
}

export async function getLocalHeldCartCount(): Promise<number> {
  const carts = await getLocalHeldCarts();
  return carts.length;
}
