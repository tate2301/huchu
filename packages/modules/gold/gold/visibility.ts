import type { GoldTabItem } from "./tab-config";
import { hasTokenFeature } from "@corelithzw/platform/gating/token-check";

export function filterGoldTabsByFeatures(
  tabs: GoldTabItem[],
  enabledFeatures: string[] | undefined,
) {
  return tabs.filter((tab) => hasTokenFeature(enabledFeatures, tab.featureKey));
}
