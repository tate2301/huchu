import { Bell, Check, CircleDottedLine, ListBullets, PushPin } from "@/lib/icons";
import type { NavItem } from "@/lib/navigation";

/**
 * Vane's own pages (the tree board, `/vane`). Vane is in every workspace and
 * in none of their sections: its mark sits at the foot of the rail, above
 * the gear, and while one of these pages is open the module panel lists them.
 */
export const VANE_PAGES: NavItem[] = [
  { href: "/vane", label: "For you", icon: PushPin, exact: true },
  { href: "/vane/working", label: "Working on", icon: CircleDottedLine },
  { href: "/vane/plans", label: "Plans", icon: ListBullets },
  { href: "/vane/done", label: "Done", icon: Check },
  { href: "/vane/muted", label: "Muted", icon: Bell },
];

export function isVanePath(pathname: string): boolean {
  return pathname === "/vane" || pathname.startsWith("/vane/");
}

/** The page of Vane's a path is on: For you only at `/vane` itself, the others with what is under them. */
export function vanePageFor(pathname: string): string | null {
  if (pathname === "/vane") return "/vane";
  return VANE_PAGES.find((page) => !page.exact && (pathname === page.href || pathname.startsWith(`${page.href}/`)))?.href ?? null;
}
