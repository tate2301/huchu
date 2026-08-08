import { FEATURE_CATALOG } from "@/lib/platform/feature-catalog";

const FEATURE_KEY_ALIASES: Record<string, string> = {
  "thrift.core": "retail.core",
  "thrift.catalog": "retail.catalog",
  "thrift.checkout": "retail.pos",
  "thrift.intake": "retail.purchasing",
  "portal.thrift": "portal.pos",
  // Settlements left HR. These three all resolve to the settlement module's key
  // now, so a CompanyFeatureFlag row written before the split still turns the
  // right surface on.
  "hr.gold-payouts": "settlements.gold",
  "hr.payouts": "settlements.core",
  "hr.settlements": "settlements.core",
  "gold.settlements": "settlements.gold",
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
