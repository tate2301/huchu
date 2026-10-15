import { VANE_NAV_ITEMS, type NavItem } from "@/lib/navigation";

/**
 * Vane's own pages (the tree board, `/vane`): a module of its own in every
 * workspace (`VANE_NAV_ITEMS`), its mark among the rail's modules; while one
 * of these pages is open the module panel lists them.
 */
export const VANE_PAGES: NavItem[] = VANE_NAV_ITEMS;

export function isVanePath(pathname: string): boolean {
  return pathname === "/vane" || pathname.startsWith("/vane/");
}

/** The page of Vane's a path is on: For you only at `/vane` itself, the others with what is under them. */
export function vanePageFor(pathname: string): string | null {
  if (pathname === "/vane") return "/vane";
  return VANE_PAGES.find((page) => !page.exact && (pathname === page.href || pathname.startsWith(`${page.href}/`)))?.href ?? null;
}
