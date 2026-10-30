import type { NavSection } from "@/lib/navigation";
import {
  resolveAlternativeFeatureKeysForPath,
  resolveFeatureKeyForPath,
} from "@/lib/platform/gating/route-registry";
import { hasTokenFeature } from "@/lib/platform/gating/token-check";

function toPath(href: string): string {
  return href.split("?")[0] || href;
}

export type HrefItem = { href: string };

export function canViewHrefWithEnabledFeatures(
  href: string,
  enabledFeatures: string[] | undefined,
): boolean {
  const path = toPath(href);
  const featureKey = resolveFeatureKeyForPath(path);
  if (!featureKey) return true;
  if (hasTokenFeature(enabledFeatures, featureKey)) return true;
  const altKeys = resolveAlternativeFeatureKeysForPath(path);
  return altKeys.some((altKey) => hasTokenFeature(enabledFeatures, altKey));
}

export function filterHrefItemsByEnabledFeatures<T extends HrefItem>(
  items: T[],
  enabledFeatures: string[] | undefined,
): T[] {
  return items.filter((item) => canViewHrefWithEnabledFeatures(item.href, enabledFeatures));
}

export function filterNavSectionsByEnabledFeatures(
  sections: NavSection[],
  enabledFeatures: string[] | undefined,
): NavSection[] {
  return sections
    .filter((section) => {
      if (!section.featureKey) return true;
      if (hasTokenFeature(enabledFeatures, section.featureKey)) return true;
      if (section.id === "stores") {
        return (
          hasTokenFeature(enabledFeatures, "stores.inventory") ||
          hasTokenFeature(enabledFeatures, "stores.dashboard") ||
          hasTokenFeature(enabledFeatures, "stores.movements")
        );
      }
      return false;
    })
    .map((section) => {
      const items = filterHrefItemsByEnabledFeatures(section.items, enabledFeatures);
      if (!section.groups) return { ...section, items };
      // A group label with nothing under it is worse than no label, so groups
      // whose every item was gated away go with them.
      const surviving = new Set(items.map((item) => item.group).filter(Boolean));
      return {
        ...section,
        items,
        groups: section.groups.filter((group) => surviving.has(group.id)),
      };
    })
    .filter((section) => section.items.length > 0);
}
