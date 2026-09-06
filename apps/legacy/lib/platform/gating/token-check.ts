import {
  canAccessCapabilityWithToken as evaluateCapabilityWithToken,
  hasEnabledFeature,
} from "@/lib/platform/gating/enforcer";

export function hasTokenFeature(enabledFeatures: string[] | undefined, featureKey: string): boolean {
  return hasEnabledFeature(enabledFeatures, featureKey);
}

export function canAccessCapabilityWithToken(
  capabilityId: string,
  enabledFeatures: string[] | undefined,
): { allowed: boolean; featureKey: string | null } {
  const decision = evaluateCapabilityWithToken(capabilityId, enabledFeatures);
  return {
    allowed: decision.allowed,
    featureKey: decision.featureKey ?? null,
  };
}
