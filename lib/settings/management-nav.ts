import type { LucideIcon } from "@/lib/icons";
import {
  AlertTriangle,
  Building2,
  Coins,
  Dataset,
  FileCheck,
  Grid3x3,
  MedusaBookOpenIcon,
  MedusaCircleSlidersIcon,
  MedusaCircleStackIcon,
  MedusaIdBadgeIcon,
  MedusaBuildingsIcon,
  RefreshCcw,
  ShieldCheck,
  UserCheck,
  UserRound,
  Users,
} from "@/lib/icons";
import {
  canViewHrefWithEnabledFeatures,
  filterHrefItemsByEnabledFeatures,
} from "@/lib/platform/gating/nav-filter";

export type ManagementArea =
  | "branding"
  | "master-data"
  | "compliance"
  | "users"
  | "document-templates";

export type ManagementNavItem = {
  id: string;
  label: string;
  href: string;
  icon?: LucideIcon;
  description?: string;
};

export type ManagementModuleItem = ManagementNavItem & {
  matchPrefixes: string[];
};

export const managementModuleItems: ManagementModuleItem[] = [
  {
    id: "branding",
    label: "Branding",
    href: "/settings/branding/identity",
    icon: MedusaCircleSlidersIcon,
    matchPrefixes: ["/settings/branding"],
  },
  {
    id: "master-data",
    label: "Master Data",
    href: "/management/master-data",
    icon: MedusaCircleStackIcon,
    matchPrefixes: ["/management/master-data"],
  },
  {
    id: "compliance",
    label: "Compliance",
    href: "/compliance/permits",
    icon: ShieldCheck,
    matchPrefixes: ["/compliance"],
  },
  {
    id: "users",
    label: "Users",
    href: "/management/users",
    icon: MedusaIdBadgeIcon,
    matchPrefixes: ["/management/users", "/user-management"],
  },
  {
    id: "document-templates",
    label: "Document Templates",
    href: "/settings/templates",
    icon: MedusaBookOpenIcon,
    matchPrefixes: ["/settings/templates"],
  },
];

const areaNavItems: Record<ManagementArea, ManagementNavItem[]> = {
  branding: [
    { id: "identity", label: "Identity & Theme", href: "/settings/branding/identity", icon: Building2 },
    { id: "assets", label: "Assets & Contact", href: "/settings/branding/assets", icon: Grid3x3 },
    { id: "finance", label: "Finance & Defaults", href: "/settings/branding/finance", icon: Coins },
  ],
  "master-data": [
    { id: "overview", label: "Overview", href: "/management/master-data", icon: Grid3x3 },
    { id: "departments", label: "Departments", href: "/management/master-data/hr/departments", icon: Users },
    { id: "job-grades", label: "Job Grades", href: "/management/master-data/hr/job-grades", icon: UserCheck },
    { id: "sites", label: "Sites", href: "/management/master-data/operations/sites", icon: MedusaBuildingsIcon },
    { id: "sections", label: "Sections", href: "/management/master-data/operations/sections", icon: Dataset },
    {
      id: "downtime-codes",
      label: "Downtime Codes",
      href: "/management/master-data/operations/downtime-codes",
      icon: AlertTriangle,
    },
    {
      id: "gold-expense-types",
      label: "Settlement Types",
      href: "/management/master-data/operations/gold-expense-types",
      icon: Coins,
      description: "Settlement and variable payout category master data.",
    },
    {
      id: "scrap-materials",
      label: "Scrap Materials",
      href: "/management/master-data/operations/scrap-materials",
      icon: RefreshCcw,
      description: "Material catalog and recyclable definitions for scrap operations.",
    },
    {
      id: "scrap-sellers",
      label: "Scrap Sellers",
      href: "/management/master-data/operations/scrap-sellers",
      icon: UserRound,
      description: "Seller identity records used by scrap purchases and compliance checks.",
    },
  ],
  compliance: [
    { id: "permits", label: "Permits", href: "/compliance/permits", icon: FileCheck },
    { id: "inspections", label: "Inspections", href: "/compliance/inspections", icon: ShieldCheck },
    { id: "incidents", label: "Incidents", href: "/compliance/incidents", icon: AlertTriangle },
    { id: "training", label: "Training", href: "/compliance/training", icon: MedusaBookOpenIcon },
  ],
  users: [
    { id: "directory", label: "Directory", href: "/management/users", icon: MedusaIdBadgeIcon },
    { id: "create", label: "Create User", href: "/management/users/create", icon: Users },
    { id: "status", label: "User Status", href: "/management/users/status", icon: ShieldCheck },
    {
      id: "password-reset",
      label: "Password Reset",
      href: "/management/users/password-reset",
      icon: RefreshCcw,
    },
    { id: "role-change", label: "Role Change", href: "/management/users/role-change", icon: UserCheck },
  ],
  "document-templates": [
    { id: "library", label: "Template Library", href: "/settings/templates", icon: MedusaBookOpenIcon },
  ],
};

const areaLabels: Record<ManagementArea, string> = {
  branding: "Branding",
  "master-data": "Master Data",
  compliance: "Compliance",
  users: "Users",
  "document-templates": "Document Templates",
};

export function getAreaNavItems(area: ManagementArea): ManagementNavItem[] {
  return areaNavItems[area];
}

export function getVisibleManagementAreaNavItems(
  area: ManagementArea,
  enabledFeatures: string[] | undefined,
): ManagementNavItem[] {
  return filterHrefItemsByEnabledFeatures(getAreaNavItems(area), enabledFeatures);
}

export function getVisibleManagementModuleItems(
  enabledFeatures: string[] | undefined,
): ManagementModuleItem[] {
  return managementModuleItems.flatMap((item) => {
    if (item.id !== "master-data") {
      return canViewHrefWithEnabledFeatures(item.href, enabledFeatures) ? [item] : [];
    }

    const visibleMasterDataItems = getVisibleManagementAreaNavItems("master-data", enabledFeatures);
    if (visibleMasterDataItems.length === 0) {
      return [];
    }

    return [
      {
        ...item,
        href: visibleMasterDataItems[0].href,
      },
    ];
  });
}

export function getAreaLabel(area: ManagementArea): string {
  return areaLabels[area];
}

export function isPathMatchingPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isActiveHref(pathname: string, href: string): boolean {
  const path = href.split("?")[0] || href;
  return pathname === path || pathname.startsWith(`${path}/`);
}
