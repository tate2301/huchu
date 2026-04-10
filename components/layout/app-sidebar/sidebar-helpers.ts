"use client";

import type { NavSection } from "@/lib/navigation";
import type { WorkspaceNavSection } from "@/lib/workspaces";
import {
  BarChart3,
  Building2,
  DirectionsCar,
  Dashboard,
  Gem,
  Home,
  LocalShipping,
  ManageAccounts,
  Package,
  ReceiptLong,
  Recycle,
  Scale,
  Settings2,
  Storefront,
  TableRows,
  Video,
  Wallet,
  Wrench,
  type LucideIcon,
} from "@/lib/icons";

const sectionIcons: Record<string, LucideIcon> = {
  reporting: BarChart3,
  gold: Gem,
  "scrap-metal": Recycle,
  stores: Package,
  maintenance: Wrench,
  hr: ManageAccounts,
  cctv: Video,
  settings: Dashboard,
  schools: Building2,
  "car-sales": DirectionsCar,
  retail: Storefront,
  accounting: Scale,
  management: ManageAccounts,
};
const sectionPrefixIcons: Array<{ prefix: string; icon: LucideIcon }> = [
  { prefix: "gold-", icon: Gem },
  { prefix: "scrap-", icon: Recycle },
  { prefix: "schools-", icon: Building2 },
  { prefix: "autos-", icon: DirectionsCar },
  { prefix: "retail-", icon: Storefront },
  { prefix: "accounting-", icon: Scale },
];
const sectionKeywordIcons: Array<{ keyword: string; icon: LucideIcon }> = [
  { keyword: "report", icon: BarChart3 },
  { keyword: "insight", icon: BarChart3 },
  { keyword: "movement", icon: LocalShipping },
  { keyword: "dispatch", icon: LocalShipping },
  { keyword: "settlement", icon: Wallet },
  { keyword: "cash", icon: Wallet },
  { keyword: "finance", icon: Wallet },
  { keyword: "ticket", icon: ReceiptLong },
  { keyword: "lot", icon: Package },
  { keyword: "stock", icon: Package },
  { keyword: "catalog", icon: TableRows },
  { keyword: "master", icon: TableRows },
  { keyword: "setup", icon: Settings2 },
];

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
  const direct = sectionIcons[section.id];
  if (direct) return direct;

  const prefixed = sectionPrefixIcons.find((entry) => section.id.startsWith(entry.prefix));
  if (prefixed) return prefixed.icon;

  const key = `${section.id} ${section.title}`.toLowerCase();
  const keywordMatch = sectionKeywordIcons.find((entry) => key.includes(entry.keyword));
  if (keywordMatch) return keywordMatch.icon;

  return section.items[0]?.icon ?? Home;
}

export function isDirectLinkSection(section: WorkspaceNavSection) {
  return section.items.length === 1;
}

export function isFlatLinkSection(section: WorkspaceNavSection) {
  return FLAT_SECTION_IDS.has(section.id);
}
