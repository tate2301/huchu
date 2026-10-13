import type { LucideIcon } from "@/lib/icons";
import type { NavGroup, NavItem } from "@/lib/navigation";
import type { RetailAction, RetailResource } from "@/lib/retail/permission-matrix";

/**
 * One retail module: a rail mark and the panel it opens (00-foundations
 * 5.3.2–5.3.4). Each module is its own file in this folder, so the unit that
 * builds a page adds its item to its module's file and nothing shared.
 */
export type RetailNavModule = {
  /** The workspace section id, `retail-<module>`. */
  id: `retail-${string}`;
  /** The module title, on the rail mark's tooltip and the panel header. */
  title: string;
  /** The rail mark. */
  icon: LucideIcon;
  /**
   * The module's own pages, in panel order. Every href is a route that
   * exists; each item's `requires` (any of) is who sees it.
   */
  items: RetailNavItem[];
  /**
   * Headed bands inside the module's own panel (Reports' Insights and
   * Areas), as `NavSection.panelGroups`. Each item names its band.
   */
  groups?: NavGroup[];
};

/**
 * A fact about the shop an item needs before it is shown at all, whoever
 * looks: `multi-site`, two or more open sites (Transfers); `liquor-empties`, a
 * liquor store with "Empties and deposits" on (Empties). Worked out on the
 * server (`navConditions`): by the root layout for the first render, then
 * sent with the badges.
 */
export type RetailNavCondition = "multi-site" | "liquor-empties";

/**
 * A retail nav item always says who sees it, and may say what the shop must
 * have. `onlyWithBadge`: drawn only while its badge counts at least one for
 * this person (a Reports area with no template they may open).
 */
export type RetailNavItem = NavItem & {
  requires: Array<[RetailResource, RetailAction]>;
  /** Pages outside its path that are still this item's (`lib/nav-match.ts`). */
  also?: RegExp;
  when?: RetailNavCondition;
  onlyWithBadge?: boolean;
};
