import { getCompanyFeatureMap, type FeatureMap } from "@/lib/platform/entitlements";
import { FEATURE_CATALOG } from "@/lib/platform/feature-catalog";

function normalizeFeatureKey(value: string): string {
  return value.trim().toLowerCase();
}

const FEATURE_DEFAULT_MAP = new Map(
  FEATURE_CATALOG.map((feature) => [normalizeFeatureKey(feature.key), feature.defaultEnabled === true]),
);

export async function getFeatureMap(companyId: string): Promise<FeatureMap> {
  try {
    return await getCompanyFeatureMap(companyId);
  } catch {
    return {};
  }
}

export async function hasFeature(companyId: string, featureKey: string): Promise<boolean> {
  const normalizedFeatureKey = normalizeFeatureKey(featureKey);
  if (!normalizedFeatureKey) return false;

  const map = await getFeatureMap(companyId);
  if (Object.prototype.hasOwnProperty.call(map, normalizedFeatureKey)) {
    return map[normalizedFeatureKey] === true;
  }

  const catalogDefault = FEATURE_DEFAULT_MAP.get(normalizedFeatureKey);
  return catalogDefault === true;
}
