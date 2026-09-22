import type { LucideIcon } from "@/lib/icons";
import {
  AlertTriangle,
  Bell,
  Building2,
  Calendar,
  Circle,
  Clock,
  Coins,
  Dataset,
  FileCheck,
  FileText,
  Grid3x3,
  IdentificationCard,
  Layers,
  MapPin,
  MedusaBookOpenIcon,
  MedusaCircleSlidersIcon,
  MedusaCircleStackIcon,
  MedusaIdBadgeIcon,
  Palette,
  RefreshCcw,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UserRound,
  Users,
  Wallet,
} from "@/lib/icons";
import { canViewPreferenceItem } from "@/lib/preferences/nav";
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
    href: "/preferences/organization/branding/identity",
    icon: MedusaCircleSlidersIcon,
    matchPrefixes: ["/settings/branding", "/preferences/organization/branding"],
  },
  {
    id: "master-data",
    label: "Master data",
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
    label: "Document templates",
    href: "/preferences/organization/templates",
    icon: MedusaBookOpenIcon,
    matchPrefixes: ["/settings/templates", "/preferences/organization/templates"],
  },
];

const areaNavItems: Record<ManagementArea, ManagementNavItem[]> = {
  // One entry: the branding surface is a master-data shell whose own rail
  // switches between Identity/Assets/Finance — repeating them here would be
  // two navs for the same three sections.
  branding: [
    { id: "branding", label: "Branding", href: "/preferences/organization/branding", icon: Building2 },
  ],
  "master-data": [
    { id: "overview", label: "Overview", href: "/management/master-data", icon: Grid3x3 },
    { id: "job-grades", label: "Job grades", href: "/management/master-data/hr/job-grades", icon: UserCheck },
    { id: "sections", label: "Sections", href: "/management/master-data/operations/sections", icon: Dataset },
    {
      id: "downtime-codes",
      label: "Downtime codes",
      href: "/management/master-data/operations/downtime-codes",
      icon: AlertTriangle,
    },
    {
      id: "gold-expense-types",
      label: "Settlement types",
      href: "/management/master-data/operations/gold-expense-types",
      icon: Coins,
      description: "Settlement and variable payout category master data.",
    },
    /*
      Scrap Materials and Scrap Sellers were here and are gone.

      Both pointed at `/management/master-data/operations/scrap-*`, and that
      directory holds downtime-codes, gold-expense-types, sections and sites —
      the pages never existed. Next prefetches a link as soon as its parent
      renders, so both 404'd on every visit to master data.

      Not in-progress work: `SCRAP_METAL` is a workspace profile with no entry
      in `PROFILE_OWNER_MODULES`, which `lib/workspaces.ts` documents as the
      shape of a *retired* profile, and there are no `scrap.*` keys in the
      feature catalog. Nothing else in the codebase mentions scrap except two
      comments about gold-and-scrap settlement.
    */

    // A school's academic ladder — years, terms, classes, streams, subjects, the
    // school day, grading and the publishing window — is reference data set up
    // once a year by an administrator, and everything else in the module hangs
    // off it. It sat in the school's own sidebar next to the daily work, where a
    // registrar creating pupils all day could restructure the year. It is master
    // data, so it lives with the rest of the company's master data.
    {
      id: "schools-years",
      label: "Years and terms",
      href: "/management/master-data/schools/years",
      icon: Dataset,
      description:
        "Academic years, their terms, and the school calendar everything else is dated against.",
    },
    {
      id: "schools-classes",
      label: "Classes and streams",
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
      label: "The school day",
      href: "/management/master-data/schools/periods",
      icon: MedusaCircleSlidersIcon,
      description: "Periods and rooms — the grid a timetable is laid out on.",
    },
    {
      id: "schools-grading",
      label: "Grading and publishing",
      href: "/management/master-data/schools/grading",
      icon: FileCheck,
      description:
        "Grade boundaries, and the windows in which results may be published.",
    },
    {
      id: "schools-identity",
      label: "School records",
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
    { id: "create", label: "Create user", href: "/preferences/organization/users", icon: Users },
    { id: "status", label: "User status", href: "/preferences/organization/users", icon: ShieldCheck },
    {
      id: "password-reset",
      label: "Password reset",
      href: "/preferences/organization/users",
      icon: RefreshCcw,
    },
    { id: "role-change", label: "Role change", href: "/preferences/organization/users", icon: UserCheck },
  ],
  "document-templates": [
    { id: "library", label: "Template library", href: "/preferences/organization/templates", icon: MedusaBookOpenIcon },
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

/* ---------------------------------------------------------------------- *
 * The settings rail
 *
 * `Rail.dc.html` draws one rail for the whole surface: People, then the
 * workspace's own reference data (Operations in a mine, School in a school),
 * then Compliance, Company, My account. The entries in it come from the two
 * nav tables that used to drive two different shells — this one and
 * `lib/preferences/nav.ts` — regrouped by what the reader is looking for
 * rather than by which shell happened to own the route.
 *
 * **Regrouping is presentation; gating is not.** Every entry below keeps the
 * exact predicate its route is gated by today: a `/preferences` entry is still
 * decided by `canViewPreferenceItem`, and everything else is still decided by
 * `canViewHrefWithEnabledFeatures` against the route registry. Nothing here
 * grants, widens or narrows access, and the two tables above are untouched so
 * `getVisiblePreferencesItems` keeps returning exactly what its tests pin.
 * ---------------------------------------------------------------------- */

export type SettingsRailGroupId =
  | "people"
  | "operations"
  | "compliance"
  | "company"
  | "school"
  | "my-account";

/**
 * How an entry is gated. Two kinds because there are two gates in the product,
 * not because the rail wants a policy of its own:
 *
 *   - `preference` — the item id `lib/preferences/nav.ts` already keys its
 *     role and feature checks by, and which `requirePreferencesAccess` re-runs
 *     on the server for the same route.
 *   - `feature` — the href, resolved to a feature key through the route
 *     registry, which is how `/management/**` and `/compliance/**` have always
 *     been filtered.
 */
export type SettingsNavGate =
  | { kind: "preference"; itemId: string }
  | { kind: "feature" };

export type SettingsNavEntry = {
  id: string;
  group: SettingsRailGroupId;
  label: string;
  href: string;
  icon: LucideIcon;
  gate: SettingsNavGate;
  /**
   * Extra paths that should light this entry up — the redirect stubs, and the
   * deeper routes a section owns (`/preferences/organization/users/[id]`
   * belongs to Users). The href itself is always matched; these are additions.
   */
  matchPrefixes?: string[];
};

export const SETTINGS_RAIL_GROUP_LABELS: Record<SettingsRailGroupId, string> = {
  people: "People",
  operations: "Operations",
  compliance: "Compliance",
  company: "Company",
  school: "School",
  "my-account": "My account",
};

/**
 * `Rail.dc.html` draws the rail twice, and the two drawings are what fix this
 * order. The mining workspace reads People, Operations, Compliance, Company,
 * My account; the school workspace reads People, **School**, Compliance,
 * Company, My account. School is not a tail group appended after Company — it
 * sits exactly where Operations sits, because it is the same thing: the
 * reference data the workspace's daily work hangs off.
 *
 * A workspace only ever has one of the two — the entries in each are gated by
 * feature keys that do not co-occur — so in practice this reads as one group
 * in that slot. The order still has to be right for the case where both
 * survive, and for anyone reading the list to learn the shape of the rail.
 */
const SETTINGS_RAIL_GROUP_ORDER: SettingsRailGroupId[] = [
  "people",
  "operations",
  "school",
  "compliance",
  "company",
  "my-account",
];

/**
 * Every destination the surface has, in the order `Rail.dc.html` draws them.
 *
 * Users, Departments and Sites point at `/preferences/...` because that is
 * where those screens actually live — the `/management/...` paths for them are
 * five-line redirect stubs, and the rail should not send a reader through a
 * redirect to reach a page. The stubs stay listed as match prefixes so a
 * bookmark that lands on one still lights the right row on the way through.
 */
export const settingsNavEntries: SettingsNavEntry[] = [
  {
    id: "users",
    group: "people",
    label: "Users",
    href: "/preferences/organization/users",
    icon: Users,
    gate: { kind: "preference", itemId: "users" },
    matchPrefixes: ["/management/users", "/user-management"],
  },
  {
    id: "departments",
    group: "people",
    label: "Departments",
    href: "/preferences/organization/departments",
    icon: Building2,
    gate: { kind: "preference", itemId: "departments" },
    matchPrefixes: ["/management/master-data/hr/departments"],
  },
  {
    id: "job-grades",
    group: "people",
    label: "Job grades",
    href: "/management/master-data/hr/job-grades",
    icon: IdentificationCard,
    gate: { kind: "feature" },
  },

  {
    id: "sites",
    group: "operations",
    label: "Sites",
    href: "/preferences/organization/sites",
    icon: MapPin,
    gate: { kind: "preference", itemId: "sites" },
    matchPrefixes: ["/management/master-data/operations/sites"],
  },
  {
    id: "sections",
    group: "operations",
    label: "Sections",
    href: "/management/master-data/operations/sections",
    icon: Layers,
    gate: { kind: "feature" },
  },
  {
    id: "downtime-codes",
    group: "operations",
    label: "Downtime codes",
    href: "/management/master-data/operations/downtime-codes",
    icon: AlertTriangle,
    gate: { kind: "feature" },
  },
  {
    id: "gold-expense-types",
    group: "operations",
    label: "Settlement types",
    href: "/management/master-data/operations/gold-expense-types",
    icon: Coins,
    gate: { kind: "feature" },
  },

  {
    id: "schools-years",
    group: "school",
    label: "Years and terms",
    href: "/management/master-data/schools/years",
    icon: Calendar,
    gate: { kind: "feature" },
  },
  {
    id: "schools-classes",
    group: "school",
    label: "Classes and streams",
    href: "/management/master-data/schools/classes",
    icon: Grid3x3,
    gate: { kind: "feature" },
  },
  {
    id: "schools-subjects",
    group: "school",
    label: "Subjects",
    href: "/management/master-data/schools/subjects",
    icon: MedusaBookOpenIcon,
    gate: { kind: "feature" },
  },
  {
    id: "schools-school-day",
    group: "school",
    label: "The school day",
    href: "/management/master-data/schools/periods",
    icon: Clock,
    gate: { kind: "feature" },
  },
  {
    id: "schools-grading",
    group: "school",
    // "Grading", not the area table's "Grading and publishing": the rail's rows
    // are 268px wide with an icon, a gap and a count on them, and `Rail.dc.html`
    // draws the short form. The route and its page title are unchanged.
    label: "Grading",
    href: "/management/master-data/schools/grading",
    icon: FileCheck,
    gate: { kind: "feature" },
  },
  {
    id: "schools-identity",
    group: "school",
    label: "School records",
    href: "/management/master-data/schools/identity",
    icon: MedusaIdBadgeIcon,
    gate: { kind: "feature" },
  },

  {
    id: "permits",
    group: "compliance",
    label: "Permits",
    href: "/compliance/permits",
    icon: FileCheck,
    gate: { kind: "feature" },
  },
  {
    id: "inspections",
    group: "compliance",
    label: "Inspections",
    href: "/compliance/inspections",
    icon: ShieldCheck,
    gate: { kind: "feature" },
  },
  {
    id: "incidents",
    group: "compliance",
    label: "Incidents",
    href: "/compliance/incidents",
    icon: AlertTriangle,
    gate: { kind: "feature" },
  },
  {
    id: "training",
    group: "compliance",
    label: "Training",
    href: "/compliance/training",
    icon: MedusaBookOpenIcon,
    gate: { kind: "feature" },
  },

  {
    id: "organization",
    group: "company",
    label: "General",
    href: "/preferences/organization",
    icon: SlidersHorizontal,
    gate: { kind: "preference", itemId: "organization" },
  },
  {
    id: "branding",
    group: "company",
    label: "Branding",
    href: "/preferences/organization/branding",
    icon: Palette,
    gate: { kind: "preference", itemId: "branding" },
    matchPrefixes: ["/settings/branding"],
  },
  {
    id: "templates",
    group: "company",
    label: "Templates",
    href: "/preferences/organization/templates",
    icon: FileText,
    gate: { kind: "preference", itemId: "templates" },
    matchPrefixes: ["/settings/templates"],
  },
  {
    id: "billing",
    group: "company",
    label: "Billing",
    href: "/preferences/organization/billing",
    icon: Wallet,
    gate: { kind: "preference", itemId: "billing" },
  },

  {
    id: "profile",
    group: "my-account",
    label: "Profile",
    href: "/preferences/profile",
    icon: UserRound,
    gate: { kind: "preference", itemId: "profile" },
  },
  {
    id: "notifications",
    group: "my-account",
    label: "Notifications",
    href: "/preferences/notifications",
    icon: Bell,
    gate: { kind: "preference", itemId: "notifications" },
  },
  {
    id: "appearance",
    group: "my-account",
    label: "Appearance",
    href: "/preferences/appearance",
    icon: Circle,
    gate: { kind: "preference", itemId: "appearance" },
  },
];

export type SettingsRailAccess = {
  role?: string | null;
  enabledFeatures?: string[] | undefined;
};

export function canViewSettingsNavEntry(
  entry: SettingsNavEntry,
  access: SettingsRailAccess,
): boolean {
  return entry.gate.kind === "preference"
    ? canViewPreferenceItem(entry.gate.itemId, access)
    : canViewHrefWithEnabledFeatures(entry.href, access.enabledFeatures);
}

export function getVisibleSettingsNavEntries(access: SettingsRailAccess): SettingsNavEntry[] {
  return settingsNavEntries.filter((entry) => canViewSettingsNavEntry(entry, access));
}

export type SettingsRailGroupData = {
  id: SettingsRailGroupId;
  label: string;
  items: SettingsNavEntry[];
};

/**
 * The visible entries, grouped and in board order. A group with nothing left
 * in it is dropped rather than drawn empty — a heading over no rows reads as a
 * section that failed to load.
 */
export function getSettingsRailGroups(access: SettingsRailAccess): SettingsRailGroupData[] {
  const visible = getVisibleSettingsNavEntries(access);

  return SETTINGS_RAIL_GROUP_ORDER.flatMap((groupId) => {
    const items = visible.filter((entry) => entry.group === groupId);
    if (items.length === 0) return [];
    return [{ id: groupId, label: SETTINGS_RAIL_GROUP_LABELS[groupId], items }];
  });
}

/**
 * Which entry the current path belongs to.
 *
 * Longest match wins, which is the whole reason this is not a `find`:
 * `/preferences/organization` is a prefix of `/preferences/organization/users`,
 * so a first-match scan would mark General active on every company page under
 * it.
 */
export function findActiveSettingsNavEntry(
  pathname: string,
  entries: SettingsNavEntry[] = settingsNavEntries,
): SettingsNavEntry | undefined {
  let best: SettingsNavEntry | undefined;
  let bestLength = -1;

  for (const entry of entries) {
    for (const candidate of [entry.href, ...(entry.matchPrefixes ?? [])]) {
      const matches = pathname === candidate || pathname.startsWith(`${candidate}/`);
      if (matches && candidate.length > bestLength) {
        best = entry;
        bestLength = candidate.length;
      }
    }
  }

  return best;
}
