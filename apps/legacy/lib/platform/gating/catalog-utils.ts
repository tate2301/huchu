import { FEATURE_CATALOG } from "@/lib/platform/feature-catalog";

/**
 * Renamed namespaces, folded onto the key the product uses now.
 *
 * Each entry is a translation the platform carries forever, so the list should
 * only ever shrink. Five `thrift.*` entries came out when
 * `scripts/retire-thrift-feature-aliases.ts` merged the last tenant rows onto
 * their `retail.*` keys — retail was called Thrift once, and the alias outlived
 * the last row that needed it by about a year.
 *
 * The four below are still load-bearing: settlements left HR, and a
 * `CompanyFeatureFlag` row written before the split still turns the right
 * surface on. They come out the same way — merge the rows, then delete the
 * line.
 */
const FEATURE_KEY_ALIASES: Record<string, string> = {
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
