import { getWorkspaceOptions, getWorkspaceSidebarModel } from "@/lib/workspaces";

import type { NavGroupId } from "./registry";

type Who = {
  role: string | null | undefined;
  enabledFeatures: string[] | undefined;
  workspaceProfile: string | null | undefined;
};

const pathOf = (href: string) => href.split("?")[0] ?? href;

/**
 * Every address this person may open, as the sidebar they have today draws it.
 *
 * The existing model already asks every check there is (the feature for the
 * route, the role's route limits, retail grants, campus grants, Books'
 * visibility), so the new sidebar asks it rather than keeping a second copy
 * that could drift. Taken across every workspace the tenant has, because the
 * new sidebar does not split by product. This is the bridge until the checks
 * move out of `getWorkspaceSidebarModel` (BUILD.md, phase 10).
 */
export function visibleAddresses(who: Who): Set<string> {
  const seen = new Set<string>();
  for (const workspace of getWorkspaceOptions(who)) {
    const model = getWorkspaceSidebarModel({ ...who, activeWorkspaceId: workspace.id });
    for (const section of model.sections) {
      for (const item of section.items) seen.add(item.href);
    }
  }
  return seen;
}

/** The price each locked page shows, by address: Books' pages the workspace's plan does not include. */
export function lockedAddresses(who: Who): Map<string, string> {
  const locks = new Map<string, string>();
  for (const workspace of getWorkspaceOptions(who)) {
    const model = getWorkspaceSidebarModel({ ...who, activeWorkspaceId: workspace.id });
    for (const section of model.sections) {
      for (const item of section.items) if (item.lock) locks.set(pathOf(item.href), item.lock);
    }
  }
  return locks;
}

/** `canOpen` for `composeNav`: a page with a query is open when its path is. */
export function canOpenFor(who: Who): (href: string) => boolean {
  const open = visibleAddresses(who);
  const paths = new Set([...open].map(pathOf));
  return (href) => open.has(href) || paths.has(pathOf(href));
}

const PRODUCT_PREFIXES: Array<[NavGroupId, string[]]> = [
  ["tender", ["/retail"]],
  ["crm", ["/crm"]],
  ["campus", ["/schools"]],
  ["huchu", ["/gold", "/maintenance"]],
];

/**
 * The product groups this person's workspace runs, the tenant's own first.
 * `profile` is the stored workspace profile (SCHOOLS, GOLD_MINE, RETAIL, ...).
 */
export function productGroupsFor(open: Set<string>, profile: string | null | undefined): NavGroupId[] {
  const own: Record<string, NavGroupId> = { SCHOOLS: "campus", GOLD_MINE: "huchu", RETAIL: "tender" };
  const running = PRODUCT_PREFIXES.filter(([, prefixes]) =>
    [...open].some((href) => prefixes.some((prefix) => pathOf(href) === prefix || pathOf(href).startsWith(`${prefix}/`))),
  ).map(([id]) => id);
  const first = own[String(profile ?? "").toUpperCase()];
  return first && running.includes(first) ? [first, ...running.filter((id) => id !== first)] : running;
}
