import type { LucideIcon } from "@corelithzw/ui/lib/icons";
import {
  Building2,
  Grid3x3,
  MedusaBookOpenIcon,
  MedusaCircleSlidersIcon,
  MedusaCircleStackIcon,
  MedusaIdBadgeIcon,
  RefreshCcw,
  ShieldCheck,
  UserCheck,
  Users,
} from "@corelithzw/ui/lib/icons";

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
    href: "/preferences/organization/branding/identity",
    icon: MedusaCircleSlidersIcon,
    matchPrefixes: ["/settings/branding", "/preferences/organization/branding"],
  },
  {
    id: "master-data",
    label: "Master Data",
    href: "/management/master-data",
    icon: MedusaCircleStackIcon,
    matchPrefixes: ["/management/master-data"],
  },
  {
    id: "users",
    label: "Users",
    href: "/preferences/organization/users",
    icon: MedusaIdBadgeIcon,
    matchPrefixes: ["/management/users", "/user-management", "/preferences/organization/users"],
  },
  {
    id: "document-templates",
    label: "Document Templates",
    href: "/preferences/organization/templates",
    icon: MedusaBookOpenIcon,
    matchPrefixes: ["/settings/templates", "/preferences/organization/templates"],
  },
];

export const areaNavItems: Record<ManagementArea, ManagementNavItem[]> = {
  // No compliance module on this host: the area has nothing to list.
  compliance: [],
  // One entry: the branding surface is a master-data shell whose own rail
  // switches between Identity/Assets/Finance — repeating them here would be
  // two navs for the same three sections.
  branding: [
    { id: "branding", label: "Branding", href: "/preferences/organization/branding", icon: Building2 },
  ],
  "master-data": [
    { id: "overview", label: "Overview", href: "/management/master-data", icon: Grid3x3 },
    { id: "job-grades", label: "Job Grades", href: "/management/master-data/hr/job-grades", icon: UserCheck },
  ],
  users: [
    { id: "directory", label: "Directory", href: "/preferences/organization/users", icon: MedusaIdBadgeIcon },
    { id: "create", label: "Create User", href: "/preferences/organization/users", icon: Users },
    { id: "status", label: "User Status", href: "/preferences/organization/users", icon: ShieldCheck },
    {
      id: "password-reset",
      label: "Password Reset",
      href: "/preferences/organization/users",
      icon: RefreshCcw,
    },
    { id: "role-change", label: "Role Change", href: "/preferences/organization/users", icon: UserCheck },
  ],
  "document-templates": [
    { id: "library", label: "Template Library", href: "/preferences/organization/templates", icon: MedusaBookOpenIcon },
  ],
};

export const areaLabels: Record<ManagementArea, string> = {
  branding: "Branding",
  "master-data": "Master Data",
  compliance: "Compliance",
  users: "Users",
  "document-templates": "Document Templates",
};

// The chrome that reads this data lives in the shell package; the functions
// stay importable from here for the host's own callers.
export {
  getAreaLabel,
  getAreaNavItems,
  getVisibleManagementAreaNavItems,
  getVisibleManagementModuleItems,
  isActiveHref,
  isPathMatchingPrefix,
} from "@corelithzw/shell/management";
