import { normalizeFeatureKey } from "@/lib/platform/gating/catalog-utils";

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isGlobalFeatureBypassEnabled(): boolean {
  return parseBooleanFlag(process.env.FEATURE_GATES_BYPASS);
}

export function getBypassedFeatureKeys(): Set<string> {
  const raw = process.env.FEATURE_GATES_BYPASS_KEYS;
  if (!raw) return new Set<string>();
  const values = raw
    .split(",")
    .map((entry) => normalizeFeatureKey(entry))
    .filter(Boolean);
  return new Set(values);
}

export function isFeatureBypassed(featureKey: string): boolean {
  if (isGlobalFeatureBypassEnabled()) return true;
  const normalized = normalizeFeatureKey(featureKey);
  if (!normalized) return false;
  return getBypassedFeatureKeys().has(normalized);
}
