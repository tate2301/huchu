/**
 * The CRM host's workspace catalogue: the modules it composes into the sidebar,
 * the order they surface in, the curated arrangement each workspace profile
 * shows first, the home each prefers, the quick actions. The builder that
 * gates, resolves the profile and assembles the sections is the shell's
 * (`buildWorkspaceSidebarModel`); this file is the data it works from, next
 * to the module list in `manifests.ts`.
 */
import { ACCOUNTING_OPERATIONS_SECTIONS, ACCOUNTING_TABS } from "@corelithzw/module-books/tab-config";
import { filterAccountingTabsByFeatures } from "@corelithzw/module-books/visibility";
import type { NavItem } from "@corelithzw/shell/navigation";
import { getVisibleManagementModuleItems } from "@corelithzw/shell/management";
import { getPrimaryQuickActions } from "@corelithzw/shell/primary-actions";
import type { WorkspaceNavSection, WorkspaceSectionGroup, WorkspaceSidebarModel } from "@corelithzw/shell/sidebar-model";
import {
  buildWorkspaceSidebarModel,
  createSectionModule,
  normalizeWorkspaceProfile,
  workspaceHomeHref,
  type WorkspaceCatalogue,
  type WorkspaceModelArgs,
} from "@corelithzw/shell/workspace-model";
import { WORKSPACE_PROFILES, type WorkspaceModuleId, type WorkspaceProfile } from "@corelithzw/platform/workspace-products";
import {
  Dashboard,
  FileText,
  Payments,
  type LucideIcon,
} from "@corelithzw/ui/lib/icons";

export { WORKSPACE_PROFILES, normalizeWorkspaceProfile };
export type { WorkspaceModuleId, WorkspaceProfile, WorkspaceModelArgs };
export type { WorkspaceNavSection, WorkspaceSectionGroup, WorkspaceSidebarModel };

const CANONICAL_MODULE_IDS: readonly WorkspaceModuleId[] = ["people", "payroll", "accounting", "management"];
/**
 * Modules that need their own feature key present before they surface, on top of
 * having visible items. Empty since the dropped verticals left; kept because the
 * mechanism is what any future strict module hangs off.
 */
const STRICT_WORKSPACE_MODULE_FEATURE_KEYS: Partial<Record<WorkspaceModuleId, string>> = {};
// Retired profiles (`SCRAP_METAL`, `AUTOS`) have no entry: their owning module
// is gone. Nothing normalises to them any more, so the lookups below fall
// through to `GENERAL` rather than to a module that does not exist.
const PROFILE_OWNER_MODULES: Partial<Record<Exclude<WorkspaceProfile, "GENERAL">, WorkspaceModuleId>> = {
  // The only profile whose owning module is one every other profile treats as
  // foundational. For a bureau, HR is not a supporting module — it is the product.
  PAYROLL: "payroll",
};
const WORKSPACE_PROFILE_ICONS: Partial<Record<WorkspaceProfile, LucideIcon>> = {
  PAYROLL: Payments,
  GENERAL: Dashboard,
};
const WORKSPACE_MODULE_ORDER: readonly WorkspaceModuleId[] = [
  "crm",
  "people",
  "payroll",
  "stores",
  "accounting",
  "management",
  "reporting",
];

const SUPPORT_ITEMS: NavItem[] = [
  { href: "/help", icon: FileText, label: "Quick Tips" },
];


const WORKSPACE_MODULES: WorkspaceCatalogue["modules"] = {
  crm: {
    id: "crm",
    label: "CRM",
    homeHref: "/crm",
    // One section feeds this module on this host: the CRM proper. On the
    // enterprise host the module also lists the shop's customer ledger.
    getItems(context) {
      return context.navSectionById.get("crm")?.items ?? [];
    },
    getGroups(context) {
      return context.navSectionById.get("crm")?.groups;
    },
  },
  people: createSectionModule({
    id: "people",
    label: "People",
    sectionId: "people",
    homeHref: "/people",
  }),
  payroll: createSectionModule({
    id: "payroll",
    label: "Payroll",
    sectionId: "payroll",
    homeHref: "/payroll/runs",
  }),
  stores: createSectionModule({
    id: "stores",
    label: "Stores & Inventory",
    sectionId: "stores",
    homeHref: "/stores/dashboard",
  }),
  reporting: createSectionModule({
    id: "reporting",
    label: "Reports",
    sectionId: "reporting",
    homeHref: "/reports",
  }),
  accounting: {
    id: "accounting",
    label: "Accounting",
    homeHref: "/accounting",
    getItems(context) {
      return filterAccountingTabsByFeatures(ACCOUNTING_TABS, context.enabledFeatures).map((tab) => ({
        href: tab.href,
        label: tab.label,
        icon: tab.icon,
      }));
    },
  },
  management: {
    id: "management",
    label: "Management",
    homeHref: "/management/master-data",
    getItems(context) {
      return getVisibleManagementModuleItems(context.enabledFeatures).map((item) => ({
        href: item.href,
        label: item.label,
        icon: item.icon ?? FileText,
      }));
    },
  },
};

// Retired profiles have no recipe. `normalizeWorkspaceProfile` maps them to
// `GENERAL`, and every lookup here falls back to the `GENERAL` recipe, so a
// stored `SCRAP_METAL` or `AUTOS` tenant gets the general workspace rather than
// an empty sidebar.
const WORKSPACE_PROFILE_RECIPES: WorkspaceCatalogue["recipes"] = {
  PAYROLL: {
    label: "Payroll",
    // Somewhere real to land. A bureau sent to the general dashboard sees eight
    // tiles for modules it does not have — and it lands on the runs screen, not
    // the directory, because paying people is what it opened this for.
    preferredHomeHref: "/payroll/runs",
    nativeModules: ["people", "payroll", "accounting", "management"],
    sections: [
      {
        id: "payroll-month-end",
        title: "Month end",
        refs: [
          { moduleId: "payroll", href: "/payroll/runs" },
          { moduleId: "payroll", href: "/payroll/disbursements" },
        ],
      },
      {
        id: "payroll-statutory",
        title: "Statutory",
        refs: [
          { moduleId: "payroll", href: "/payroll/statutory" },
          { moduleId: "payroll", href: "/payroll/statutory/returns" },
        ],
      },
      // Not "People", and it does not claim `/people`. A curated section takes
      // its hrefs out of the module rails (`getPrimarySections` excludes
      // `usedHrefs`), so titling this "People" put two sections called People in
      // the rail *and* emptied the directory out of the one that owns it.
      // Compensation is what a bureau needs shortcut here; the People rail keeps
      // the people.
      {
        id: "payroll-compensation",
        title: "Compensation",
        refs: [
          { moduleId: "payroll", href: "/payroll/compensation" },
          { moduleId: "payroll", href: "/payroll/salaries" },
        ],
      },
    ],
  },
  GENERAL: {
    label: "General Business",
    preferredHomeHref: null,
    nativeModules: [...WORKSPACE_MODULE_ORDER],
    sections: [],
  },
};

/**
 * The books list their entry points in one consolidated section: sub-tabs and
 * grouping live inside the /accounting shell, and the sidebar lists the doors.
 * Overview first; the banking section is not a sidebar entry point.
 */
function consolidateAccounting(
  moduleId: WorkspaceModuleId,
  moduleItems: NavItem[],
  workspaceGroup: WorkspaceSectionGroup,
  excludedHrefs: Set<string> | undefined,
): WorkspaceNavSection[] | null {
  if (moduleId !== "accounting") return null;
  const orderedHrefs = [
    ...ACCOUNTING_OPERATIONS_SECTIONS.overview,
    ...ACCOUNTING_OPERATIONS_SECTIONS.receivables,
    ...ACCOUNTING_OPERATIONS_SECTIONS.payables,
    ...ACCOUNTING_OPERATIONS_SECTIONS.reporting,
    ...ACCOUNTING_OPERATIONS_SECTIONS.master,
  ];
  const items: NavItem[] = [];
  for (const href of orderedHrefs) {
    if (excludedHrefs?.has(href)) continue;
    const item = moduleItems.find((candidate) => candidate.href === href);
    if (item) items.push(item);
  }
  if (items.length === 0) return [];
  return [{ id: "accounting-master", title: "Accounting Master", items, workspaceGroup }];
}

export const WORKSPACE_CATALOGUE: WorkspaceCatalogue = {
  modules: WORKSPACE_MODULES,
  moduleOrder: WORKSPACE_MODULE_ORDER,
  canonicalModuleIds: CANONICAL_MODULE_IDS,
  strictModuleFeatureKeys: STRICT_WORKSPACE_MODULE_FEATURE_KEYS,
  recipes: WORKSPACE_PROFILE_RECIPES,
  profileOwnerModules: PROFILE_OWNER_MODULES,
  profileIcons: WORKSPACE_PROFILE_ICONS,
  consolidateModule: consolidateAccounting,
  quickActions: getPrimaryQuickActions,
  supportItems: SUPPORT_ITEMS,
};

export function getWorkspaceProfileForTemplate(code: string | null | undefined): WorkspaceProfile | null {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  if (normalized.includes("PAYROLL") || normalized.includes("BUREAU")) return "PAYROLL";
  // Every other template this platform has issued — the mine, the school, the
  // shop, the retired ones — has no workspace of its own on this host: a tenant
  // on one of those codes gets the general workspace here rather than a null
  // profile.
  return "GENERAL";
}

export function getWorkspaceHomeHref(profile: string | null | undefined): string {
  return workspaceHomeHref(WORKSPACE_CATALOGUE, profile);
}

export function getComputedWorkspaceHomeHref(args: WorkspaceModelArgs): string {
  return getWorkspaceSidebarModel(args).homeHref;
}

export function getWorkspaceSidebarModel(args: WorkspaceModelArgs): WorkspaceSidebarModel {
  return buildWorkspaceSidebarModel(WORKSPACE_CATALOGUE, args);
}
