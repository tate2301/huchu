/**
 * Offline Seller Management
 *
 * Caches seller profiles for offline lookup and creation.
 * Offline-created sellers get a tempId and are queued for sync.
 */

import {
  listOfflineLocalEntities,
  searchOfflineLocalEntities,
  upsertOfflineLocalEntity,
} from "@/lib/offline/entity-store";
import { OFFLINE_DB_STORES, getOfflineRecord, putOfflineRecord } from "@/lib/offline/db";

import { SCRAP_OFFLINE_MODULE_ID } from "./offline-runtime";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrapSeller {
  id: string;
  name: string;
  nationalId: string;
  phone: string;
  status: "active" | "inactive" | "blocked";
  verified: boolean;
  address?: string;
  notes?: string;
  createdAt?: string;
  lastUsedAt?: string;
}

export interface CreateSellerInput {
  name: string;
  nationalId: string;
  phone: string;
  address?: string;
  notes?: string;
}

export interface CachedSellersBundle {
  sellers: ScrapSeller[];
  fetchedAt: string;
  totalCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SELLERS_CACHE_KEY = "scrap:sellers:catalog";
const RECENT_SELLERS_CACHE_KEY = "scrap:sellers:recent";
const SELLER_ENTITY_TYPE = "seller";
const MAX_RECENT_SELLERS = 20;

// ---------------------------------------------------------------------------
// Seller cache operations
// ---------------------------------------------------------------------------

/**
 * Bulk cache sellers from the server.
 * Called during Phase 2 bootstrap.
 */
export async function cacheSellers(sellers: ScrapSeller[]): Promise<void> {
  const bundle: CachedSellersBundle = {
    sellers,
    fetchedAt: new Date().toISOString(),
    totalCount: sellers.length,
  };

  await putOfflineRecord(OFFLINE_DB_STORES.queryCache, {
    id: SELLERS_CACHE_KEY,
    tenantKey: "",
    queryKey: ["scrap-sellers-catalog"],
    data: bundle,
    updatedAt: Date.now(),
    maxAgeMs: 24 * 60 * 60 * 1000, // 24 hours
    moduleId: SCRAP_OFFLINE_MODULE_ID,
  });
}

/**
 * Get all cached sellers (server-synced).
 */
export async function getCachedSellers(): Promise<ScrapSeller[]> {
  const record = await getOfflineRecord<{
    data: CachedSellersBundle;
  }>(OFFLINE_DB_STORES.queryCache, SELLERS_CACHE_KEY);

  return record?.data?.sellers ?? [];
}

/**
 * Search sellers by name, national ID, or phone number.
 * Searches both server-cached and offline-created sellers.
 */
export async function searchSellers(query: string): Promise<ScrapSeller[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return getRecentSellers(50);

  // Search server-cached sellers
  const cached = await getCachedSellers();
  const cachedMatches = cached.filter((seller) => {
    if (seller.status === "blocked") return false;
    return (
      seller.name.toLowerCase().includes(normalized) ||
      seller.nationalId.toLowerCase().includes(normalized) ||
      seller.phone.toLowerCase().includes(normalized)
    );
  });

  // Search offline-created sellers
  const localEntities = await listOfflineLocalEntities({
    moduleId: SCRAP_OFFLINE_MODULE_ID,
    entityType: SELLER_ENTITY_TYPE,
  });

  const localMatches = localEntities
    .filter((entity) => {
      if (entity.status === "SYNCED") return false; // Already in cached
      return entity.searchableText.toLowerCase().includes(normalized);
    })
    .map((entity) => ({
      id: entity.tempId,
      name: String(entity.payload.fullName ?? entity.displayLabel),
      nationalId: String(entity.payload.nationalId ?? ""),
      phone: String(entity.payload.phone ?? ""),
      status: "active" as const,
      verified: false,
      address: String(entity.payload.address ?? ""),
      notes: String(entity.payload.notes ?? ""),
    }));

  // Merge: offline-created first (they have "New" badge in UI)
  return [...localMatches, ...cachedMatches];
}

/**
 * Get a single seller by ID.
 * Handles both server IDs and tempIds for offline-created sellers.
 */
export async function getSellerById(id: string): Promise<ScrapSeller | null> {
  // Check server-cached sellers first
  const cached = await getCachedSellers();
  const cachedMatch = cached.find((s) => s.id === id);
  if (cachedMatch) return cachedMatch;

  // Check offline-created sellers
  const localEntities = await listOfflineLocalEntities({
    moduleId: SCRAP_OFFLINE_MODULE_ID,
    entityType: SELLER_ENTITY_TYPE,
  });

  const localMatch = localEntities.find((e) => e.tempId === id || e.serverId === id);
  if (localMatch) {
    return {
      id: localMatch.tempId,
      name: String(localMatch.payload.fullName ?? localMatch.displayLabel),
      nationalId: String(localMatch.payload.nationalId ?? ""),
      phone: String(localMatch.payload.phone ?? ""),
      status: "active" as const,
      verified: false,
      address: String(localMatch.payload.address ?? ""),
      notes: String(localMatch.payload.notes ?? ""),
    };
  }

  return null;
}

/**
 * Create a seller offline.
 * Creates a local entity + queues an outbox operation.
 * Returns the seller with a tempId.
 */
export async function createSellerOffline(
  tenantKey: string,
  input: CreateSellerInput,
): Promise<ScrapSeller & { tempId: string; isOfflineEntity: true }> {
  const { createOfflineScrapSeller } = await import("./offline-runtime");

  const result = await createOfflineScrapSeller(tenantKey, {
    fullName: input.name,
    phone: input.phone,
    nationalId: input.nationalId,
    address: input.address,
    notes: input.notes,
  });

  // Add to recent sellers
  await addRecentSeller({
    id: result.record.tempId,
    name: input.name,
    nationalId: input.nationalId,
    phone: input.phone,
    status: "active",
    verified: false,
  });

  return {
    id: result.record.tempId,
    tempId: result.record.tempId,
    name: input.name,
    nationalId: input.nationalId,
    phone: input.phone,
    status: "active",
    verified: false,
    address: input.address,
    notes: input.notes,
    isOfflineEntity: true,
  };
}

/**
 * Get recently used sellers.
 * Combines cached recent sellers + offline-created sellers.
 */
export async function getRecentSellers(limit = MAX_RECENT_SELLERS): Promise<ScrapSeller[]> {
  // Get offline-created sellers first (most recent)
  const localEntities = await listOfflineLocalEntities({
    moduleId: SCRAP_OFFLINE_MODULE_ID,
    entityType: SELLER_ENTITY_TYPE,
    status: "LOCAL",
  });

  const localSellers = localEntities.map((entity) => ({
    id: entity.tempId,
    name: String(entity.payload.fullName ?? entity.displayLabel),
    nationalId: String(entity.payload.nationalId ?? ""),
    phone: String(entity.payload.phone ?? ""),
    status: "active" as const,
    verified: false,
    address: String(entity.payload.address ?? ""),
    notes: String(entity.payload.notes ?? ""),
    lastUsedAt: entity.updatedAt,
  }));

  // Get cached recent sellers
  const record = await getOfflineRecord<{
    data: { sellers: ScrapSeller[]; updatedAt: string };
  }>(OFFLINE_DB_STORES.queryCache, RECENT_SELLERS_CACHE_KEY);

  const recentSellers = record?.data?.sellers ?? [];

  // Merge and dedupe, offline-created first
  const seen = new Set<string>();
  const merged: ScrapSeller[] = [];

  for (const seller of [...localSellers, ...recentSellers]) {
    if (!seen.has(seller.id)) {
      seen.add(seller.id);
      merged.push(seller);
    }
    if (merged.length >= limit) break;
  }

  return merged;
}

/**
 * Record a seller as recently used.
 */
export async function addRecentSeller(seller: ScrapSeller): Promise<void> {
  const recent = await getRecentSellers(100);

  // Remove existing entry for this seller
  const filtered = recent.filter((s) => s.id !== seller.id);

  // Add to front
  const updated = [seller, ...filtered].slice(0, MAX_RECENT_SELLERS);

  await putOfflineRecord(OFFLINE_DB_STORES.queryCache, {
    id: RECENT_SELLERS_CACHE_KEY,
    tenantKey: "",
    queryKey: ["scrap-sellers-recent"],
    data: { sellers: updated, updatedAt: new Date().toISOString() },
    updatedAt: Date.now(),
    maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    moduleId: SCRAP_OFFLINE_MODULE_ID,
  });
}

/**
 * Check seller verification status.
 * Offline: returns cached verification status.
 */
export async function isSellerVerified(sellerId: string): Promise<boolean> {
  const seller = await getSellerById(sellerId);
  return seller?.verified ?? false;
}

/**
 * Get the total count of cached sellers (server + offline-created).
 */
export async function getCachedSellerCount(): Promise<{
  server: number;
  offlineCreated: number;
  total: number;
}> {
  const [cached, localEntities] = await Promise.all([
    getCachedSellers(),
    listOfflineLocalEntities({
      moduleId: SCRAP_OFFLINE_MODULE_ID,
      entityType: SELLER_ENTITY_TYPE,
      status: "LOCAL",
    }),
  ]);

  return {
    server: cached.length,
    offlineCreated: localEntities.length,
    total: cached.length + localEntities.length,
  };
}

/**
 * Check if a seller ID is an offline-created tempId.
 */
export function isOfflineSellerId(sellerId: string | null | undefined): boolean {
  if (!sellerId) return false;
  return sellerId.startsWith("local:scrap-metal:seller:");
}
