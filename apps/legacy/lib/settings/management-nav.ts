import type { LucideIcon } from "@corelithzw/ui/lib/icons";
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
  RefreshCcw,
  ShieldCheck,
  UserCheck,
  UserRound,
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
    id: "compliance",
    label: "Compliance",
    href: "/compliance/permits",
    icon: ShieldCheck,
    matchPrefixes: ["/compliance"],
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
  // One entry: the branding surface is a master-data shell whose own rail
  // switches between Identity/Assets/Finance — repeating them here would be
  // two navs for the same three sections.
  branding: [
    { id: "branding", label: "Branding", href: "/preferences/organization/branding", icon: Building2 },
  ],
  "master-data": [
    { id: "overview", label: "Overview", href: "/management/master-data", icon: Grid3x3 },
    { id: "job-grades", label: "Job Grades", href: "/management/master-data/hr/job-grades", icon: UserCheck },
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

    // A school's academic ladder — years, terms, classes, streams, subjects, the
    // school day, grading and the publishing window — is reference data set up
    // once a year by an administrator, and everything else in the module hangs
    // off it. It sat in the school's own sidebar next to the daily work, where a
    // registrar creating pupils all day could restructure the year. It is master
    // data, so it lives with the rest of the company's master data.
    {
      id: "schools-years",
      label: "Years and Terms",
      href: "/management/master-data/schools/years",
      icon: Dataset,
      description:
        "Academic years, their terms, and the school calendar everything else is dated against.",
    },
    {
      id: "schools-classes",
      label: "Classes and Streams",
      href: "/management/master-data/schools/classes",
      icon: Grid3x3,
      description: "The year-group ladder and the streams inside each one.",
    },
    {
      id: "schools-subjects",
      label: "Subjects",
      href: "/management/master-data/schools/subjects",
      icon: MedusaBookOpenIcon,
      description: "What the school teaches, and which classes take each subject.",
    },
    {
      id: "schools-school-day",
      label: "The School Day",
      href: "/management/master-data/schools/periods",
      icon: MedusaCircleSlidersIcon,
      description: "Periods and rooms — the grid a timetable is laid out on.",
    },
    {
      id: "schools-grading",
      label: "Grading and Publishing",
      href: "/management/master-data/schools/grading",
      icon: FileCheck,
      description:
        "Grade boundaries, and the windows in which results may be published.",
    },
    {
      id: "schools-identity",
      label: "School Records",
      href: "/management/master-data/schools/identity",
      icon: MedusaIdBadgeIcon,
      description:
        "Admission numbering, and the extra fields every pupil and guardian record carries.",
    },
  ],
  compliance: [
    { id: "permits", label: "Permits", href: "/compliance/permits", icon: FileCheck },
    { id: "inspections", label: "Inspections", href: "/compliance/inspections", icon: ShieldCheck },
    { id: "incidents", label: "Incidents", href: "/compliance/incidents", icon: AlertTriangle },
    { id: "training", label: "Training", href: "/compliance/training", icon: MedusaBookOpenIcon },
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
