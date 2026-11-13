import { registeredExtensions } from "@/extensions";
import { isRouteAllowedForRole } from "@/lib/auth-core/role-routes";
import { extensionNavAddresses, extensionNavGroups } from "@/lib/extensions/registry";
import { canAccessRouteWithToken } from "@/lib/platform/gating/enforcer";
import { resolveFeatureKeyForPath } from "@/lib/platform/gating/route-registry";
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
  for (const href of extensionNavAddresses(registeredExtensions)) {
    if (extensionAddressOpens(who, href)) seen.add(href);
  }
  return seen;
}

/**
 * An extension's row shows when the proxy would let this person in: the
 * address is gated on a feature (an ungated address never shows), the
 * workspace has it with its dependencies, and the role may reach it.
 */
function extensionAddressOpens(who: Who, href: string): boolean {
  const path = pathOf(href);
  if (!resolveFeatureKeyForPath(path)) return false;
  return canAccessRouteWithToken(path, who.enabledFeatures).allowed && isRouteAllowedForRole(who.role, path);
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
  ...extensionNavGroups(registeredExtensions).map(({ id, prefix }): [NavGroupId, string[]] => [id, [prefix]]),
];

/**
 * The product groups this person's workspace runs, the tenant's own first.
 * `profile` is the stored workspace profile (SCHOOLS, GOLD_MINE, RETAIL, ...).
 * A registered extension's group is the tenant's own when no core profile
 * claims the workspace: a fork cell runs its vertical on a GENERAL profile.
 */
export function productGroupsFor(open: Set<string>, profile: string | null | undefined): NavGroupId[] {
  const own: Record<string, NavGroupId> = { SCHOOLS: "campus", GOLD_MINE: "huchu", RETAIL: "tender" };
  const running = PRODUCT_PREFIXES.filter(([, prefixes]) =>
    [...open].some((href) => prefixes.some((prefix) => pathOf(href) === prefix || pathOf(href).startsWith(`${prefix}/`))),
  ).map(([id]) => id);
  const first = own[String(profile ?? "").toUpperCase()] ?? running.find((id) => id.startsWith("ext."));
  return first && running.includes(first) ? [first, ...running.filter((id) => id !== first)] : running;
}
