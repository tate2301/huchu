export interface FeatureRouteEntry {
  prefix: string;
  featureKey: string;
  scope: "page" | "api";
}

export interface FeatureCapabilityEntry {
  id: string;
  featureKey: string;
  description: string;
}

export interface FeatureGateDecision {
  allowed: boolean;
  code?: "FEATURE_DISABLED" | "UNKNOWN_FEATURE" | "UNAUTHORIZED";
  message?: string;
  featureKey?: string;
  path?: string;
  capabilityId?: string;
}
