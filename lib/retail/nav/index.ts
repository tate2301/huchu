import { bestNavHref, type QueryLike } from "@/lib/nav-match";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { isCountPhonePath } from "@/lib/retail/stock/count-paths";

import { buyingNav } from "./buying";
import { floorNav } from "./floor";
import { insightsNav } from "./insights";
import { setupNav } from "./setup";
import { productsNav } from "./products";
import { reportsNav } from "./reports";
import { stockNav } from "./stock";
import type { RetailNavCondition, RetailNavItem, RetailNavModule } from "./types";

export type { RetailNavCondition, RetailNavItem, RetailNavModule } from "./types";

/**
 * The items not drawn: those whose shop condition does not hold (hidden from
 * everyone), and those that wait on a badge this person does not have (a
 * Reports area with no template for them). Neither yet known counts as not
 * holding, so an item never shows and then vanishes.
 */
export function hiddenRetailNavHrefs(
  conditions: Partial<Record<RetailNavCondition, boolean>> | null,
  badges: Readonly<Record<string, string>> | null = null,
): Set<string> {
  return new Set(
    RETAIL_NAV_ITEMS.filter(
      (item) => (item.when && !conditions?.[item.when]) || (item.onlyWithBadge && !badges?.[item.href]),
    ).map((item) => item.href),
  );
}

/**
 * The retail modules in rail order (00-foundations 5.3.4). An area unit adds
 * its pages to its module's file; a new module is one file and one line here.
 */
export const RETAIL_NAV_MODULES: RetailNavModule[] = [
  floorNav,
  productsNav,
  stockNav,
  buyingNav,
  insightsNav,
  reportsNav,
  setupNav,
];

/** Every retail page in the nav, whoever may see it. */
export const RETAIL_NAV_ITEMS: RetailNavItem[] = RETAIL_NAV_MODULES.flatMap((module) => module.items);

const ITEM_BY_HREF = new Map(RETAIL_NAV_ITEMS.map((item) => [item.href, item]));

/** The nav item a retail page belongs to, whoever may see it, or null. */
export function retailNavItemForPath(pathname: string, query: QueryLike | null): RetailNavItem | null {
  const href = bestNavHref(RETAIL_NAV_ITEMS, pathname, query);
  return href ? (ITEM_BY_HREF.get(href) ?? null) : null;
}

/** Whether a role holds any of an item's grants. */
export function roleMeetsRetailRequires(
  role: string | null | undefined,
  requires: RetailNavItem["requires"],
): boolean {
  return requires.some(([resource, action]) => canRetailRoleDo(role, resource, action));
}

/**
 * Whether this role may open the retail page at `pathname`: the same grants
 * that show its nav item (a record page inherits its list's). Paths with no
 * item answer true; their own server decides. So does the phone count, the
 * counter's page whatever their role.
 */
export function canRoleOpenRetailPath(
  role: string | null | undefined,
  pathname: string,
  query: QueryLike | null,
): boolean {
  if (isCountPhonePath(pathname)) return true;
  const item = retailNavItemForPath(pathname, query);
  return !item || roleMeetsRetailRequires(role, item.requires);
}
