import { getCompanyFeatureMap, type FeatureMap } from "@/lib/platform/entitlements";

function normalizeFeatureKey(value: string): string {
  return value.trim().toLowerCase();
}

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
  return map[normalizedFeatureKey] === true;
}
