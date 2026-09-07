import { hasRole, type UserRole } from "@corelithzw/platform/roles";
import { registry } from "@corelithzw/platform/registry";
import type { LucideIcon } from "@corelithzw/ui/lib/icons";

/**
 * The navigation model, as the hosts declare it and the chrome reads it.
 *
 * A host registers its sections at boot on every side (`manifests.ts`), so a
 * module shell in the browser and the sidebar on the server read the same
 * list. The shape is the hosts' `NavSection`; it becomes manifest data as the
 * modules carry their own navigation.
 */
export type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: UserRole[];
  group?: string;
};

export type NavigationGroup = { id: string; label: string };

/** The hosts' names for the same shapes. */
export type NavItem = NavigationItem;
export type NavGroup = NavigationGroup;
export type NavSection = NavigationSection;

export type NavigationSection = {
  id: string;
  title: string;
  description?: string;
  featureKey?: string;
  groups?: NavigationGroup[];
  flattenGroups?: boolean;
  items: NavigationItem[];
};

const sections = registry<{ current: readonly NavigationSection[] }>("shell.navigation", () => ({ current: [] }));

export function registerNavigationSections(next: readonly NavigationSection[]): void {
  sections.current = next;
}

export function navigationSections(): readonly NavigationSection[] {
  return sections.current;
}

/** The sections this role may see, each with only the items it may see. */
export function navigationSectionsForRole(role: string | null | undefined): NavigationSection[] {
  return sections.current
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => (item.roles ? hasRole(role, item.roles) : true)),
    }))
    .filter((section) => section.items.length > 0);
}
