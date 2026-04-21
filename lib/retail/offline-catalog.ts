/**
 * Offline Product Catalog
 * ---------------------------------------------------------------------------
 * Manages cached product catalog for POS offline operation.
 * Provides search, barcode lookup, and category filtering
 * backed by IndexedDB query cache.
 */

import { OFFLINE_DB_STORES } from "@/lib/offline/db";
import { putRecord, getRecord, listRecords } from "@/lib/offline/db-v2";
import type { POSCatalogItem } from "./offline-bootstrap";

export type { POSCatalogItem };

// ── Cache Keys ──────────────────────────────────────────────────────────────

const CATALOG_CACHE_KEY = "pos_offline_catalog";
const BARCODE_INDEX_KEY = "pos_offline_barcode_index";
const CATEGORIES_CACHE_KEY = "pos_offline_categories";

// ── Catalog Cache Operations ────────────────────────────────────────────────

/**
 * Bulk cache catalog items to IndexedDB.
 * Also rebuilds the barcode index automatically.
 */
export async function cacheCatalog(items: POSCatalogItem[]): Promise<void> {
  await putRecord(OFFLINE_DB_STORES.queryCache, {
    id: CATALOG_CACHE_KEY,
    tenantKey: "",
    queryKey: [CATALOG_CACHE_KEY],
    data: items,
    updatedAt: Date.now(),
    maxAgeMs: 24 * 60 * 60 * 1000, // 24 hours
    moduleId: "retail-pos",
  });

  // Rebuild barcode index
  await rebuildBarcodeIndex(items);

  // Extract and cache categories
  await cacheCategories(items);
}

/**
 * Retrieve all cached catalog items.
 */
export async function getCachedCatalog(): Promise<POSCatalogItem[] | null> {
  try {
    const record = await getRecord<{ data: POSCatalogItem[]; updatedAt: number }>(
      OFFLINE_DB_STORES.queryCache,
      CATALOG_CACHE_KEY
    );
    if (!record) return null;
    const age = Date.now() - (record.updatedAt ?? 0);
    if (age > 24 * 60 * 60 * 1000) return null;
    return record.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Get a single product by ID from the cache.
 */
export async function getProductById(id: string): Promise<POSCatalogItem | null> {
  const catalog = await getCachedCatalog();
  if (!catalog) return null;
  return catalog.find((item) => item.id === id) ?? null;
}

// ── Barcode Index ───────────────────────────────────────────────────────────

interface BarcodeIndex {
  [barcode: string]: string; // barcode → catalogItemId
}

/**
 * Rebuild the barcode index from catalog items.
 */
async function rebuildBarcodeIndex(items: POSCatalogItem[]): Promise<void> {
  const index: BarcodeIndex = {};
  for (const item of items) {
    if (item.barcode) {
      // Index by full barcode
      index[item.barcode] = item.id;
      // Also index by common barcode prefixes for partial matching
      if (item.barcode.length >= 8) {
        index[item.barcode] = item.id;
      }
    }
  }

  await putRecord(OFFLINE_DB_STORES.queryCache, {
    id: BARCODE_INDEX_KEY,
    tenantKey: "",
    queryKey: [BARCODE_INDEX_KEY],
    data: index,
    updatedAt: Date.now(),
    maxAgeMs: 24 * 60 * 60 * 1000,
    moduleId: "retail-pos",
  });
}

/**
 * Get the cached barcode index.
 */
async function getBarcodeIndex(): Promise<BarcodeIndex | null> {
  try {
    const record = await getRecord<{ data: BarcodeIndex; updatedAt: number }>(
      OFFLINE_DB_STORES.queryCache,
      BARCODE_INDEX_KEY
    );
    if (!record) return null;
    const age = Date.now() - (record.updatedAt ?? 0);
    if (age > 24 * 60 * 60 * 1000) return null;
    return record.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Look up a product by barcode scan.
 * Supports exact match and partial match for barcode scanning scenarios.
 */
export async function getProductByBarcode(barcode: string): Promise<POSCatalogItem | null> {
  if (!barcode || barcode.trim().length === 0) return null;

  const normalizedBarcode = barcode.trim();

  // Try exact lookup from index first
  const index = await getBarcodeIndex();
  if (index && index[normalizedBarcode]) {
    return getProductById(index[normalizedBarcode]);
  }

  // Fallback: search catalog directly for partial barcode match
  const catalog = await getCachedCatalog();
  if (!catalog) return null;

  // Exact match on barcode field
  const exactMatch = catalog.find(
    (item) => item.barcode?.trim() === normalizedBarcode
  );
  if (exactMatch) return exactMatch;

  // Partial match (barcode starts/ends with scanned value)
  const partialMatch = catalog.find((item) => {
    if (!item.barcode) return false;
    return (
      item.barcode.startsWith(normalizedBarcode) ||
      item.barcode.endsWith(normalizedBarcode)
    );
  });
  if (partialMatch) return partialMatch;

  return null;
}

// ── Category Support ────────────────────────────────────────────────────────

async function cacheCategories(items: POSCatalogItem[]): Promise<void> {
  const categories = [...new Set(items.map((item) => item.category).filter(Boolean))];
  if (categories.length === 0) return;

  await putRecord(OFFLINE_DB_STORES.queryCache, {
    id: CATEGORIES_CACHE_KEY,
    tenantKey: "",
    queryKey: [CATEGORIES_CACHE_KEY],
    data: categories,
    updatedAt: Date.now(),
    maxAgeMs: 24 * 60 * 60 * 1000,
    moduleId: "retail-pos",
  });
}

export async function getCachedCategories(): Promise<string[]> {
  try {
    const record = await getRecord<{ data: string[]; updatedAt: number }>(
      OFFLINE_DB_STORES.queryCache,
      CATEGORIES_CACHE_KEY
    );
    if (!record) return [];
    return record.data ?? [];
  } catch {
    return [];
  }
}

// ── Search ──────────────────────────────────────────────────────────────────

export interface CatalogSearchFilters {
  category?: string;
  siteId?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
}

/**
 * Search cached catalog by query string and optional filters.
 * Searches across name, SKU, and barcode fields.
 */
export async function searchCatalog(
  query: string,
  filters?: CatalogSearchFilters
): Promise<POSCatalogItem[]> {
  const catalog = await getCachedCatalog();
  if (!catalog) return [];

  const normalizedQuery = query.trim().toLowerCase();

  return catalog.filter((item) => {
    // Text search
    if (normalizedQuery) {
      const matchesName = item.name.toLowerCase().includes(normalizedQuery);
      const matchesSku = item.sku.toLowerCase().includes(normalizedQuery);
      const matchesBarcode = item.barcode?.toLowerCase().includes(normalizedQuery) ?? false;
      if (!matchesName && !matchesSku && !matchesBarcode) return false;
    }

    // Category filter
    if (filters?.category && item.category !== filters.category) return false;

    // Site filter
    if (filters?.siteId && item.siteId !== filters.siteId) return false;

    // Price range
    if (filters?.minPrice !== undefined && item.unitPrice < filters.minPrice) return false;
    if (filters?.maxPrice !== undefined && item.unitPrice > filters.maxPrice) return false;

    // Stock filter
    if (filters?.inStockOnly && (item.inventoryItem?.currentStock ?? 0) <= 0) return false;

    return true;
  });
}

/**
 * Quick barcode scan — optimized for scanner input.
 * Returns the matching product immediately or null.
 */
export async function scanBarcode(barcode: string): Promise<POSCatalogItem | null> {
  return getProductByBarcode(barcode);
}

// ── Catalog Size/Health ─────────────────────────────────────────────────────

export async function getCatalogSize(): Promise<number> {
  const catalog = await getCachedCatalog();
  return catalog?.length ?? 0;
}

export async function getCatalogCacheAge(): Promise<number | null> {
  try {
    const allRecords = await listRecords<{
      id: string;
      updatedAt: number;
      moduleId?: string;
    }>(OFFLINE_DB_STORES.queryCache);
    const catalogRecord = allRecords.find((r) => r.id === CATALOG_CACHE_KEY);
    if (!catalogRecord) return null;
    return Date.now() - (catalogRecord.updatedAt ?? 0);
  } catch {
    return null;
  }
}

export async function isCatalogStale(maxAgeMs: number = 15 * 60 * 1000): Promise<boolean> {
  const age = await getCatalogCacheAge();
  if (age === null) return true;
  return age > maxAgeMs;
}

// ── Real-time Catalog Update (background refresh) ──────────────────────────

/**
 * Incrementally update the catalog cache with new/updated items
 * without rebuilding the entire cache.
 */
export async function mergeCatalogDelta(delta: {
  updated?: POSCatalogItem[];
  removed?: string[]; // IDs to remove
}): Promise<void> {
  const existing = (await getCachedCatalog()) ?? [];

  const existingMap = new Map(existing.map((item) => [item.id, item]));

  // Apply updates
  for (const item of delta.updated ?? []) {
    existingMap.set(item.id, item);
  }

  // Apply removals
  for (const id of delta.removed ?? []) {
    existingMap.delete(id);
  }

  const merged = Array.from(existingMap.values());
  await cacheCatalog(merged);
}

/**
 * Refresh catalog from server. Returns new item count.
 */
export async function refreshCatalogFromServer(siteId: string): Promise<number> {
  const { fetchJson } = await import("@/lib/api-client");

  const response = await fetchJson<{ data: POSCatalogItem[] }>(
    `/api/v2/retail/pos/catalog?siteId=${encodeURIComponent(siteId)}`
  );

  const items = response.data ?? [];
  await cacheCatalog(items);
  return items.length;
}
