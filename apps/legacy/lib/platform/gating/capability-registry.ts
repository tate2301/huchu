import type { FeatureCapabilityEntry } from "@/lib/platform/gating/types";

export const FEATURE_CAPABILITIES: FeatureCapabilityEntry[] = [
  {
    id: "core.multitenancy.host-enforcement",
    featureKey: "core.multitenancy.tenant-host-enforcement",
    description: "Tenant host redirect and host mismatch blocking.",
  },
  {
    id: "platform.console.feature-flags",
    featureKey: "admin.feature-flags-console",
    description: "Platform feature flags administration console.",
  },
  {
    id: "platform.console.subscription",
    featureKey: "admin.subscription-console",
    description: "Platform subscription administration console.",
  },
  {
    id: "notification.center.widget",
    featureKey: "core.notifications.center",
    description: "Notification center widget visibility in navbar.",
  },
  {
    id: "notification.center.stream",
    featureKey: "core.notifications.center",
    description: "Notification center stream/polling capability.",
  },
  {
    id: "notification.push.subscription",
    featureKey: "core.notifications.push",
    description: "Web push subscription lifecycle.",
  },
];

export function resolveFeatureKeyForCapability(capabilityId: string): string | null {
  const id = capabilityId.trim().toLowerCase();
  if (!id) return null;
  return FEATURE_CAPABILITIES.find((entry) => entry.id.toLowerCase() === id)?.featureKey ?? null;
}

export function getAllCapabilityFeatureKeys(): string[] {
  return Array.from(new Set(FEATURE_CAPABILITIES.map((row) => row.featureKey))).sort();
}
