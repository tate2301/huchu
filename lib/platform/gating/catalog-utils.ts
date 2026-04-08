import { FEATURE_CATALOG } from "@/lib/platform/feature-catalog";

const FEATURE_KEY_ALIASES: Record<string, string> = {
  "thrift.core": "retail.core",
  "thrift.catalog": "retail.catalog",
  "thrift.checkout": "retail.pos",
  "thrift.intake": "retail.purchasing",
  "portal.thrift": "portal.pos",
  "hr.gold-payouts": "hr.settlements",
  "hr.payouts": "hr.settlements",
  "gold.settlements": "gold.payouts",
};

export function normalizeFeatureKey(value: string): string {
  const normalized = value.trim().toLowerCase();
  return FEATURE_KEY_ALIASES[normalized] ?? normalized;
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
