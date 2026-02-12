import type { NavSection } from "@/lib/navigation";
import { resolveFeatureKeyForPath } from "@/lib/platform/gating/route-registry";
import { hasTokenFeature } from "@/lib/platform/gating/token-check";

function toPath(href: string): string {
  return href.split("?")[0] || href;
}

export function filterNavSectionsByEnabledFeatures(
  sections: NavSection[],
  enabledFeatures: string[] | undefined,
): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const featureKey = resolveFeatureKeyForPath(toPath(item.href));
        if (!featureKey) return true;
        return hasTokenFeature(enabledFeatures, featureKey);
      }),
    }))
    .filter((section) => section.items.length > 0);
}
