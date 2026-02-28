import type { LucideIcon } from "@/lib/icons";
import {
  Building2,
  Dataset,
  FileText,
  ShieldCheck,
  Users,
} from "@/lib/icons";

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
};

export type ManagementModuleItem = ManagementNavItem & {
  matchPrefixes: string[];
};

export const managementModuleItems: ManagementModuleItem[] = [
  {
    id: "branding",
    label: "Branding",
    href: "/settings/branding/identity",
    icon: Building2,
    matchPrefixes: ["/settings/branding"],
  },
  {
    id: "master-data",
    label: "Master Data",
    href: "/management/master-data",
    icon: Dataset,
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
    icon: Users,
    matchPrefixes: ["/management/users", "/user-management"],
  },
  {
    id: "document-templates",
    label: "Document Templates",
    href: "/settings/templates",
    icon: FileText,
    matchPrefixes: ["/settings/templates"],
  },
];

const areaNavItems: Record<ManagementArea, ManagementNavItem[]> = {
  branding: [
    { id: "identity", label: "Identity & Theme", href: "/settings/branding/identity" },
    { id: "assets", label: "Assets & Contact", href: "/settings/branding/assets" },
    { id: "finance", label: "Finance & Defaults", href: "/settings/branding/finance" },
  ],
  "master-data": [
    { id: "overview", label: "Overview", href: "/management/master-data" },
    { id: "departments", label: "Departments", href: "/management/master-data/hr/departments" },
    { id: "job-grades", label: "Job Grades", href: "/management/master-data/hr/job-grades" },
    { id: "sites", label: "Sites", href: "/management/master-data/operations/sites" },
    { id: "sections", label: "Sections", href: "/management/master-data/operations/sections" },
    {
      id: "downtime-codes",
      label: "Downtime Codes",
      href: "/management/master-data/operations/downtime-codes",
    },
    {
      id: "gold-expense-types",
      label: "Gold Expense Types",
      href: "/management/master-data/operations/gold-expense-types",
    },
  ],
  compliance: [
    { id: "permits", label: "Permits", href: "/compliance/permits" },
    { id: "inspections", label: "Inspections", href: "/compliance/inspections" },
    { id: "incidents", label: "Incidents", href: "/compliance/incidents" },
    { id: "training", label: "Training", href: "/compliance/training" },
  ],
  users: [
    { id: "directory", label: "Directory", href: "/management/users" },
    { id: "create", label: "Create User", href: "/management/users/create" },
    { id: "status", label: "User Status", href: "/management/users/status" },
    {
      id: "password-reset",
      label: "Password Reset",
      href: "/management/users/password-reset",
    },
    { id: "role-change", label: "Role Change", href: "/management/users/role-change" },
  ],
  "document-templates": [
    { id: "library", label: "Template Library", href: "/settings/templates" },
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
