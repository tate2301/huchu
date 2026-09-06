/**
 * This host's workspace catalogue: the modules it composes into the sidebar,
 * the order they surface in, the curated arrangement each workspace profile
 * shows first, the home each prefers, the quick actions. The builder that
 * gates, resolves the profile and assembles the sections is the shell's
 * (`buildWorkspaceSidebarModel`); this file is the data it works from, next
 * to the module list in `manifests.ts`.
 */
import { ACCOUNTING_OPERATIONS_SECTIONS, ACCOUNTING_TABS } from "@corelithzw/module-books/tab-config";
import { filterAccountingTabsByFeatures } from "@corelithzw/module-books/visibility";
import { canAccessPosPortal } from "@corelithzw/module-sell/pos-host";
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
  Gem,
  FileText,
  MedusaAcademicCapIcon,
  MedusaBuildingStorefrontIcon,
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
  GOLD_MINE: "gold",
  SCHOOLS: "schools",
  RETAIL: "retail",
  // The only profile whose owning module is one every other profile treats as
  // foundational. For a bureau, HR is not a supporting module — it is the product.
  PAYROLL: "payroll",
};
const WORKSPACE_PROFILE_ICONS: Partial<Record<WorkspaceProfile, LucideIcon>> = {
  GOLD_MINE: Gem,
  SCHOOLS: MedusaAcademicCapIcon,
  RETAIL: MedusaBuildingStorefrontIcon,
  PAYROLL: Payments,
  GENERAL: Dashboard,
};
const WORKSPACE_MODULE_ORDER: readonly WorkspaceModuleId[] = [
  "gold",
  "schools",
  "retail",
  "crm",
  "people",
  "payroll",
  "stores",
  "maintenance",
  "accounting",
  "management",
  "reporting",
];

const SUPPORT_ITEMS: NavItem[] = [
  { href: "/help", icon: FileText, label: "Quick Tips" },
];

/**
 * Whether a stock transfer is a thing this workspace can actually do.
 *
 * `InventoryItem` holds one on-hand figure per (site, itemCode) — there is no
 * per-location quantity anywhere in the schema — so a `TRANSFER` reclassifies a
 * whole line from one location to another *inside one site*, and
 * `recordStockMovement` refuses anything else. It therefore takes two active
 * locations at the same site before a transfer has anywhere to go. Derived from
 * the tenant's own locations rather than assumed: the demo bottle store happens
 * to have exactly one (`SHOP`), a second branch would not.
 */
function canReclassifyStockBetweenLocations(siteIds: string[] | undefined): boolean {
  if (!siteIds || siteIds.length < 2) return false;

  const perSite = new Map<string, number>();
  for (const siteId of siteIds) {
    const next = (perSite.get(siteId) ?? 0) + 1;
    if (next >= 2) return true;
    perSite.set(siteId, next);
  }

  return false;
}

const WORKSPACE_MODULES: WorkspaceCatalogue["modules"] = {
  gold: createSectionModule({
    id: "gold",
    label: "Gold Operations",
    sectionId: "gold",
    homeHref: "/gold",
  }),
  schools: createSectionModule({
    id: "schools",
    label: "School Operations",
    sectionId: "schools",
    homeHref: "/schools",
  }),
  retail: {
    id: "retail",
    label: "Retail",
    homeHref: "/retail",
    /**
     * The retail nav section is already the definition — see `lib/navigation.ts`.
     * This adds the three things gating cannot express: the till is a portal app
     * rather than a retail page, the back-office shifts screen is the manager's
     * view of a cash-up a cashier does at the register, and a transfer needs
     * somewhere to transfer to.
     */
    getItems(context) {
      const posCapable = canAccessPosPortal(context.role);
      const canTransfer = canReclassifyStockBetweenLocations(context.activeStockLocationSiteIds);
      const items: NavItem[] = [];

      for (const item of context.navSectionById.get("retail")?.items ?? []) {
        if (item.href === "/retail/shifts" && posCapable) continue;
        // A shop with one stock location has nowhere to send anything, and
        // `recordStockMovement` refuses such a transfer outright — the
        // destination has to be a *different* active location at the same site.
        // A surface whose only action cannot be performed is not offered, the
        // same rule the till applies to its site picker when there is one branch.
        if (item.href === "/retail/stock/transfers" && !canTransfer) continue;
        // `/portal/pos` and `/retail/sales` are both gated on `retail.pos`, so
        // offering the till alongside the sales list keeps them in step.
        if (item.href === "/retail/sales" && posCapable) {
          items.push({ href: "/portal/pos", label: "Open POS", icon: Payments });
        }
        items.push(item);
      }

      return items;
    },
  },
  crm: {
    id: "crm",
    label: "CRM",
    homeHref: "/crm",
    /**
     * Two sections feed this module: the CRM proper and retail's customer
     * ledger. They used to share the id "crm" and rely on gating to leave
     * exactly one standing — the ledger surfaced only when `crm.core` was off
     * and the CRM section had already been filtered away. That worked and read
     * as a bug, so the ids are distinct now and the module names both.
     */
    getItems(context) {
      return [
        ...(context.navSectionById.get("crm")?.items ?? []),
        ...(context.navSectionById.get("retail-customers")?.items ?? []),
      ];
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
  maintenance: createSectionModule({
    id: "maintenance",
    label: "Maintenance & Assets",
    sectionId: "maintenance",
    homeHref: "/maintenance",
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
  GOLD_MINE: {
    label: "Gold Operations",
    preferredHomeHref: "/gold",
    nativeModules: ["gold", "reporting"],
    sections: [
      {
        id: "gold-operations",
        title: "Production",
        refs: [
          { moduleId: "gold", href: "/gold" },
          { moduleId: "gold", href: "/gold/intake/pours/new" },
          { moduleId: "gold", href: "/gold/intake/purchases/new" },
        ],
      },
      {
        id: "gold-chain",
        title: "Movement & Settlement",
        refs: [
          { moduleId: "gold", href: "/gold/transit/dispatches/new" },
          { moduleId: "gold", href: "/gold/settlement/receipts/new" },
          { moduleId: "gold", href: "/gold/settlement/approvals" },
        ],
      },
      {
        id: "gold-control",
        title: "Insights",
        refs: [
          { moduleId: "reporting", href: "/reports/gold-chain" },
          { moduleId: "reporting", href: "/reports/gold-receipts" },
        ],
      },
    ],
  },
  SCHOOLS: {
    label: "School Operations",
    preferredHomeHref: "/schools",
    nativeModules: ["schools"],
    // One section per record, matching the module nav's own grouping: the
    // registrar opens Students, the bursar opens Fees, the boarding master
    // opens Boarding — nobody opens "Administration" to find attendance.
    // A section with one ref renders as a plain top-level link.
    sections: [
      {
        id: "schools-overview",
        title: "School Overview",
        refs: [{ moduleId: "schools", href: "/schools" }],
      },
      {
        id: "schools-students",
        title: "Students",
        refs: [
          { moduleId: "schools", href: "/schools/students" },
          { moduleId: "schools", href: "/schools/admissions" },
          { moduleId: "schools", href: "/schools/students/roll-up" },
          { moduleId: "schools", href: "/schools/imports" },
        ],
      },
      {
        id: "schools-guardians",
        title: "Guardians",
        refs: [{ moduleId: "schools", href: "/schools/guardians" }],
      },
      {
        id: "schools-teachers",
        title: "Teachers",
        refs: [{ moduleId: "schools", href: "/schools/teachers" }],
      },
      {
        id: "schools-attendance",
        title: "Attendance",
        refs: [{ moduleId: "schools", href: "/schools/attendance" }],
      },
      {
        id: "schools-boarding",
        title: "Boarding",
        refs: [
          { moduleId: "schools", href: "/schools/boarding" },
          { moduleId: "schools", href: "/schools/boarding/welfare" },
        ],
      },
      {
        id: "schools-academic-setup",
        title: "Academic setup",
        refs: [
          { moduleId: "schools", href: "/schools/academics" },
          { moduleId: "schools", href: "/schools/classes" },
          { moduleId: "schools", href: "/schools/subjects" },
          { moduleId: "schools", href: "/schools/academics/syllabus" },
          { moduleId: "schools", href: "/schools/academics/identity" },
        ],
      },
      {
        id: "schools-timetable",
        title: "Timetable",
        refs: [{ moduleId: "schools", href: "/schools/timetable" }],
      },
      {
        id: "schools-homework",
        title: "Homework",
        refs: [{ moduleId: "schools", href: "/schools/homework" }],
      },
      {
        id: "schools-goals",
        title: "Subject targets",
        refs: [{ moduleId: "schools", href: "/schools/goals" }],
      },
      {
        id: "schools-meetings",
        title: "Parent meetings",
        refs: [{ moduleId: "schools", href: "/schools/meetings" }],
      },
      {
        id: "schools-results",
        title: "Results",
        refs: [
          { moduleId: "schools", href: "/schools/results" },
          { moduleId: "schools", href: "/schools/results/sheets" },
          { moduleId: "schools", href: "/schools/results/moderation" },
          { moduleId: "schools", href: "/schools/results/publish" },
        ],
      },
      {
        id: "schools-fees",
        title: "Fees",
        refs: [
          { moduleId: "schools", href: "/schools/finance" },
          { moduleId: "schools", href: "/schools/finance/ledger" },
          { moduleId: "schools", href: "/schools/finance/receipts" },
          { moduleId: "schools", href: "/schools/finance/refunds" },
          { moduleId: "schools", href: "/schools/finance/waivers" },
        ],
      },
      {
        id: "schools-library",
        title: "Library",
        refs: [{ moduleId: "schools", href: "/schools/library" }],
      },
      {
        id: "schools-transport",
        title: "Transport",
        refs: [{ moduleId: "schools", href: "/schools/transport" }],
      },
      {
        id: "schools-notices",
        title: "Notices",
        refs: [{ moduleId: "schools", href: "/schools/notices" }],
      },
      {
        id: "schools-paperwork",
        title: "Reports and documents",
        refs: [
          { moduleId: "schools", href: "/schools/reports" },
          { moduleId: "schools", href: "/schools/documents" },
        ],
      },
    ],
  },
  RETAIL: {
    label: "Retail",
    preferredHomeHref: "/retail",
    // Only the curated sections, then the core modules under "more".
    curatedOnly: true,
    /**
     * `stores` is native here, which is what removes "Stores & Inventory" as its
     * own entry from a retail sidebar: `buildAdditionalSections` only emits
     * modules the profile does *not* claim, so a native module contributes its
     * destinations to the curated sections and never renders a rail of its own.
     * Every other profile leaves `stores` unclaimed and still gets the section.
     */
    nativeModules: ["retail", "reporting", "stores"],
    sections: [
      {
        id: "retail-floor",
        title: "Run the Floor",
        refs: [
          { moduleId: "retail", href: "/retail" },
          { moduleId: "retail", href: "/portal/pos" },
          { moduleId: "retail", href: "/retail/sales" },
          { moduleId: "retail", href: "/retail/shifts" },
          { moduleId: "retail", href: "/retail/customers" },
        ],
      },
      /**
       * The one stock door in a retail workspace.
       *
       * Retail's range and the core stock module are the same shop from two
       * angles, and they used to be two entries in the sidebar — "Range & Stock"
       * and, under More, "Stores & Inventory". A shopkeeper had to know which of
       * the two owned the answer, and the answer was usually "both": on-hand has
       * only ever lived in the core `InventoryItem`, and every retail movement
       * writes a core `StockMovement`.
       *
       * What it holds, and why:
       *  - **What we sell** is retail's own — the range, its shelf prices and its
       *    promotions. Core's catalogue and price lists are deliberately *not*
       *    here: they are a second item master and a second price book that no
       *    retail surface reads today, and offering them beside retail's own
       *    would be offering the shopkeeper a choice with no right answer. They
       *    stay entitled, reachable as tabs of the Stores shell, and they get the
       *    keys (`stores.catalogue`, `stores.price-lists`) that let a tenant be
       *    given retail's stock without them. S-3 and S-4 collapse the pair; the
       *    nav follows that, it does not pre-empt it.
       *  - **Stock** is core's, plus the two retail screens core has no answer
       *    for. `/retail/stock` carries the on-order and goods-received values
       *    that come from retail purchase orders and receipts, which the core
       *    stock overview cannot show. `/retail/stock/count` posts a variance as
       *    an `ADJUSTMENT`; the Stores module offers Issue and Receive and has no
       *    adjustment surface at all, so deleting it would lose the stock take.
       *    `/retail/stock/transfers` is the only `TRANSFER` surface in the
       *    product, and it hides itself when the shop has nowhere to transfer to.
       */
      {
        id: "retail-range",
        title: "Range & Stock",
        groups: [
          { id: "selling", label: "What we sell" },
          { id: "stock", label: "Stock" },
        ],
        refs: [
          { moduleId: "retail", href: "/retail/catalog", group: "selling" },
          { moduleId: "retail", href: "/retail/merchandising/pricing", group: "selling" },
          { moduleId: "retail", href: "/retail/merchandising/promotions", group: "selling" },
          { moduleId: "retail", href: "/retail/stock", group: "stock" },
          { moduleId: "stores", href: "/stores/inventory", group: "stock" },
          { moduleId: "stores", href: "/stores/movements", group: "stock" },
          { moduleId: "stores", href: "/stores/locations", group: "stock" },
          { moduleId: "retail", href: "/retail/stock/count", group: "stock" },
          { moduleId: "retail", href: "/retail/stock/transfers", group: "stock" },
        ],
      },
      {
        id: "retail-buy",
        title: "Purchasing",
        refs: [
          { moduleId: "retail", href: "/retail/purchasing/orders" },
          { moduleId: "retail", href: "/retail/purchasing/receipts" },
        ],
      },
      {
        id: "retail-control",
        title: "Controls & Growth",
        refs: [
          { moduleId: "retail", href: "/retail/reports" },
          { moduleId: "retail", href: "/retail/setup" },
          { moduleId: "retail", href: "/retail/setup/operations" },
          { moduleId: "retail", href: "/retail/setup/pos-policy" },
          { moduleId: "retail", href: "/retail/setup/accounting" },
        ],
      },
    ],
  },
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
  // Retail surfaces on any retail feature or the till, not on one key.
  moduleGates: {
    retail: (enabled) => Array.from(enabled).some((feature) => feature.startsWith("retail.") || feature === "portal.pos"),
  },
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

  if (normalized.includes("GOLD")) return "GOLD_MINE";
  if (normalized.includes("SCHOOL")) return "SCHOOLS";
  // Retired templates. A stored tenant still on one of these codes gets the
  // general workspace rather than a null profile, which would send it down the
  // "no template" path and lose the mapping altogether.
  if (
    normalized.includes("SCRAP") ||
    normalized.includes("AUTO") ||
    normalized.includes("CAR_SALES") ||
    normalized.includes("CAR-SALES") ||
    normalized.includes("SECURITY_STOCK")
  ) {
    return "GENERAL";
  }
  if (normalized.includes("THRIFT") || normalized.includes("RETAIL")) return "RETAIL";
  if (normalized.includes("PAYROLL") || normalized.includes("BUREAU")) return "PAYROLL";
  if (normalized.includes("CORE") || normalized.includes("ALL_FEATURES")) return "GENERAL";
  return null;
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
