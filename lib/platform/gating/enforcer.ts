import { isKnownFeatureKey, normalizeFeatureKey } from "@/lib/platform/gating/catalog-utils";
import { resolveFeatureKeyForCapability } from "@/lib/platform/gating/capability-registry";
import { isFeatureBypassed } from "@/lib/platform/gating/break-glass";
import { resolveFeatureKeyForPath } from "@/lib/platform/gating/route-registry";
import { isAllowByDefaultFeaturePolicy } from "@/lib/platform/gating/policy";
import { getFeatureDependencies } from "@/lib/platform/gating/feature-dependencies";
import type { FeatureGateDecision } from "@/lib/platform/gating/types";

function evaluateFeature(featureKey: string, enabledFeatures: string[] | undefined): FeatureGateDecision {
  const normalized = normalizeFeatureKey(featureKey);
  const allowByDefault = isAllowByDefaultFeaturePolicy();

  if (!isKnownFeatureKey(normalized)) {
    if (allowByDefault) {
      return {
        allowed: true,
        featureKey: normalized,
      };
    }
    return {
      allowed: false,
      code: "UNKNOWN_FEATURE",
      message: `Unknown feature mapping: ${normalized}`,
      featureKey: normalized,
    };
  }

  if (isFeatureBypassed(normalized)) {
    return {
      allowed: true,
      featureKey: normalized,
    };
  }

  const normalizedEnabledSource = enabledFeatures ?? [];
  if (normalizedEnabledSource.length === 0 && allowByDefault) {
    return {
      allowed: true,
      featureKey: normalized,
    };
  }

  const normalizedEnabled = new Set(
    normalizedEnabledSource.map((entry) => normalizeFeatureKey(entry)),
  );
  if (normalizedEnabled.has(normalized)) {
    const dependencies = getFeatureDependencies(normalized);
    if (dependencies.length > 0) {
      const missing = dependencies.filter((dep) => !normalizedEnabled.has(dep));
      if (missing.length > 0) {
        return {
          allowed: false,
          code: "FEATURE_DEPENDENCY_MISSING",
          message: `Feature ${normalized} requires ${missing.join(", ")}`,
          featureKey: normalized,
        };
      }
    }
    return {
      allowed: true,
      featureKey: normalized,
    };
  }

  return {
    allowed: false,
    code: "FEATURE_DISABLED",
    message: `Feature disabled: ${normalized}`,
    featureKey: normalized,
  };
}

export function hasEnabledFeature(enabledFeatures: string[] | undefined, featureKey: string): boolean {
  return evaluateFeature(featureKey, enabledFeatures).allowed;
}

export function canAccessRouteWithToken(pathname: string, enabledFeatures: string[] | undefined): FeatureGateDecision {
  const featureKey = resolveFeatureKeyForPath(pathname);
  if (!featureKey) return { allowed: true, path: pathname };
  const decision = evaluateFeature(featureKey, enabledFeatures);
  return { ...decision, path: pathname };
}

export function canAccessCapabilityWithToken(
  capabilityId: string,
  enabledFeatures: string[] | undefined,
): FeatureGateDecision {
  const featureKey = resolveFeatureKeyForCapability(capabilityId);
  if (!featureKey) {
    return {
      allowed: false,
      code: "UNKNOWN_FEATURE",
      message: `Unknown capability mapping: ${capabilityId}`,
      capabilityId,
    };
  }
  const decision = evaluateFeature(featureKey, enabledFeatures);
  return {
    ...decision,
    capabilityId,
  };
}
