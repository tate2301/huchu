import type { NavSection } from "@/lib/navigation";
import { resolveFeatureKeyForPath } from "@/lib/platform/gating/route-registry";
import { hasTokenFeature } from "@/lib/platform/gating/token-check";

function toPath(href: string): string {
  return href.split("?")[0] || href;
}

export type HrefItem = { href: string };

export function canViewHrefWithEnabledFeatures(
  href: string,
  enabledFeatures: string[] | undefined,
): boolean {
  const featureKey = resolveFeatureKeyForPath(toPath(href));
  if (!featureKey) return true;
  return hasTokenFeature(enabledFeatures, featureKey);
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
    .filter((section) =>
      section.featureKey ? hasTokenFeature(enabledFeatures, section.featureKey) : true,
    )
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
