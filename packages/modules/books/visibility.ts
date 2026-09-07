import type { AccountingTabItem } from "./tab-config";
import { hasTokenFeature } from "@corelithzw/platform/gating/token-check";
import { resolveFeatureKeyForPath } from "@corelithzw/platform/gating/route-registry";

function normalizePath(href: string) {
  return href.split("?")[0] || href;
}

export function canViewAccountingHref(
  href: string,
  enabledFeatures: string[] | undefined,
) {
  const featureKey = resolveFeatureKeyForPath(normalizePath(href));
  if (!featureKey) return true;
  return hasTokenFeature(enabledFeatures, featureKey);
}

export function filterAccountingTabsByFeatures(
  tabs: AccountingTabItem[],
  enabledFeatures: string[] | undefined,
) {
  return tabs.filter((tab) => canViewAccountingHref(tab.href, enabledFeatures));
}
