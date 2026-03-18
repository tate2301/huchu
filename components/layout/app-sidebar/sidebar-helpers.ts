"use client";

import type { NavSection } from "@/lib/navigation";
import type { WorkspaceNavSection } from "@/lib/workspaces";
import {
  Building2,
  Coins,
  Dashboard,
  FileCheck,
  Home,
  ManageAccounts,
  Package,
  Recycle,
  Scale,
  Video,
  Wrench,
  type LucideIcon,
} from "@/lib/icons";

const sectionIcons: Record<string, LucideIcon> = {
  reporting: FileCheck,
  gold: Coins,
  "scrap-metal": Recycle,
  stores: Package,
  maintenance: Wrench,
  hr: ManageAccounts,
  cctv: Video,
  settings: Dashboard,
  schools: Building2,
  "car-sales": Package,
  retail: Coins,
  accounting: Scale,
  management: ManageAccounts,
};

const FLAT_SECTION_IDS = new Set(["schools", "car-sales", "retail"]);

export function matchesNavHref(href: string, pathname: string, view: string | null) {
  if (href === "/") return pathname === "/";
  const [path, query] = href.split("?");
  const pathMatches = query
    ? pathname === path
    : pathname === path || pathname.startsWith(`${path}/`);

  if (!pathMatches) return false;
  if (!query) return true;

  const params = new URLSearchParams(query);
  const expectedView = params.get("view");
  return expectedView ? expectedView === view : true;
}

export function getActiveNavHref(sections: NavSection[], pathname: string, view: string | null) {
  const candidates = sections
    .flatMap((section) => section.items)
    .filter((item) => matchesNavHref(item.href, pathname, view))
    .map((item) => {
      const [path, query] = item.href.split("?");
      return {
        href: item.href,
        score: path.length + (query ? 1000 : 0),
      };
    })
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.href ?? null;
}

export function getInitials(name: string | null | undefined) {
  if (!name) return "HU";
  const parts = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "HU";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function getSectionIcon(section: NavSection) {
  return sectionIcons[section.id] ?? section.items[0]?.icon ?? Home;
}

export function isDirectLinkSection(section: WorkspaceNavSection) {
  return section.items.length === 1;
}

export function isFlatLinkSection(section: WorkspaceNavSection) {
  return FLAT_SECTION_IDS.has(section.id);
}
