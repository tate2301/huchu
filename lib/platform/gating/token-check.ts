import { resolveFeatureKeyForCapability } from "@/lib/platform/gating/capability-registry";

function normalizeFeatureKey(value: string): string {
  return value.trim().toLowerCase();
}

export function hasTokenFeature(enabledFeatures: string[] | undefined, featureKey: string): boolean {
  const target = normalizeFeatureKey(featureKey);
  if (!target || !enabledFeatures?.length) return false;
  return enabledFeatures.map((entry) => normalizeFeatureKey(entry)).includes(target);
}

export function canAccessCapabilityWithToken(
  capabilityId: string,
  enabledFeatures: string[] | undefined,
): { allowed: boolean; featureKey: string | null } {
  const featureKey = resolveFeatureKeyForCapability(capabilityId);
  if (!featureKey) {
    return { allowed: false, featureKey: null };
  }
  return {
    allowed: hasTokenFeature(enabledFeatures, featureKey),
    featureKey,
  };
}
