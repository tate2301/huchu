import { ACCOUNTING_OPERATIONS_SECTIONS, ACCOUNTING_TABS } from "@/lib/accounting/tab-config";
import { filterAccountingTabsByFeatures } from "@/lib/accounting/visibility";
import type { NavGroup, NavItem, NavSection } from "@/lib/navigation";
import { getNavSectionsForRole, navSections, schoolBandGrant } from "@/lib/navigation";
import { normalizeFeatureKey } from "@/lib/platform/gating/catalog-utils";
import { filterNavSectionsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";
import type { PersonaCode } from "@/lib/platform/personas";
import { getPrimaryQuickActions } from "@/lib/primary-actions";
import { canAccessPosPortal } from "@/lib/retail/pos-host";
import { schoolAccess } from "@/lib/schools/access";
import {
  inferWorkspaceProfileFromEnabledFeatures,
  normalizeWorkspaceProfileInput,
  resolveWorkspaceVerticalProductBundle,
  type VerticalProductBundleDefinition,
  WORKSPACE_PROFILES,
  type WorkspaceModuleId,
  type WorkspaceProfile,
} from "@/lib/workspace-products";
import {
  Buildings,
  Dashboard,
  Funnel,
  Gem,
  FileText,
  MedusaAcademicCapIcon,
  MedusaBuildingStorefrontIcon,
  Payments,
  type LucideIcon,
} from "@/lib/icons";
import { getVisibleManagementModuleItems } from "@/lib/settings/management-nav";
import { isRouteAllowedForRole } from "@/lib/auth-core/role-routes";

export { WORKSPACE_PROFILES };
export type { WorkspaceModuleId, WorkspaceProfile };

export type WorkspaceSectionGroup = "primary" | "additional";

export type WorkspaceNavSection = NavSection & {
  workspaceGroup?: WorkspaceSectionGroup;
};

export type WorkspaceSidebarModel = {
  homeHref: string;
  homeLabel: string;
  workspaceLabel: string;
  workspaceIcon: LucideIcon;
  quickActions: NavItem[];
  sections: WorkspaceNavSection[];
  supportItems: NavItem[];
  /** Every workspace this person can switch to. One entry means no switcher. */
  workspaces: WorkspaceOption[];
  /** The one the sections above were built for. */
  activeWorkspaceId: string;
};

type WorkspaceModelArgs = {
  role: string | null | undefined;
  enabledFeatures: string[] | undefined;
  workspaceProfile: string | null | undefined;
  /**
   * The site each *active* stock location belongs to, one entry per location.
   *
   * Only the shape of this list matters, not the ids: a transfer reclassifies a
   * stock line from one location to another **within one site**, so it can only
   * be performed where some site has two of them. Left undefined the answer is
   * "not known", and a surface whose only action may well be impossible is not
   * offered. See `canReclassifyStockBetweenLocations`.
   */
  activeStockLocationSiteIds?: string[];
  /**
   * Which of a multi-workspace tenant's workspaces is being looked at.
   *
   * Ignored where the tenant has only one, which is nearly all of them. The
   * choice is a per-person preference rather than a fact about the company, so
   * it is held by the rail and passed down, not stored on the session.
   */
  activeWorkspaceId?: string | null;
};

type WorkspaceBuildContext = WorkspaceModelArgs & {
  visibleNavSections: NavSection[];
  navSectionById: Map<string, NavSection>;
};

type WorkspaceModuleDefinition = {
  id: WorkspaceModuleId;
  label: string;
  homeHref: string | null;
  getItems: (context: WorkspaceBuildContext) => NavItem[];
  /**
   * The section's semantic groups, when it declares any. Carried through here
   * because the sidebar assembles its own sections from module items and would
   * otherwise drop the grouping the navigation model defines.
   */
  getGroups?: (context: WorkspaceBuildContext) => NavGroup[] | undefined;
};

type WorkspaceProfileSectionSpec = {
  id: string;
  title: string;
  /**
   * Bands within the section, when it is long enough to need them.
   *
   * Declared here rather than on the module's nav section because the grouping
   * is a property of *this arrangement* — Range & Stock draws from two modules
   * and neither of them knows about the other. A group with nothing in it after
   * gating is dropped, the same way `buildModuleSection` drops one.
   */
  groups?: NavGroup[];
  refs: Array<{
    moduleId: WorkspaceModuleId;
    href: string;
    /** The band this destination sits in. Must name one of `groups`. */
    group?: string;
  }>;
};

type WorkspaceProfileRecipe = {
  label: string;
  /**
   * Where the workspace opens. A function when the answer depends on who is
   * asking: one school is a fee ledger to the bursar and a roll to the
   * registrar, and neither of them opened it to read the head's dashboard.
   */
  preferredHomeHref: string | null | ((role: string | null | undefined) => string | null);
  nativeModules: WorkspaceModuleId[];
  sections: WorkspaceProfileSectionSpec[];
};

function resolveRecipeHomeHref(
  recipe: WorkspaceProfileRecipe,
  role: string | null | undefined,
): string | null {
  return typeof recipe.preferredHomeHref === "function"
    ? recipe.preferredHomeHref(role)
    : recipe.preferredHomeHref;
}

const DEFAULT_WORKSPACE_PROFILE: WorkspaceProfile = "GENERAL";
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
/**
 * The modules a workspace is built around.
 *
 * Everything else the platform has — people, payroll, accounting, stores,
 * maintenance, reporting, management — is a function every business performs,
 * and belongs in whichever workspace you happen to be standing in. These four
 * are not functions, they are the business: a school, a shop, a sales desk, a
 * mine. Two of them in one rail is not a longer rail, it is two jobs.
 *
 * A tenant that runs more than one gets one workspace per module, switched
 * from the company mark. A tenant that runs one — which is nearly all of them
 * — gets exactly what it got before: `getWorkspaceOptions` returns a single
 * option and nothing below changes.
 */
const WORKSPACE_OWNER_MODULES: readonly WorkspaceModuleId[] = [
  "schools",
  "retail",
  "crm",
  "gold",
];

/**
 * The stored profile a workspace resolves to, where one exists.
 *
 * CRM is absent on purpose. Its profile would have to be a value in the Prisma
 * `WorkspaceProfile` enum, and a sales desk does not need one: scoped to the
 * crm module, `GENERAL` builds precisely the rail a CRM-only tenant already
 * has today.
 */
const WORKSPACE_OWNER_PROFILES: Partial<Record<WorkspaceModuleId, WorkspaceProfile>> = {
  schools: "SCHOOLS",
  retail: "RETAIL",
  gold: "GOLD_MINE",
};

/**
 * What a workspace is called.
 *
 * The product's own names, taken from the vertical bundles, so a split tenant
 * reads the same word above its rail that an unsplit one does. Fixed rather
 * than resolved: the bundle is inferred from the tenant's *whole* feature set
 * and therefore answers the same thing on either side of the switcher, which
 * is precisely the lie this avoids.
 */
const WORKSPACE_OWNER_LABELS: Partial<Record<WorkspaceModuleId, string>> = {
  schools: "School Operations",
  retail: "Retail",
  crm: "Sales & CRM",
  gold: "Gold Operations",
};

const WORKSPACE_OWNER_ICONS: Partial<Record<WorkspaceModuleId, LucideIcon>> = {
  schools: MedusaAcademicCapIcon,
  retail: MedusaBuildingStorefrontIcon,
  crm: Funnel,
  gold: Gem,
};

/**
 * The back office, when a tenant runs more than one business.
 *
 * People, payroll, the books, the reports, the stores: one of each, however
 * many verticals are running. Filing them under whichever vertical happens to
 * be open would be a lie — a group with a school and a shop keeps one payroll —
 * and repeating them in every workspace costs seven marks of the ten tier one
 * has. So they get a mark of their own, and only where there is a switcher to
 * put it in.
 */
const BUSINESS_WORKSPACE_ID = "business";

/** One entry in the company mark's switcher. */
export type WorkspaceOption = {
  /** The module the workspace is built around; null is the remainder. */
  moduleId: WorkspaceModuleId | null;
  id: string;
  label: string;
  icon: LucideIcon;
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

function createSectionModule(args: {
  id: WorkspaceModuleId;
  label: string;
  sectionId: string;
  homeHref: string;
}): WorkspaceModuleDefinition {
  return {
    id: args.id,
    label: args.label,
    homeHref: args.homeHref,
    getItems(context) {
      return context.navSectionById.get(args.sectionId)?.items ?? [];
    },
    getGroups(context) {
      return context.navSectionById.get(args.sectionId)?.groups;
    },
  };
}

const WORKSPACE_MODULES: Record<WorkspaceModuleId, WorkspaceModuleDefinition> = {
  gold: createSectionModule({
    id: "gold",
    label: "Gold Operations",
    sectionId: "gold",
    homeHref: "/gold",
  }),
  schools: {
    id: "schools",
    label: "School Operations",
    homeHref: "/schools",
    /**
     * The campus nav section is already the definition — see `lib/navigation.ts`.
     * This adds the one thing feature gating cannot express: a destination is a
     * campus grant, so a persona without it is being offered a door that answers
     * 403. A warden has no business being shown the fee ledger, and the rail is
     * where they should learn that, not the page.
     *
     * A row's own grant wins over its group's, and a group's verb is asked as
     * declared rather than always `view` — which is what lets Fees ask for
     * `issue` while Health and welfare, sitting under Students, asks for
     * `schools.welfare`.
     */
    getItems(context) {
      const items = context.navSectionById.get("schools")?.items ?? [];
      const access = schoolAccess(context.role);
      // A role the persona model does not describe — a tenant's own clerk, an
      // administrator — is not being refused by these grants, it is simply not
      // spoken about by them. Reading that silence as "no" would empty the rail
      // rather than tailor it.
      if (!access.persona) return items;

      return items.filter((item) => {
        const grant = item.grant ?? (item.group ? schoolBandGrant(item.group) : null);
        return !grant || access.can(grant.resource, grant.action ?? "view");
      });
    },
    getGroups(context) {
      return context.navSectionById.get("schools")?.groups;
    },
  },
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

/**
 * The campus arrangement, read off the navigation model rather than restated.
 *
 * `lib/navigation.ts` already declares the bands a school works in and what
 * sits in each. A second hand-written list of the same destinations drifted
 * from it — sixteen live routes, the whole master-data set among them, were
 * simply absent from the sidebar — so there is only the one list now. One band
 * is one section, and a band that gains a screen gains it in the rail the same
 * day.
 */
function buildSchoolsProfileSections(): WorkspaceProfileSectionSpec[] {
  const section = declaredSection("schools");
  if (!section) return [];

  // An overview is a destination, not a category, so an ungrouped item stays a
  // section of its own and renders as a plain link.
  const loose = section.items
    .filter((item) => !item.group)
    .map((item) => ({
      id: `schools-${item.label.toLowerCase().replace(/\s+/g, "-")}`,
      title: item.label,
      refs: [{ moduleId: "schools" as const, href: item.href }],
    }));

  const bands = (section.groups ?? []).map((group) => ({
    id: `schools-${group.id}`,
    title: group.label,
    refs: section.items
      .filter((item) => item.group === group.id)
      .map((item) => ({ moduleId: "schools" as const, href: item.href })),
  }));

  return [...loose, ...bands];
}

/**
 * Where each campus persona lands.
 *
 * Everybody used to arrive on the head's overview, which is a screen about
 * somebody else's morning to the four people who are not the head. A bursar
 * opens a school to work the fee ledger and a registrar to work the roll.
 * Anyone the list does not name keeps the overview, which is the right answer
 * for the head and a safe one for everybody else.
 */
const SCHOOL_PERSONA_HOME_HREFS: Partial<Record<PersonaCode, string>> = {
  BURSAR: "/schools/finance",
  REGISTRAR: "/schools/students",
  HOD: "/schools/results/moderation",
  WARDEN: "/schools/boarding",
};

function schoolHomeHref(role: string | null | undefined): string {
  const persona = schoolAccess(role).persona;
  return (persona ? SCHOOL_PERSONA_HOME_HREFS[persona] : null) ?? "/schools";
}

// Retired profiles have no recipe. `normalizeWorkspaceProfile` maps them to
// `GENERAL`, and every lookup here falls back to the `GENERAL` recipe, so a
// stored `SCRAP_METAL` or `AUTOS` tenant gets the general workspace rather than
// an empty sidebar.
const WORKSPACE_PROFILE_RECIPES: Partial<Record<WorkspaceProfile, WorkspaceProfileRecipe>> & {
  GENERAL: WorkspaceProfileRecipe;
} = {
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
    preferredHomeHref: schoolHomeHref,
    nativeModules: ["schools"],
    sections: buildSchoolsProfileSections(),
  },
  RETAIL: {
    label: "Retail",
    preferredHomeHref: "/retail",
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

export function normalizeWorkspaceProfile(value: string | null | undefined): WorkspaceProfile {
  return normalizeWorkspaceProfileInput(value) ?? DEFAULT_WORKSPACE_PROFILE;
}

/**
 * The recipe for a profile, falling back to the general one. Only a retired
 * profile misses, and the general workspace is where a retired tenant belongs.
 */
function getWorkspaceProfileRecipe(profile: WorkspaceProfile): WorkspaceProfileRecipe {
  return WORKSPACE_PROFILE_RECIPES[profile] ?? WORKSPACE_PROFILE_RECIPES.GENERAL;
}

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

function buildContext(args: WorkspaceModelArgs): WorkspaceBuildContext {
  // Route-restricted roles (e.g. SALES_REP → CRM only) should never be shown
  // nav for areas the access layer will block anyway.
  const visibleNavSections = filterNavSectionsByEnabledFeatures(
    getNavSectionsForRole(args.role),
    args.enabledFeatures,
  )
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isRouteAllowedForRole(args.role, item.href)),
    }))
    .filter((section) => section.items.length > 0);

  return {
    ...args,
    visibleNavSections,
    navSectionById: new Map(visibleNavSections.map((section) => [section.id, section] as const)),
  };
}

function getVisibleModules(context: WorkspaceBuildContext): Map<WorkspaceModuleId, NavItem[]> {
  const normalizedEnabled = new Set((context.enabledFeatures ?? []).map((feature) => normalizeFeatureKey(feature)));
  const entries = WORKSPACE_MODULE_ORDER.map((moduleId) => {
    const moduleDefinition = WORKSPACE_MODULES[moduleId];
    return [moduleId, moduleDefinition.getItems(context)] as const;
  }).filter((entry) => {
    if (entry[1].length === 0) return false;
    if (entry[0] === "retail") {
      return Array.from(normalizedEnabled).some(
        (feature) => feature.startsWith("retail.") || feature === "portal.pos",
      );
    }
    const strictFeatureKey = STRICT_WORKSPACE_MODULE_FEATURE_KEYS[entry[0]];
    if (!strictFeatureKey) return true;
    return normalizedEnabled.has(normalizeFeatureKey(strictFeatureKey));
  });

  return new Map(entries);
}

function getVisibleItem(
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
  moduleId: WorkspaceModuleId,
  href: string,
): NavItem | null {
  const item = visibleModules.get(moduleId)?.find((candidate) => candidate.href === href);
  return item ?? null;
}

function buildProfileSections(
  recipe: WorkspaceProfileRecipe,
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
): WorkspaceNavSection[] {
  return recipe.sections
    .map((section) => {
      const items: NavItem[] = [];
      const seen = new Set<string>();

      for (const ref of section.refs) {
        const item = getVisibleItem(visibleModules, ref.moduleId, ref.href);
        if (!item || seen.has(item.href)) continue;
        seen.add(item.href);
        // The arrangement's grouping wins over whatever band the item carried
        // in its own module — `/stores/inventory` is "Stock" in both, but the
        // profile is the one that decided that here.
        items.push(ref.group ? { ...item, group: ref.group } : item);
      }

      // A group label with nothing under it is worse than no label.
      const present = new Set(items.map((item) => item.group).filter(Boolean));
      const groups = section.groups?.filter((group) => present.has(group.id));

      return {
        id: section.id,
        title: section.title,
        ...(groups && groups.length > 0 ? { groups } : {}),
        items,
        workspaceGroup: "primary" as const,
      };
    })
    .filter((section) => section.items.length > 0);
}

function getOrderedModuleIds(verticalProduct: VerticalProductBundleDefinition): WorkspaceModuleId[] {
  const seen = new Set<WorkspaceModuleId>();
  const ordered: WorkspaceModuleId[] = [];

  for (const moduleId of [
    ...verticalProduct.primaryModules,
    ...verticalProduct.foundationalModules,
    ...WORKSPACE_MODULE_ORDER,
  ]) {
    if (seen.has(moduleId)) continue;
    seen.add(moduleId);
    ordered.push(moduleId);
  }

  return ordered;
}

function collectSectionHrefs(sections: WorkspaceNavSection[]): Set<string> {
  return new Set(sections.flatMap((section) => section.items.map((item) => item.href)));
}

/**
 * The groups a module's own nav section declares.
 *
 * The sidebar reassembles sections from module items, which loses everything on
 * the section but its items. Module ids and section ids line up for every
 * `createSectionModule` module, so reading the declaration back is enough.
 */
function declaredSection(moduleId: WorkspaceModuleId): NavSection | undefined {
  // Last match, not first, to stay consistent with `navSectionById` — the map
  // the module reads its items from is built from this array, so a later entry
  // with the same id wins there and this has to agree.
  let found: NavSection | undefined;
  for (const section of navSections) {
    if (section.id === moduleId) found = section;
  }
  return found;
}

function declaredGroups(moduleId: WorkspaceModuleId): NavGroup[] | undefined {
  return declaredSection(moduleId)?.groups;
}

function buildModuleSection(
  moduleId: WorkspaceModuleId,
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
  workspaceGroup: WorkspaceSectionGroup,
  excludedHrefs?: Set<string>,
): WorkspaceNavSection | null {
  const items = (visibleModules.get(moduleId) ?? []).filter((item) => !excludedHrefs?.has(item.href));
  if (items.length === 0) return null;

  // Drop any group left with nothing in it after gating and exclusions.
  const present = new Set(items.map((item) => item.group).filter(Boolean));
  const groups = declaredGroups(moduleId)?.filter((group) => present.has(group.id));

  return {
    id: moduleId,
    title: WORKSPACE_MODULES[moduleId].label,
    ...(groups && groups.length > 0 ? { groups } : {}),
    // Carried through: the sidebar decides whether to render the groups as
    // root entries or as bands, and it can only do that if the flag survives
    // the trip through the module layer.
    ...(declaredSection(moduleId)?.flattenGroups ? { flattenGroups: true } : {}),
    items,
    workspaceGroup,
  };
}

function buildModuleSections(
  moduleId: WorkspaceModuleId,
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
  workspaceGroup: WorkspaceSectionGroup,
  excludedHrefs?: Set<string>,
): WorkspaceNavSection[] {
  if (moduleId === "accounting") {
    const moduleItems = visibleModules.get("accounting") ?? [];
    // Single consolidated section. Sub-tabs/grouping live inside the
    // /accounting shell — the global sidebar just lists the entry points.
    // Overview is intentionally first.
    const orderedHrefs = [
      ...ACCOUNTING_OPERATIONS_SECTIONS.overview,
      ...ACCOUNTING_OPERATIONS_SECTIONS.receivables,
      ...ACCOUNTING_OPERATIONS_SECTIONS.payables,
      ...ACCOUNTING_OPERATIONS_SECTIONS.reporting,
      // The banking section went with the ST-1.2 parking; the route and its
      // model are untouched, it is simply not a sidebar entry point.
      ...ACCOUNTING_OPERATIONS_SECTIONS.master,
    ];

    const items: NavItem[] = [];
    for (const href of orderedHrefs) {
      if (excludedHrefs?.has(href)) continue;
      const item = moduleItems.find((i) => i.href === href);
      if (item) items.push(item);
    }

    if (items.length === 0) return [];

    return [
      {
        id: "accounting-master",
        title: "Accounting Master",
        items,
        workspaceGroup,
      },
    ];
  }

  const section = buildModuleSection(moduleId, visibleModules, workspaceGroup, excludedHrefs);
  return section ? [section] : [];
}

function buildGeneralSections(
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
  verticalProduct: VerticalProductBundleDefinition,
): WorkspaceNavSection[] {
  return getOrderedModuleIds(verticalProduct)
    .flatMap((moduleId) => buildModuleSections(moduleId, visibleModules, "primary"));
}

function buildCanonicalCoreSections(
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
  excludedHrefs: Set<string>,
  verticalProduct: VerticalProductBundleDefinition,
  workspaceGroup: WorkspaceSectionGroup,
): WorkspaceNavSection[] {
  return getOrderedModuleIds(verticalProduct)
    .filter((moduleId): moduleId is WorkspaceModuleId => CANONICAL_MODULE_IDS.includes(moduleId))
    .flatMap((moduleId) => buildModuleSections(moduleId, visibleModules, workspaceGroup, excludedHrefs));
}

function buildAdditionalSections(
  recipe: WorkspaceProfileRecipe,
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
  excludedHrefs: Set<string>,
  verticalProduct: VerticalProductBundleDefinition,
): WorkspaceNavSection[] {
  return getOrderedModuleIds(verticalProduct)
    .filter(
      (moduleId) =>
        !recipe.nativeModules.includes(moduleId) &&
        !CANONICAL_MODULE_IDS.includes(moduleId) &&
        visibleModules.has(moduleId),
    )
    .flatMap((moduleId) => buildModuleSections(moduleId, visibleModules, "additional", excludedHrefs));
}

/**
 * @param verticalOnly A workspace that is one of several stops at its own
 *   arrangement. The canonical core — people, payroll, the books, management —
 *   is shared work rather than this business's, and it has a mark of its own in
 *   the switcher; appending it here would put the same seven areas in every
 *   workspace and cost tier one most of its column. Whatever the arrangement
 *   itself pulls out of those modules stays, because that is a curated choice:
 *   Campus keeps Staff and families, Fees keeps the fee ledger.
 */
function getPrimarySections(
  recipe: WorkspaceProfileRecipe,
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
  verticalProduct: VerticalProductBundleDefinition,
  verticalOnly = false,
): WorkspaceNavSection[] {
  if (recipe === WORKSPACE_PROFILE_RECIPES.GENERAL) {
    return buildGeneralSections(visibleModules, verticalProduct);
  }

  const profileSections = buildProfileSections(recipe, visibleModules);
  const usedHrefs = collectSectionHrefs(profileSections);

  if (verticalOnly || recipe === WORKSPACE_PROFILE_RECIPES.RETAIL) {
    return profileSections;
  }

  return [
    ...profileSections,
    ...buildCanonicalCoreSections(visibleModules, usedHrefs, verticalProduct, "primary"),
  ];
}

/**
 * The workspaces a tenant's modules earn it.
 *
 * Exported so the rail can draw the switcher without building every
 * workspace's sections to find out there is more than one.
 */
export function getWorkspaceOptions(args: WorkspaceModelArgs): WorkspaceOption[] {
  const context = buildContext(args);
  return workspaceOptionsFor(getVisibleModules(context), context);
}

function workspaceOptionsFor(
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
  context: WorkspaceBuildContext,
): WorkspaceOption[] {
  /*
    Running the business, not borrowing a row from it.

    A module can be visible because something else lit one of its destinations
    up: a bottle store gets `crm.customers`, so the CRM module answers with
    retail's own customer ledger and nothing else. That is one row, not a
    second business, and offering the shopkeeper a switcher for it would be
    absurd. A module's own nav section surviving the feature gate is the
    difference, and it is the same gate everything else here reads.
  */
  const owned = WORKSPACE_OWNER_MODULES.filter(
    (moduleId) => visibleModules.has(moduleId) && context.navSectionById.has(moduleId),
  );
  if (owned.length === 0) {
    // Nothing vertical is running — a bureau, a books-only tenant. There is one
    // workspace and it is the whole platform, exactly as before.
    return [
      {
        moduleId: null,
        id: "GENERAL",
        label: WORKSPACE_PROFILE_RECIPES.GENERAL.label,
        icon: Dashboard,
      },
    ];
  }
  if (owned.length === 1) {
    // One business. The rail is the whole platform, as it always was, and there
    // is nothing to switch to — so no switcher and no back office to split off.
    const moduleId = owned[0]!;
    return [
      {
        moduleId,
        id: moduleId,
        label: WORKSPACE_OWNER_LABELS[moduleId] ?? WORKSPACE_MODULES[moduleId].label,
        icon: WORKSPACE_OWNER_ICONS[moduleId] ?? Dashboard,
      },
    ];
  }
  return [
    ...owned.map((moduleId) => ({
      moduleId,
      id: moduleId,
      label: WORKSPACE_OWNER_LABELS[moduleId] ?? WORKSPACE_MODULES[moduleId].label,
      icon: WORKSPACE_OWNER_ICONS[moduleId] ?? Dashboard,
    })),
    {
      moduleId: null,
      id: BUSINESS_WORKSPACE_ID,
      label: "Business",
      icon: Buildings,
    },
  ];
}

/**
 * Which workspace to open on.
 *
 * The stored choice if it still exists — a module can be switched off between
 * two sign-ins — then whichever one the tenant's own profile names, then the
 * first. Never nothing: `workspaceOptionsFor` always returns at least one.
 */
function pickWorkspace(
  options: WorkspaceOption[],
  activeWorkspaceId: string | null | undefined,
  tenantProfile: WorkspaceProfile,
): WorkspaceOption {
  const chosen = activeWorkspaceId
    ? options.find((option) => option.id === activeWorkspaceId)
    : undefined;
  if (chosen) return chosen;
  const byProfile = options.find(
    (option) => option.moduleId && WORKSPACE_OWNER_PROFILES[option.moduleId] === tenantProfile,
  );
  if (byProfile) return byProfile;
  // The tenant's profile names no vertical it is running — a bureau that has
  // since bought a shop, or a company that has never said what it is. Opening
  // it inside somebody else's business would be a guess; the back office is
  // the one workspace that is certainly theirs.
  return options.find((option) => option.id === BUSINESS_WORKSPACE_ID) ?? options[0]!;
}

/**
 * One workspace's share of the modules.
 *
 * A vertical keeps the other verticals out but not the shared modules, because
 * its own arrangement reaches into them — Campus draws Staff and families out
 * of `people`, and scoping that away would empty an area the design put there.
 * What it does not get is the *leftovers* of those modules: see the
 * `verticalOnly` note on `getPrimarySections`.
 */
function scopeModulesToWorkspace(
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
  active: WorkspaceOption,
  recipe: WorkspaceProfileRecipe,
): Map<WorkspaceModuleId, NavItem[]> {
  const scoped = new Map(visibleModules);
  if (active.moduleId === null) {
    // The back office. Every vertical goes; what is left is the shared work.
    for (const moduleId of WORKSPACE_OWNER_MODULES) scoped.delete(moduleId);
    return scoped;
  }
  if (recipe === WORKSPACE_PROFILE_RECIPES.GENERAL) {
    // A vertical with no recipe of its own — CRM, whose profile is not a value
    // the stored enum carries. There is no curated arrangement to pull shared
    // destinations through, so the general builder would simply list every
    // module it can see. This workspace is its own module and nothing else.
    const items = visibleModules.get(active.moduleId);
    return items ? new Map([[active.moduleId, items]]) : new Map();
  }
  for (const moduleId of WORKSPACE_OWNER_MODULES) {
    if (moduleId !== active.moduleId) scoped.delete(moduleId);
  }
  return scoped;
}

function resolveEffectiveWorkspaceProfile(
  enabledFeatures: string[] | undefined,
  requestedProfile: WorkspaceProfile,
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
  /**
   * Did the tenant actually say GENERAL, or does it just not have a profile?
   *
   * `normalizeWorkspaceProfile` answers GENERAL to both — to `null`, because
   * that is the documented default, and to the string "GENERAL", because that
   * is what it means. Collapsing them cost the CRM tenant its identity: a
   * service business that says it is general was overruled by inference and
   * came back as a school, sidebar and all, while its own data (companies
   * numbered CRMC-, every owner Tafadzwa Mukono) rendered correctly
   * underneath.
   *
   * "I have no profile" is a question. "I am a general business" is an answer.
   * Only the first one gets inferred at.
   */
  profileWasStated: boolean,
): WorkspaceProfile {
  if (requestedProfile === "GENERAL") {
    if (profileWasStated) return "GENERAL";
    return inferWorkspaceProfileFromEnabledFeatures(enabledFeatures) ?? requestedProfile;
  }

  // A retired profile has no owner module, so every lookup below misses and the
  // tenant ends up on `GENERAL` — the documented landing place for one.
  const ownerModule = PROFILE_OWNER_MODULES[requestedProfile];
  if (ownerModule && visibleModules.has(ownerModule)) {
    return requestedProfile;
  }

  const inferredProfile = inferWorkspaceProfileFromEnabledFeatures(enabledFeatures);
  if (inferredProfile && inferredProfile !== "GENERAL") {
    const inferredOwnerModule = PROFILE_OWNER_MODULES[inferredProfile];
    if (inferredOwnerModule && visibleModules.has(inferredOwnerModule)) {
      return inferredProfile;
    }
  }

  for (const profile of WORKSPACE_PROFILES) {
    if (profile === "GENERAL") continue;
    const candidateModule = PROFILE_OWNER_MODULES[profile];
    if (candidateModule && visibleModules.has(candidateModule)) {
      return profile;
    }
  }

  return "GENERAL";
}

function getSupportItems(context: WorkspaceBuildContext): NavItem[] {
  const overviewSection = context.navSectionById.get("overview");
  return overviewSection?.items.filter((item) => item.href !== "/") ?? SUPPORT_ITEMS;
}

function getQuickActions(
  args: {
    role: string | null | undefined;
    enabledFeatures: string[] | undefined;
    workspaceProfile: WorkspaceProfile;
  },
): NavItem[] {
  return getPrimaryQuickActions({
    workspaceProfile: args.workspaceProfile,
    role: args.role,
    enabledFeatures: args.enabledFeatures,
  }).filter((item) => isRouteAllowedForRole(args.role, item.href));
}

function getGeneralDashboardItem(context: WorkspaceBuildContext): NavItem | null {
  const settingsSection = context.navSectionById.get("settings");
  return settingsSection?.items.find((item) => item.href === "/dashboard") ?? null;
}

function flattenVisibleItems(sections: WorkspaceNavSection[]): NavItem[] {
  return sections.flatMap((section) => section.items);
}

function getHomeTarget(args: {
  recipe: WorkspaceProfileRecipe;
  context: WorkspaceBuildContext;
  sections: WorkspaceNavSection[];
  workspaceProfile: WorkspaceProfile;
}): { href: string; label: string } {
  const verticalProduct = resolveWorkspaceVerticalProductBundle({
    enabledFeatures: args.context.enabledFeatures,
    workspaceProfile: args.workspaceProfile,
  });
  const visibleItems = flattenVisibleItems(args.sections);
  // The recipe answers first: it is the only one of the two that can see who is
  // signed in, and the bundle's href is the product's front door rather than
  // this person's. Where a recipe names a fixed path the two agree anyway.
  const preferredHomeHref =
    resolveRecipeHomeHref(args.recipe, args.context.role) ?? verticalProduct.preferredHomeHref;
  const preferredItem = preferredHomeHref
    ? visibleItems.find((item) => item.href === preferredHomeHref) ?? null
    : null;
  const generalDashboardItem =
    args.recipe === WORKSPACE_PROFILE_RECIPES.GENERAL
      ? getGeneralDashboardItem(args.context)
      : null;
  const fallbackItem = preferredItem ?? generalDashboardItem ?? visibleItems[0] ?? getSupportItems(args.context)[0] ?? SUPPORT_ITEMS[0];

  return {
    href: fallbackItem.href,
    label: fallbackItem.label,
  };
}

export function getWorkspaceHomeHref(profile: string | null | undefined): string {
  // No role to read here, so a per-persona recipe answers with its default.
  return resolveRecipeHomeHref(getWorkspaceProfileRecipe(normalizeWorkspaceProfile(profile)), null)
    ?? resolveWorkspaceVerticalProductBundle({
      enabledFeatures: undefined,
      workspaceProfile: profile,
    }).preferredHomeHref
    ?? "/dashboard";
}

export function getComputedWorkspaceHomeHref(args: WorkspaceModelArgs): string {
  return getWorkspaceSidebarModel(args).homeHref;
}

export function getWorkspaceSidebarModel(args: WorkspaceModelArgs): WorkspaceSidebarModel {
  const requestedProfile = normalizeWorkspaceProfile(args.workspaceProfile);
  // `normalizeWorkspaceProfileInput` returns null for absent or unrecognised
  // input, which is the only way to tell "nothing set" from a deliberate
  // "GENERAL". See the parameter note on `resolveEffectiveWorkspaceProfile`.
  const profileWasStated = normalizeWorkspaceProfileInput(args.workspaceProfile) !== null;
  const context = buildContext(args);
  const allVisibleModules = getVisibleModules(context);
  const workspaces = workspaceOptionsFor(allVisibleModules, context);
  const tenantProfile = resolveEffectiveWorkspaceProfile(
    args.enabledFeatures,
    requestedProfile,
    allVisibleModules,
    profileWasStated,
  );
  /*
    One workspace is the ordinary case, and nothing about it moves: the rail is
    the tenant's whole platform, resolved exactly as it was before any of this.

    Two is the case this exists for. A tenant running a school *and* a shop used
    to get both in one column — nine campus areas and seventeen retail rows,
    most of them under the fold — because the arrangement had no way to say
    "these are two jobs". Now the active workspace decides what the rail holds
    and what it is called, and the company mark switches between them.
  */
  const isSplit = workspaces.length > 1;
  const activeWorkspace = pickWorkspace(workspaces, args.activeWorkspaceId, tenantProfile);
  /** A vertical of a split tenant; the back office is not one. */
  const verticalOnly = isSplit && activeWorkspace.moduleId !== null;
  // The back office keeps the tenant's own profile, so a bureau's Month end and
  // Statutory survive the split — they are shared work, and the arrangement
  // that curated them is still the right one for them.
  const profile = verticalOnly
    ? WORKSPACE_OWNER_PROFILES[activeWorkspace.moduleId!] ?? "GENERAL"
    : tenantProfile;
  const recipe = getWorkspaceProfileRecipe(profile);
  const visibleModules = isSplit
    ? scopeModulesToWorkspace(allVisibleModules, activeWorkspace, recipe)
    : allVisibleModules;
  const verticalProduct = resolveWorkspaceVerticalProductBundle({
    enabledFeatures: args.enabledFeatures,
    workspaceProfile: profile,
  });
  const primarySections = getPrimarySections(recipe, visibleModules, verticalProduct, verticalOnly);
  const usedPrimaryHrefs = collectSectionHrefs(primarySections);
  const canonicalAdditionalSections =
    recipe === WORKSPACE_PROFILE_RECIPES.RETAIL
      ? buildCanonicalCoreSections(
          visibleModules,
          usedPrimaryHrefs,
          verticalProduct,
          "additional",
        )
      : [];
  const additionalSections = verticalOnly || recipe === WORKSPACE_PROFILE_RECIPES.GENERAL
    ? []
    : [
        ...canonicalAdditionalSections,
        ...buildAdditionalSections(recipe, visibleModules, usedPrimaryHrefs, verticalProduct),
      ];
  const sections = [...primarySections, ...additionalSections];
  const homeTarget = getHomeTarget({
    recipe,
    context,
    sections,
    workspaceProfile: profile,
  });

  return {
    homeHref: homeTarget.href,
    homeLabel: homeTarget.label,
    // A split tenant's rail is named for the workspace it is showing. The
    // bundle cannot do it: resolved from the tenant's whole feature set, it
    // answers the same thing on either side of the switcher — which is how the
    // back office ended up captioned "Sales & CRM". An unsplit tenant is the
    // whole platform and keeps the name it has always had.
    workspaceLabel: isSplit
      ? activeWorkspace.label
      : verticalProduct.workspaceLabel || recipe.label,
    workspaceIcon: WORKSPACE_PROFILE_ICONS[profile] ?? Dashboard,
    quickActions: getQuickActions({
      role: args.role,
      enabledFeatures: args.enabledFeatures,
      workspaceProfile: profile,
    }),
    sections,
    supportItems: getSupportItems(context),
    workspaces,
    activeWorkspaceId: activeWorkspace.id,
  };
}
