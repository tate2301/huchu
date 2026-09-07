import {
  canViewHrefWithEnabledFeatures,
  filterHrefItemsByEnabledFeatures,
} from "@corelithzw/platform/gating/nav-filter";
import { registry } from "@corelithzw/platform/registry";
import type { LucideIcon } from "@corelithzw/ui/lib/icons";

/**
 * The Management area — branding, master data, compliance, users, templates —
 * as the host declares it and the management chrome reads it. Registered on
 * every side from the host's `manifests.ts`; a module that owns a master-data
 * set carries its entry in its manifest once the manifests carry navigation.
 */
export type ManagementArea = string;

export type ManagementNavItem = {
  id: string;
  label: string;
  href: string;
  icon?: LucideIcon;
  description?: string;
};

export type ManagementModuleItem = ManagementNavItem & {
  matchPrefixes: string[];
};

export type ManagementNavigation = {
  modules: readonly ManagementModuleItem[];
  areas: Readonly<Record<ManagementArea, readonly ManagementNavItem[]>>;
  labels: Readonly<Record<ManagementArea, string>>;
};

const nav = registry<{ current: ManagementNavigation }>("shell.management", () => ({
  current: { modules: [], areas: {}, labels: {} },
}));

export function registerManagementNavigation(next: ManagementNavigation): void {
  nav.current = next;
}

export function getAreaNavItems(area: ManagementArea): ManagementNavItem[] {
  return [...(nav.current.areas[area] ?? [])];
}

export function getVisibleManagementAreaNavItems(
  area: ManagementArea,
  enabledFeatures: string[] | undefined,
): ManagementNavItem[] {
  return filterHrefItemsByEnabledFeatures(getAreaNavItems(area), enabledFeatures);
}

export function getVisibleManagementModuleItems(
  enabledFeatures: string[] | undefined,
): ManagementModuleItem[] {
  return nav.current.modules.flatMap((item) => {
    if (item.id !== "master-data") {
      return canViewHrefWithEnabledFeatures(item.href, enabledFeatures) ? [item] : [];
    }

    const visibleMasterDataItems = getVisibleManagementAreaNavItems("master-data", enabledFeatures);
    if (visibleMasterDataItems.length === 0) {
      return [];
    }

    return [
      {
        ...item,
        href: visibleMasterDataItems[0].href,
      },
    ];
  });
}

export function getAreaLabel(area: ManagementArea): string {
  return nav.current.labels[area] ?? area;
}

export function isPathMatchingPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isActiveHref(pathname: string, href: string): boolean {
  const path = href.split("?")[0] || href;
  return pathname === path || pathname.startsWith(`${path}/`);
}
