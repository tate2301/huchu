import type { LucideIcon } from "@/lib/icons";
import type { NavItem } from "@/lib/navigation";
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
   * Destinations another workspace module owns, listed in this panel after
   * the module's own (Reports, until `/retail/reports` exists).
   */
  borrowed?: Array<{
    moduleId: "reporting";
    href: string;
    requires: Array<[RetailResource, RetailAction]>;
  }>;
};

/** A retail nav item always says who sees it. */
export type RetailNavItem = NavItem & { requires: Array<[RetailResource, RetailAction]> };
