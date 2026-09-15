"use client";

import type { NavSection } from "@/lib/navigation";
import type { WorkspaceNavSection } from "@/lib/workspaces";
import {
  CalendarCheck,
  FileText,
  Gem,
  Home,
  LocalShipping,
  MedusaAcademicCapIcon,
  MedusaBookOpenIcon,
  MedusaBuildingsIcon,
  MedusaBuildingStorefrontIcon,
  MedusaCashIcon,
  MedusaChartBarIcon,
  MedusaCircleSlidersIcon,
  MedusaCircleStackIcon,
  MedusaCogSixToothIcon,
  MedusaDirectionsIcon,
  MedusaGridListIcon,
  MedusaHandTruckIcon,
  MedusaHouseIcon,
  MedusaIdBadgeIcon,
  Megaphone,
  Package,
  Users,
  ReceiptLong,
  Scale,
  Wallet,
  Wrench,
  type LucideIcon,
} from "@/lib/icons";

const sectionIcons: Record<string, LucideIcon> = {
  reporting: MedusaChartBarIcon,
  gold: Gem,
  stores: MedusaHandTruckIcon,
  maintenance: Wrench,
  hr: MedusaIdBadgeIcon,
  settings: MedusaCogSixToothIcon,
  schools: MedusaAcademicCapIcon,
  retail: MedusaBuildingStorefrontIcon,
  accounting: Scale,
  management: MedusaCircleSlidersIcon,
};

const sectionVariantIcons: Record<string, LucideIcon> = {
  "gold-operations": Gem,
  "gold-chain": LocalShipping,
  "gold-control": MedusaChartBarIcon,
  "schools-campus": MedusaBuildingsIcon,
  "schools-academics": MedusaBookOpenIcon,
  "schools-admin": MedusaIdBadgeIcon,
  // The schools rail is generated band by band from lib/navigation.ts, so each
  // band needs its own icon here. Without one the band borrows its first item's,
  // and because items are alphabetical that made Fees and Attendance open with
  // the red warning triangle belonging to Arrears and Absence follow-up.
  "schools-students": MedusaAcademicCapIcon,
  "schools-attendance": CalendarCheck,
  "schools-teaching": MedusaBookOpenIcon,
  "schools-results": MedusaChartBarIcon,
  "schools-boarding": MedusaHouseIcon,
  "schools-fees": Wallet,
  "schools-staff": Users,
  "schools-communication": Megaphone,
  "schools-services": MedusaHandTruckIcon,
  "schools-setup": MedusaCircleSlidersIcon,
  "schools-paperwork": FileText,
  "retail-floor": ReceiptLong,
  "retail-range": MedusaGridListIcon,
  "retail-buy": LocalShipping,
  "retail-control": Scale,
  "accounting-overview": Scale,
  "accounting-receivables": ReceiptLong,
  "accounting-payables": Package,
  "accounting-reporting": MedusaChartBarIcon,
  "accounting-banking": Wallet,
  "accounting-master": MedusaCircleSlidersIcon,
};

const sectionKeywordIcons: Array<{ keyword: string; icon: LucideIcon }> = [
  { keyword: "report", icon: MedusaChartBarIcon },
  { keyword: "insight", icon: MedusaChartBarIcon },
  { keyword: "movement", icon: LocalShipping },
  { keyword: "dispatch", icon: LocalShipping },
  { keyword: "settlement", icon: Wallet },
  { keyword: "cash", icon: MedusaCashIcon },
  { keyword: "finance", icon: Wallet },
  { keyword: "ticket", icon: ReceiptLong },
  { keyword: "lot", icon: MedusaCircleStackIcon },
  { keyword: "stock", icon: Package },
  { keyword: "catalog", icon: MedusaGridListIcon },
  { keyword: "master", icon: MedusaCircleSlidersIcon },
  { keyword: "setup", icon: MedusaCogSixToothIcon },
  { keyword: "customer", icon: MedusaIdBadgeIcon },
  { keyword: "academic", icon: MedusaBookOpenIcon },
  { keyword: "campus", icon: MedusaBuildingsIcon },
  { keyword: "pipeline", icon: MedusaDirectionsIcon },
];

const FLAT_SECTION_IDS = new Set(["schools", "retail"]);

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

  const variant = sectionVariantIcons[section.id];
  if (variant) return variant;

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
