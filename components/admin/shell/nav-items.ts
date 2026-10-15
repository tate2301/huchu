import type { OperatorRole } from "@prisma/client";

import { Buildings, GearSix, Badge as IdentificationBadge, BookOpen, MapPin, Receipt, Scroll, SquaresFour, Stack, ToggleRight, Tray, Users, type LucideIcon } from "@/lib/icons";

export type AdminContext =
  | { kind: "all" }
  | {
      kind: "workspace";
      slug: string;
      name: string;
    };

export type AdminNavItem = { href: string; label: string; short?: string; icon: LucideIcon; exact?: boolean };

/**
 * Each context's pages, and only those. The sidebar and the phone's tab bar
 * both read this, so the two cannot list different pages.
 */
export function adminNavItems(context: AdminContext, role: OperatorRole): AdminNavItem[] {
  if (context.kind === "workspace") {
    const base = `/admin/w/${context.slug}`;
    return [
      { href: base, label: "Overview", icon: SquaresFour, exact: true },
      { href: `${base}/members`, label: "Members", icon: Users },
      { href: `${base}/features`, label: "Verticals and features", short: "Features", icon: ToggleRight },
      { href: `${base}/sites`, label: "Sites", icon: MapPin },
      { href: `${base}/billing`, label: "Billing", icon: Receipt },
      { href: `${base}/audit`, label: "Audit log", short: "Audit", icon: Scroll },
      { href: `${base}/settings`, label: "Settings", icon: GearSix },
    ];
  }
  return [
    { href: "/admin", label: "Home", icon: Tray, exact: true },
    { href: "/admin/workspaces", label: "Workspaces", icon: Buildings },
    { href: "/admin/people", label: "People", icon: Users },
    { href: "/admin/payments", label: "Payments", icon: Receipt },
    { href: "/admin/catalogue", label: "Catalogue", icon: Stack },
    { href: "/admin/library", label: "Library", icon: BookOpen },
    { href: "/admin/audit", label: "Audit log", short: "Audit", icon: Scroll },
    ...(role === "OWNER" ? [{ href: "/admin/operators", label: "Operators", icon: IdentificationBadge }] : []),
  ];
}

export function isCurrent(item: AdminNavItem, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
