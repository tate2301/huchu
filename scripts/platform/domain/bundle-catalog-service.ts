import { getBundleDefinition } from "../../../lib/platform/feature-catalog";
import type { BundleCatalogSummary, UpsertBundleCatalogInput, SetBundleFeaturesInput } from "../types";

/**
 * Get all feature keys for given bundle codes
 */
export async function getBundleFeatureKeysByCodes(bundleCodes: string[]): Promise<string[]> {
  const features: string[] = [];
  for (const code of bundleCodes) {
    const bundle = getBundleDefinition(code);
    if (bundle?.features) {
      features.push(...bundle.features);
    }
  }
  return features;
}

/**
 * List bundle catalog (stub)
 */
export async function listBundleCatalog(): Promise<BundleCatalogSummary[]> {
  return [];
}

/**
 * Set bundle features (stub)
 */
export async function setBundleFeatures(input: SetBundleFeaturesInput): Promise<BundleCatalogSummary> {
  const bundle = getBundleDefinition(input.bundleCode);
  return {
    code: input.bundleCode,
    name: bundle?.name ?? input.bundleCode,
    description: bundle?.description ?? null,
    monthlyPrice: bundle?.monthlyPrice ?? 0,
    additionalSiteMonthlyPrice: bundle?.additionalSiteMonthlyPrice ?? 0,
    isActive: true,
    featureKeys: input.featureKeys,
    source: "SYSTEM" as const,
  };
}

/**
 * Upsert bundle catalog (stub)
 */
export async function upsertBundleCatalog(input: UpsertBundleCatalogInput): Promise<BundleCatalogSummary> {
  const bundle = getBundleDefinition(input.code);
  return {
    code: input.code,
    name: input.name ?? bundle?.name ?? input.code,
    description: input.description ?? bundle?.description ?? null,
    monthlyPrice: input.monthlyPrice ?? bundle?.monthlyPrice ?? 0,
    additionalSiteMonthlyPrice: input.additionalSiteMonthlyPrice ?? bundle?.additionalSiteMonthlyPrice ?? 0,
    isActive: input.isActive ?? true,
    featureKeys: bundle?.features ?? [],
    source: "SYSTEM" as const,
  };
}
