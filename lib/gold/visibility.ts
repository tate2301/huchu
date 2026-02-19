import type { GoldTabItem } from "@/lib/gold/tab-config";
import { hasTokenFeature } from "@/lib/platform/gating/token-check";

export function filterGoldTabsByFeatures(
  tabs: GoldTabItem[],
  enabledFeatures: string[] | undefined,
) {
  return tabs.filter((tab) => hasTokenFeature(enabledFeatures, tab.featureKey));
}
