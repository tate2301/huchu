/**
 * Offline Customer Management
 * ---------------------------------------------------------------------------
 * Manages customer data for POS offline operation.
 * Provides search, lookup, and offline customer creation
 * with local entity storage + outbox sync.
 */

import { OFFLINE_DB_STORES } from "@/lib/offline/db";
import { putRecord, getRecord } from "@/lib/offline/db-v2";
import {
  upsertOfflineLocalEntity,
  listOfflineLocalEntities,
  searchOfflineLocalEntities as searchLocalEntities,
  markOfflineLocalEntitySynced,
  resolveOfflineEntityServerId,
} from "@/lib/offline/entity-store";
import { enqueueOfflineOperation } from "@/lib/offline/outbox";
import type { OfflineTenantKey } from "@/lib/offline/types";
import type { POSCustomer } from "./offline-bootstrap";

export type { POSCustomer };

// ── Constants ───────────────────────────────────────────────────────────────

const CUSTOMER_CACHE_KEY = "pos_offline_customers";
const RETAIL_POS_OFFLINE_MODULE_ID = "retail-pos";

// ── Local Cache Operations ──────────────────────────────────────────────────

/**
 * Bulk cache customers from server for offline search.
 */
export async function cacheCustomers(customers: POSCustomer[]): Promise<void> {
  await putRecord(OFFLINE_DB_STORES.queryCache, {
    id: CUSTOMER_CACHE_KEY,
    tenantKey: "",
    queryKey: [CUSTOMER_CACHE_KEY],
    data: customers,
    updatedAt: Date.now(),
    maxAgeMs: 24 * 60 * 60 * 1000, // 24 hours
    moduleId: "retail-pos",
  });
}

/**
 * Get all cached customers (server-fetched + offline-created).
 */
export async function getAllCachedCustomers(
  tenantKey: OfflineTenantKey
): Promise<POSCustomer[]> {
  const [serverCustomers, offlineCustomers] = await Promise.all([
    getCachedServerCustomers(),
    getOfflineCreatedCustomers(tenantKey),
  ]);

  // Merge: offline customers take priority (they may be newer)
  const serverMap = new Map(serverCustomers.map((c) => [c.id, c]));

  for (const offline of offlineCustomers) {
    if (offline.tempId && !offline.isOfflineEntity) {
      // This is a synced offline customer — merge
      const existing = serverMap.get(offline.id);
      if (existing) {
        serverMap.set(offline.id, { ...existing, ...offline, isOfflineEntity: true });
      } else {
        serverMap.set(offline.id, offline);
      }
    }
  }

  return Array.from(serverMap.values());
}

/**
 * Get server-cached customers.
 */
async function getCachedServerCustomers(): Promise<POSCustomer[]> {
  try {
    const record = await getRecord<{ data: POSCustomer[]; updatedAt: number }>(
      OFFLINE_DB_STORES.queryCache,
      CUSTOMER_CACHE_KEY
    );
    if (!record) return [];
    const age = Date.now() - (record.updatedAt ?? 0);
    if (age > 24 * 60 * 60 * 1000) return [];
    return record.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Get locally-created offline customers.
 */
export async function getOfflineCreatedCustomers(
  tenantKey: OfflineTenantKey
): Promise<POSCustomer[]> {
  const records = await listOfflineLocalEntities({
    tenantKey,
    moduleId: RETAIL_POS_OFFLINE_MODULE_ID,
    entityType: "customer",
  });

  return records.map((record) => ({
    id: record.serverId ?? record.tempId,
    name: record.displayLabel,
    phone: (record.payload.phone as string) ?? null,
    email: (record.payload.email as string) ?? null,
    nationalId: (record.payload.nationalId as string) ?? null,
    address: (record.payload.address as string) ?? null,
    loyaltyTier: "BRONZE",
    loyaltyPoints: 0,
    isOfflineEntity: true,
    tempId: record.tempId,
    offlineStatus: record.status,
  }));
}

// ── Search ──────────────────────────────────────────────────────────────────

/**
 * Search cached customers by name or phone.
 * Returns merged results from server cache + offline-created customers.
 */
export async function searchCustomers(
  tenantKey: OfflineTenantKey,
  query: string
): Promise<POSCustomer[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  const [serverResults, offlineResults] = await Promise.all([
    searchServerCustomers(query),
    searchOfflineCustomers(tenantKey, query),
  ]);

  // Deduplicate by ID (prefer offline entities if they exist)
  const resultMap = new Map<string, POSCustomer>();

  for (const customer of serverResults) {
    resultMap.set(customer.id, customer);
  }

  for (const customer of offlineResults) {
    resultMap.set(customer.id, customer);
  }

  return Array.from(resultMap.values());
}

/**
 * Search server-cached customers.
 */
async function searchServerCustomers(query: string): Promise<POSCustomer[]> {
  const customers = await getCachedServerCustomers();
  if (!customers.length) return [];

  const normalized = query.trim().toLowerCase();
  return customers.filter((customer) => {
    const matchesName = customer.name.toLowerCase().includes(normalized);
    const matchesPhone = customer.phone?.toLowerCase().includes(normalized) ?? false;
    const matchesEmail = customer.email?.toLowerCase().includes(normalized) ?? false;
    return matchesName || matchesPhone || matchesEmail;
  });
}

/**
 * Search offline-created customers via entity store.
 */
async function searchOfflineCustomers(
  tenantKey: OfflineTenantKey,
  query: string
): Promise<POSCustomer[]> {
  const records = await listOfflineLocalEntities({
    tenantKey,
    moduleId: RETAIL_POS_OFFLINE_MODULE_ID,
    entityType: "customer",
  });

  const filtered = searchLocalEntities(records, query);

  return filtered.map((record) => ({
    id: record.serverId ?? record.tempId,
    name: record.displayLabel,
    phone: (record.payload.phone as string) ?? null,
    email: (record.payload.email as string) ?? null,
    nationalId: (record.payload.nationalId as string) ?? null,
    address: (record.payload.address as string) ?? null,
    loyaltyTier: "BRONZE",
    loyaltyPoints: 0,
    isOfflineEntity: true,
    tempId: record.tempId,
    offlineStatus: record.status,
  }));
}

// ── Lookup ──────────────────────────────────────────────────────────────────

/**
 * Get a single customer by ID.
 * Checks server cache first, then offline entities.
 */
export async function getCustomerById(
  tenantKey: OfflineTenantKey,
  id: string
): Promise<POSCustomer | null> {
  // Check if this is an offline temp ID
  if (isOfflineTempId(id)) {
    return getOfflineCustomerByTempId(tenantKey, id);
  }

  // Check server cache
  const serverCustomers = await getCachedServerCustomers();
  const fromCache = serverCustomers.find((c) => c.id === id);
  if (fromCache) return fromCache;

  // Check offline entities
  return getOfflineCustomerByTempId(tenantKey, id);
}

function isOfflineTempId(id: string): boolean {
  return id.startsWith("local:retail-pos:customer:");
}

async function getOfflineCustomerByTempId(
  tenantKey: OfflineTenantKey,
  tempId: string
): Promise<POSCustomer | null> {
  const records = await listOfflineLocalEntities({
    tenantKey,
    moduleId: RETAIL_POS_OFFLINE_MODULE_ID,
    entityType: "customer",
  });

  const record = records.find(
    (r) => r.tempId === tempId || r.serverId === tempId
  );

  if (!record) return null;

  return {
    id: record.serverId ?? record.tempId,
    name: record.displayLabel,
    phone: (record.payload.phone as string) ?? null,
    email: (record.payload.email as string) ?? null,
    nationalId: (record.payload.nationalId as string) ?? null,
    address: (record.payload.address as string) ?? null,
    loyaltyTier: "BRONZE",
    loyaltyPoints: 0,
    isOfflineEntity: true,
    tempId: record.tempId,
    offlineStatus: record.status,
  };
}

// ── Offline Customer Creation ───────────────────────────────────────────────

export interface OfflineCustomerInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  nationalId?: string | null;
  address?: string | null;
}

/**
 * Create a customer offline.
 * 1. Creates a local entity in the entity store
 * 2. Queues a "create-customer" operation in the outbox
 * 3. Returns the local customer with a tempId
 */
export async function createCustomerOffline(
  tenantKey: OfflineTenantKey,
  data: OfflineCustomerInput
): Promise<POSCustomer> {
  // Build searchable text for indexing
  const searchableText = [data.name, data.phone, data.email, data.nationalId]
    .filter(Boolean)
    .join(" ");

  // 1. Create local entity
  const entity = await upsertOfflineLocalEntity({
    tenantKey,
    moduleId: RETAIL_POS_OFFLINE_MODULE_ID,
    entityType: "customer",
    displayLabel: data.name,
    searchableText,
    payload: {
      name: data.name,
      phone: data.phone ?? null,
      email: data.email ?? null,
      nationalId: data.nationalId ?? null,
      address: data.address ?? null,
      loyaltyTier: "BRONZE",
    },
  });

  // 2. Queue sync operation
  await enqueueOfflineOperation({
    tenantKey,
    moduleId: RETAIL_POS_OFFLINE_MODULE_ID,
    clientRequestId: entity.tempId,
    entityType: "customer",
    operation: "create-customer",
    dependsOn: [],
    payload: {
      name: data.name,
      phone: data.phone ?? null,
      email: data.email ?? null,
      nationalId: data.nationalId ?? null,
      address: data.address ?? null,
      loyaltyTier: "BRONZE",
      offlineCreated: true,
      offlineCreatedAt: new Date().toISOString(),
      tempId: entity.tempId,
    },
    localRefs: {
      entityId: entity.tempId,
    },
    attachments: [],
    syncPriority: 10,
  });

  // 3. Return local customer
  return {
    id: entity.tempId,
    name: data.name,
    phone: data.phone ?? null,
    email: data.email ?? null,
    nationalId: data.nationalId ?? null,
    address: data.address ?? null,
    loyaltyTier: "BRONZE",
    loyaltyPoints: 0,
    isOfflineEntity: true,
    tempId: entity.tempId,
    offlineStatus: "LOCAL",
  };
}

// ── Sync Resolution ─────────────────────────────────────────────────────────

/**
 * Mark an offline-created customer as synced.
 * Called after the outbox operation succeeds and server returns the real ID.
 */
export async function markCustomerSynced(
  tenantKey: OfflineTenantKey,
  tempId: string,
  serverId: string
): Promise<void> {
  await markOfflineLocalEntitySynced(tenantKey, tempId, serverId);
}

/**
 * Resolve a tempId to a server ID.
 * Returns the tempId if not yet synced.
 */
export async function resolveCustomerServerId(
  tenantKey: OfflineTenantKey,
  tempId: string
): Promise<string | null> {
  return resolveOfflineEntityServerId(tenantKey, tempId);
}

// ── Phone/Name Index ────────────────────────────────────────────────────────

/**
 * Build a phone-based lookup index for fast customer resolution.
 * Used when a phone number is entered at checkout.
 */
export async function buildPhoneIndex(
  tenantKey: OfflineTenantKey
): Promise<Map<string, POSCustomer>> {
  const allCustomers = await getAllCachedCustomers(tenantKey);
  const index = new Map<string, POSCustomer>();

  for (const customer of allCustomers) {
    if (customer.phone) {
      const normalized = customer.phone.replace(/\D/g, "");
      index.set(normalized, customer);
    }
  }

  return index;
}

/**
 * Look up a customer by phone number.
 */
export async function getCustomerByPhone(
  tenantKey: OfflineTenantKey,
  phone: string
): Promise<POSCustomer | null> {
  const normalizedPhone = phone.replace(/\D/g, "");
  const allCustomers = await getAllCachedCustomers(tenantKey);

  return (
    allCustomers.find((c) => {
      if (!c.phone) return false;
      return c.phone.replace(/\D/g, "") === normalizedPhone;
    }) ?? null
  );
}

/**
 * Look up a customer by name (exact or close match).
 */
export async function getCustomerByName(
  tenantKey: OfflineTenantKey,
  name: string
): Promise<POSCustomer | null> {
  const normalizedName = name.trim().toLowerCase();
  const allCustomers = await getAllCachedCustomers(tenantKey);

  return (
    allCustomers.find((c) => {
      const customerName = c.name.trim().toLowerCase();
      return (
        customerName === normalizedName ||
        customerName.includes(normalizedName)
      );
    }) ?? null
  );
}
