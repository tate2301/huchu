/**
 * Offline Materials & Pricing Cache
 *
 * Caches the scrap materials catalog with pricing data.
 * Provides search, lookup, and staleness detection.
 * Pricing shows warning if > 24 hours old.
 */

import { OFFLINE_DB_STORES, getOfflineRecord, listOfflineRecords, putOfflineRecord } from "@/lib/offline/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrapMaterial {
  id: string;
  name: string;
  category: string;
  grade?: string | null;
  basePrice: number;
  unit: string; // "kg", "lb", "ton", etc.
  code?: string;
  description?: string;
  isActive: boolean;
}

export interface ScrapMaterialPricing {
  materialId: string;
  pricePerKg: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  updatedAt: string;
  updatedBy?: string;
}

export interface CachedMaterialsBundle {
  materials: ScrapMaterial[];
  pricing: ScrapMaterialPricing[];
  fetchedAt: string;
  version: number;
}

export type PricingStaleness = "fresh" | "stale" | "very-stale" | "unknown";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MATERIALS_CACHE_KEY = "scrap:materials:catalog";
const PRICING_CACHE_KEY = "scrap:materials:pricing";
const MATERIALS_CACHE_VERSION = 1;
const PRICING_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const PRICING_VERY_STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PRICING_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes (online refresh)

// ---------------------------------------------------------------------------
// Material cache operations
// ---------------------------------------------------------------------------

/**
 * Bulk cache materials with pricing data.
 * Called during Phase 2 bootstrap.
 */
export async function cacheMaterials(
  materials: ScrapMaterial[],
  pricing?: ScrapMaterialPricing[],
): Promise<void> {
  const bundle: CachedMaterialsBundle = {
    materials,
    pricing: pricing ?? [],
    fetchedAt: new Date().toISOString(),
    version: MATERIALS_CACHE_VERSION,
  };

  await putOfflineRecord(OFFLINE_DB_STORES.queryCache, {
    id: MATERIALS_CACHE_KEY,
    tenantKey: "",
    queryKey: ["scrap-materials-catalog"],
    data: bundle,
    updatedAt: Date.now(),
    maxAgeMs: 24 * 60 * 60 * 1000,
    moduleId: "scrap-metal",
  });

  // Also cache pricing separately for quick lookup
  if (pricing && pricing.length > 0) {
    await putOfflineRecord(OFFLINE_DB_STORES.queryCache, {
      id: PRICING_CACHE_KEY,
      tenantKey: "",
      queryKey: ["scrap-materials-pricing"],
      data: {
        pricing,
        fetchedAt: new Date().toISOString(),
      },
      updatedAt: Date.now(),
      maxAgeMs: PRICING_STALE_THRESHOLD_MS,
      moduleId: "scrap-metal",
    });
  }
}

/**
 * Get all cached materials.
 */
export async function getMaterials(): Promise<ScrapMaterial[]> {
  const bundle = await getMaterialsBundle();
  return bundle?.materials ?? [];
}

/**
 * Get a single material by ID.
 */
export async function getMaterialById(id: string): Promise<ScrapMaterial | null> {
  const materials = await getMaterials();
  return materials.find((m) => m.id === id) ?? null;
}

/**
 * Search materials by name or category.
 */
export async function searchMaterials(query: string): Promise<ScrapMaterial[]> {
  const materials = await getMaterials();
  if (!query.trim()) return materials.filter((m) => m.isActive !== false);

  const normalized = query.trim().toLowerCase();
  return materials.filter((material) => {
    if (material.isActive === false) return false;
    return (
      material.name.toLowerCase().includes(normalized) ||
      material.category.toLowerCase().includes(normalized) ||
      (material.code && material.code.toLowerCase().includes(normalized)) ||
      (material.grade && material.grade.toLowerCase().includes(normalized))
    );
  });
}

/**
 * Get materials filtered by category.
 */
export async function getMaterialsByCategory(category: string): Promise<ScrapMaterial[]> {
  const materials = await getMaterials();
  return materials.filter(
    (m) => m.category.toLowerCase() === category.toLowerCase() && m.isActive !== false,
  );
}

/**
 * Get all unique material categories.
 */
export async function getMaterialCategories(): Promise<string[]> {
  const materials = await getMaterials();
  const categories = new Set(materials.map((m) => m.category));
  return Array.from(categories).sort();
}

// ---------------------------------------------------------------------------
// Pricing operations
// ---------------------------------------------------------------------------

/**
 * Get cached pricing for a specific material.
 * Optionally filter by grade.
 */
export async function getPricing(
  materialId: string,
  grade?: string,
): Promise<ScrapMaterialPricing | null> {
  const pricing = await getAllPricing();
  const match = pricing.find((p) => {
    if (p.materialId !== materialId) return false;
    if (grade && p.materialId !== grade) return false; // grade matching if needed
    return true;
  });
  return match ?? null;
}

/**
 * Get all cached pricing entries.
 */
export async function getAllPricing(): Promise<ScrapMaterialPricing[]> {
  const record = await getOfflineRecord<{
    data: { pricing: ScrapMaterialPricing[]; fetchedAt: string };
  }>(OFFLINE_DB_STORES.queryCache, PRICING_CACHE_KEY);

  return record?.data?.pricing ?? [];
}

/**
 * Get the price per kg for a material.
 * Returns 0 if no pricing is cached.
 */
export async function getPricePerKg(materialId: string): Promise<number> {
  const pricing = await getPricing(materialId);
  return pricing?.pricePerKg ?? 0;
}

/**
 * Calculate total value from weight and material.
 */
export async function calculateMaterialValue(
  materialId: string,
  weightKg: number,
): Promise<{ total: number; pricePerKg: number; currency: string }> {
  const pricing = await getPricing(materialId);
  const pricePerKg = pricing?.pricePerKg ?? 0;
  const currency = pricing?.currency ?? "USD";
  return {
    total: weightKg * pricePerKg,
    pricePerKg,
    currency,
  };
}

// ---------------------------------------------------------------------------
// Pricing staleness
// ---------------------------------------------------------------------------

/**
 * Get the staleness status of the pricing data.
 * Shows warning if > 24 hours old.
 */
export async function getPricingStaleness(): Promise<{
  status: PricingStaleness;
  label: string;
  ageMs: number;
  fetchedAt: string | null;
}> {
  const record = await getOfflineRecord<{
    data: { pricing: ScrapMaterialPricing[]; fetchedAt: string };
    updatedAt: number;
    maxAgeMs: number;
  }>(OFFLINE_DB_STORES.queryCache, PRICING_CACHE_KEY);

  if (!record?.data) {
    return {
      status: "unknown",
      label: "No price data available offline",
      ageMs: Infinity,
      fetchedAt: null,
    };
  }

  const ageMs = Date.now() - record.updatedAt;

  if (ageMs < PRICING_REFRESH_INTERVAL_MS) {
    return {
      status: "fresh",
      label: "Price updated just now",
      ageMs,
      fetchedAt: record.data.fetchedAt,
    };
  }

  if (ageMs < PRICING_STALE_THRESHOLD_MS) {
    const minutes = Math.floor(ageMs / (60 * 1000));
    return {
      status: "stale",
      label: `Price last updated ${minutes} min ago`,
      ageMs,
      fetchedAt: record.data.fetchedAt,
    };
  }

  const hours = Math.floor(ageMs / (60 * 60 * 1000));
  return {
    status: "very-stale",
    label: `Price last updated ${hours}h ago — may be outdated`,
    ageMs,
    fetchedAt: record.data.fetchedAt,
  };
}

/**
 * Check if pricing data is older than the staleness threshold (> 24h).
 */
export async function isPricingStale(): Promise<boolean> {
  const staleness = await getPricingStaleness();
  return staleness.status === "very-stale";
}

/**
 * Get the recommended refresh interval for pricing data.
 * Scrap prices should refresh every 5 minutes when online.
 */
export function getPricingRefreshIntervalMs(): number {
  return PRICING_REFRESH_INTERVAL_MS;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function getMaterialsBundle(): Promise<CachedMaterialsBundle | null> {
  const record = await getOfflineRecord<{
    data: CachedMaterialsBundle;
  }>(OFFLINE_DB_STORES.queryCache, MATERIALS_CACHE_KEY);

  return record?.data ?? null;
}
