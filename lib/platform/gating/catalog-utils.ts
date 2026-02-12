import { FEATURE_CATALOG } from "@/lib/platform/feature-catalog";

export function normalizeFeatureKey(value: string): string {
  return value.trim().toLowerCase();
}

export function getCatalogFeatureKeys(): string[] {
  return FEATURE_CATALOG.map((feature) => normalizeFeatureKey(feature.key));
}

export function isKnownFeatureKey(featureKey: string): boolean {
  const target = normalizeFeatureKey(featureKey);
  if (!target) return false;
  return getCatalogFeatureKeys().includes(target);
}

export function assertKnownFeatureKey(featureKey: string): void {
  if (!isKnownFeatureKey(featureKey)) {
    throw new Error(`Unknown feature key: ${featureKey}`);
  }
}
