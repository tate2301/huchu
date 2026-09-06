import { hasFeature } from "@/lib/platform/features";
import { isKnownFeatureKey, normalizeFeatureKey } from "@/lib/platform/gating/catalog-utils";
import { resolveFeatureKeyForCapability } from "@/lib/platform/gating/capability-registry";
import { isFeatureBypassed } from "@/lib/platform/gating/break-glass";
import { getFeatureDependencies } from "@/lib/platform/gating/feature-dependencies";
import { resolveFeatureKeyForPath } from "@/lib/platform/gating/route-registry";
import { isAllowByDefaultFeaturePolicy } from "@/lib/platform/gating/policy";
import type { FeatureGateDecision } from "@/lib/platform/gating/types";

export async function canAccessRouteForCompany(
  companyId: string | undefined,
  pathname: string,
): Promise<FeatureGateDecision> {
  const featureKey = resolveFeatureKeyForPath(pathname);
  if (!featureKey) return { allowed: true, path: pathname };

  const normalized = normalizeFeatureKey(featureKey);
  const allowByDefault = isAllowByDefaultFeaturePolicy();
  if (!isKnownFeatureKey(normalized)) {
    if (allowByDefault) {
      return { allowed: true, featureKey: normalized, path: pathname };
    }
    return {
      allowed: false,
      code: "UNKNOWN_FEATURE",
      message: `Unknown feature mapping: ${normalized}`,
      featureKey: normalized,
      path: pathname,
    };
  }

  if (isFeatureBypassed(normalized)) {
    return { allowed: true, featureKey: normalized, path: pathname };
  }

  if (!companyId) {
    return {
      allowed: false,
      code: "UNAUTHORIZED",
      message: "Missing tenant context",
      featureKey: normalized,
      path: pathname,
    };
  }

  const enabled = await hasFeature(companyId, normalized);
  if (enabled) {
    const dependencies = getFeatureDependencies(normalized);
    if (dependencies.length > 0) {
      for (const dependency of dependencies) {
        const dependencyEnabled = await hasFeature(companyId, dependency);
        if (!dependencyEnabled) {
          return {
            allowed: false,
            code: "FEATURE_DEPENDENCY_MISSING",
            message: `Feature ${normalized} requires ${dependency}`,
            featureKey: normalized,
            path: pathname,
          };
        }
      }
    }
    return { allowed: true, featureKey: normalized, path: pathname };
  }

  return {
    allowed: false,
    code: "FEATURE_DISABLED",
    message: `Feature disabled: ${normalized}`,
    featureKey: normalized,
    path: pathname,
  };
}

export async function canAccessCapabilityForCompany(
  capabilityId: string,
  companyId: string | undefined,
): Promise<FeatureGateDecision> {
  const featureKey = resolveFeatureKeyForCapability(capabilityId);
  if (!featureKey) {
    return {
      allowed: false,
      code: "UNKNOWN_FEATURE",
      message: `Unknown capability mapping: ${capabilityId}`,
      capabilityId,
    };
  }
  const normalized = normalizeFeatureKey(featureKey);
  const allowByDefault = isAllowByDefaultFeaturePolicy();

  if (!isKnownFeatureKey(normalized)) {
    if (allowByDefault) {
      return {
        allowed: true,
        featureKey: normalized,
        capabilityId,
      };
    }
    return {
      allowed: false,
      code: "UNKNOWN_FEATURE",
      message: `Unknown feature mapping: ${normalized}`,
      featureKey: normalized,
      capabilityId,
    };
  }

  if (isFeatureBypassed(normalized)) {
    return {
      allowed: true,
      featureKey: normalized,
      capabilityId,
    };
  }

  if (!companyId) {
    return {
      allowed: false,
      code: "UNAUTHORIZED",
      message: "Missing tenant context",
      featureKey: normalized,
      capabilityId,
    };
  }

  const enabled = await hasFeature(companyId, normalized);
  if (enabled) {
    const dependencies = getFeatureDependencies(normalized);
    if (dependencies.length > 0) {
      for (const dependency of dependencies) {
        const dependencyEnabled = await hasFeature(companyId, dependency);
        if (!dependencyEnabled) {
          return {
            allowed: false,
            code: "FEATURE_DEPENDENCY_MISSING",
            message: `Feature ${normalized} requires ${dependency}`,
            featureKey: normalized,
            capabilityId,
          };
        }
      }
    }
    return { allowed: true, featureKey: normalized, capabilityId };
  }

  return {
    allowed: false,
    code: "FEATURE_DISABLED",
    message: `Feature disabled: ${normalized}`,
    featureKey: normalized,
    capabilityId,
  };
}
