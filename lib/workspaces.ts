import { ACCOUNTING_OPERATIONS_SECTIONS, ACCOUNTING_TABS } from "@/lib/accounting/tab-config";
import { filterAccountingTabsByFeatures } from "@/lib/accounting/visibility";
import type { NavItem, NavSection } from "@/lib/navigation";
import { getNavSectionsForRole } from "@/lib/navigation";
import { normalizeFeatureKey } from "@/lib/platform/gating/catalog-utils";
import { filterNavSectionsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";
import { getPrimaryQuickActions } from "@/lib/primary-actions";
import type { UserRole } from "@/lib/roles";
import {
  inferWorkspaceProfileFromEnabledFeatures,
  resolveWorkspaceVerticalProductBundle,
  type VerticalProductBundleDefinition,
  WORKSPACE_PROFILES,
  type WorkspaceModuleId,
  type WorkspaceProfile,
} from "@/lib/workspace-products";
import {
  ArrowDownward,
  ClipboardList,
  Dashboard,
  Gem,
  Building2,
  Calendar,
  BarChart3,
  Coins,
  FileText,
  LocalShipping,
  MedusaAcademicCapIcon,
  MedusaBuildingStorefrontIcon,
  MedusaDirectionsIcon,
  Package,
  Payments,
  Recycle,
  ReceiptLong,
  Scale,
  TableRows,
  Users,
  Wallet,
  type LucideIcon,
} from "@/lib/icons";
import { getVisibleManagementModuleItems } from "@/lib/settings/management-nav";
import { SCRAP_OPERATIONS_SECTIONS } from "@/lib/scrap-metal/tab-config";

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
};

type WorkspaceModelArgs = {
  role: string | null | undefined;
  enabledFeatures: string[] | undefined;
  workspaceProfile: string | null | undefined;
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
};

type WorkspaceProfileSectionSpec = {
  id: string;
  title: string;
  refs: Array<{
    moduleId: WorkspaceModuleId;
    href: string;
  }>;
};

type WorkspaceProfileRecipe = {
  label: string;
  preferredHomeHref: string | null;
  quickActions: NavItem[];
  nativeModules: WorkspaceModuleId[];
  sections: WorkspaceProfileSectionSpec[];
};

const DEFAULT_WORKSPACE_PROFILE: WorkspaceProfile = "GENERAL";
const CANONICAL_MODULE_IDS: readonly WorkspaceModuleId[] = ["hr", "accounting", "management"];
const STRICT_WORKSPACE_MODULE_FEATURE_KEYS: Partial<Record<WorkspaceModuleId, string>> = {
  "scrap-metal": "scrap-metal.home",
};
const PROFILE_OWNER_MODULES: Record<Exclude<WorkspaceProfile, "GENERAL">, WorkspaceModuleId> = {
  GOLD_MINE: "gold",
  SCRAP_METAL: "scrap-metal",
  SCHOOLS: "schools",
  AUTOS: "car-sales",
  RETAIL: "retail",
};
const WORKSPACE_PROFILE_ICONS: Record<WorkspaceProfile, LucideIcon> = {
  GOLD_MINE: Gem,
  SCRAP_METAL: Recycle,
  SCHOOLS: MedusaAcademicCapIcon,
  AUTOS: MedusaDirectionsIcon,
  RETAIL: MedusaBuildingStorefrontIcon,
  GENERAL: Dashboard,
};
const WORKSPACE_MODULE_ORDER: readonly WorkspaceModuleId[] = [
  "gold",
  "scrap-metal",
  "schools",
  "car-sales",
  "retail",
  "hr",
  "stores",
  "maintenance",
  "accounting",
  "management",
  "reporting",
  "cctv",
];

const SUPPORT_ITEMS: NavItem[] = [
  { href: "/help", icon: FileText, label: "Quick Tips" },
];

function roleItem(
  href: string,
  label: string,
  icon: LucideIcon,
  roles?: UserRole[],
): NavItem {
  return { href, label, icon, roles };
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
  };
}

const WORKSPACE_MODULES: Record<WorkspaceModuleId, WorkspaceModuleDefinition> = {
  gold: createSectionModule({
    id: "gold",
    label: "Gold Operations",
    sectionId: "gold",
    homeHref: "/gold",
  }),
  "scrap-metal": createSectionModule({
    id: "scrap-metal",
    label: "Scrap & Recycling",
    sectionId: "scrap-metal",
    homeHref: "/scrap-metal",
  }),
  schools: createSectionModule({
    id: "schools",
    label: "School Operations",
    sectionId: "schools",
    homeHref: "/schools",
  }),
  "car-sales": createSectionModule({
    id: "car-sales",
    label: "Auto Sales",
    sectionId: "car-sales",
    homeHref: "/car-sales",
  }),
  retail: {
    id: "retail",
    label: "Retail",
    homeHref: "/retail",
    getItems(context) {
      const baseItems = context.navSectionById.get("retail")?.items ?? [];
      const has = (href: string) => baseItems.some((item) => item.href === href);
      const items: NavItem[] = [];

      if (has("/retail")) {
        items.push({ href: "/retail", label: "Overview", icon: Wallet });
      }
      if (has("/retail/sell")) {
        items.push(
          { href: "/portal/pos", label: "Open POS", icon: Payments },
          { href: "/retail/sales", label: "Sales", icon: ClipboardList },
        );
      }
      if (has("/retail/customers")) {
        items.push({ href: "/retail/customers", label: "Customers", icon: Users });
      }
      if (has("/retail/cash-control")) {
        items.push({ href: "/retail/shifts", label: "Shifts", icon: ReceiptLong });
      }
      if (has("/retail/merchandise")) {
        items.push(
          { href: "/retail/catalog", label: "Catalog", icon: TableRows },
          { href: "/retail/merchandising/pricing", label: "Pricing", icon: Coins },
          { href: "/retail/merchandising/promotions", label: "Promotions", icon: ReceiptLong },
        );
      }
      if (has("/retail/stock")) {
        items.push(
          { href: "/retail/stock", label: "Stock Overview", icon: Package },
          { href: "/retail/stock/count", label: "Stock Count", icon: ClipboardList },
          { href: "/retail/stock/transfers", label: "Transfers", icon: ArrowDownward },
        );
      }
      if (has("/retail/buy")) {
        items.push(
          { href: "/retail/purchasing/orders", label: "Purchase Orders", icon: Package },
          { href: "/retail/purchasing/receipts", label: "Goods Receipts", icon: LocalShipping },
        );
      }
      if (has("/retail/insights")) {
        items.push({ href: "/retail/reports", label: "Reports", icon: BarChart3 });
      }
      if (has("/retail/setup")) {
        items.push(
          { href: "/retail/setup", label: "Setup Overview", icon: Building2 },
          { href: "/retail/setup/operations", label: "Operations", icon: Building2 },
          { href: "/retail/setup/branding", label: "Branding", icon: Building2 },
          { href: "/retail/setup/pos-policy", label: "POS Policy", icon: Scale },
          { href: "/retail/setup/accounting", label: "Accounting Setup", icon: Scale },
        );
      }

      return items;
    },
  },
  hr: createSectionModule({
    id: "hr",
    label: "Human Resources",
    sectionId: "hr",
    homeHref: "/human-resources",
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
  cctv: createSectionModule({
    id: "cctv",
    label: "CCTV",
    sectionId: "cctv",
    homeHref: "/cctv/overview",
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
      const items = getVisibleManagementModuleItems(context.enabledFeatures).map((item) => ({
        href: item.href,
        label: item.label,
        icon: item.icon ?? FileText,
      }));

      if (
        (context.enabledFeatures ?? []).some(
          (feature) => normalizeFeatureKey(feature) === "scrap-metal.pricing",
        ) &&
        !items.some((item) => item.href === "/scrap-metal/pricing")
      ) {
        const masterDataIndex = items.findIndex((item) =>
          item.href.startsWith("/management/master-data"),
        );
        const priceBoardItem = {
          href: "/scrap-metal/pricing",
          label: "Price Board",
          icon: Coins,
        };

        if (masterDataIndex === -1) {
          items.unshift(priceBoardItem);
        } else {
          items.splice(masterDataIndex + 1, 0, priceBoardItem);
        }
      }

      return items;
    },
  },
};

const WORKSPACE_PROFILE_RECIPES: Record<WorkspaceProfile, WorkspaceProfileRecipe> = {
  GOLD_MINE: {
    label: "Gold Operations",
    preferredHomeHref: "/gold",
    quickActions: [
      roleItem("/gold/intake/pours/new", "Log Gold Output", Payments, ["SUPERADMIN", "MANAGER"]),
      roleItem("/gold/intake/purchases/new", "Record Purchase", Coins, ["SUPERADMIN", "MANAGER"]),
      roleItem("/gold/transit/dispatches/new", "Record Dispatch", LocalShipping, ["SUPERADMIN", "MANAGER"]),
      roleItem("/gold/settlement/receipts/new", "Record Receipt", ReceiptLong, ["SUPERADMIN", "MANAGER"]),
    ],
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
          { moduleId: "hr", href: "/human-resources/payouts" },
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
  SCRAP_METAL: {
    label: "Scrap & Recycling",
    preferredHomeHref: "/scrap-metal",
    quickActions: [
      roleItem("/scrap-metal/tickets", "New Inbound Ticket", Payments),
      roleItem("/scrap-metal/batches", "Open Lot", Package),
      roleItem("/scrap-metal/sales", "New Outbound Ticket", ReceiptLong),
      roleItem("/scrap-metal/tickets/held", "Held Tickets", Wallet),
      roleItem("/stores/receive", "Receive Stock", ArrowDownward),
    ],
    nativeModules: ["scrap-metal", "reporting"],
    sections: [
      {
        id: "scrap-ticketing",
        title: "Ticketing",
        refs: SCRAP_OPERATIONS_SECTIONS.ticketing.map((href) => ({ moduleId: "scrap-metal" as const, href })),
      },
      {
        id: "scrap-lots",
        title: "Lots",
        refs: SCRAP_OPERATIONS_SECTIONS.lots.map((href) => ({ moduleId: "scrap-metal" as const, href })),
      },
      {
        id: "scrap-cash",
        title: "Cash & Settlements",
        refs: SCRAP_OPERATIONS_SECTIONS.cash.map((href) => ({ moduleId: "scrap-metal" as const, href })),
      },
      {
        id: "scrap-reports",
        title: "Reports",
        refs: SCRAP_OPERATIONS_SECTIONS.reporting.map((href) => ({ moduleId: "scrap-metal" as const, href })),
      },
      {
        id: "scrap-setup",
        title: "Setup",
        refs: SCRAP_OPERATIONS_SECTIONS.setup.map((href) => ({
          moduleId: href.startsWith("/management/") ? "management" as const : "scrap-metal" as const,
          href,
        })),
      },
    ],
  },
  SCHOOLS: {
    label: "School Operations",
    preferredHomeHref: "/schools",
    quickActions: [
      roleItem("/schools/admissions", "Admissions", Building2),
      roleItem("/schools/attendance", "Attendance", Calendar),
      roleItem("/schools/finance", "Finance", ReceiptLong),
    ],
    nativeModules: ["schools"],
    sections: [
      {
        id: "schools-campus",
        title: "Campus Operations",
        refs: [
          { moduleId: "schools", href: "/schools" },
          { moduleId: "schools", href: "/schools/students" },
          { moduleId: "schools", href: "/schools/teachers" },
          { moduleId: "schools", href: "/schools/boarding" },
        ],
      },
      {
        id: "schools-academics",
        title: "Academics",
        refs: [
          { moduleId: "schools", href: "/schools/academics" },
          { moduleId: "schools", href: "/schools/timetable" },
          { moduleId: "schools", href: "/schools/assessments" },
          { moduleId: "schools", href: "/schools/results/publish" },
        ],
      },
      {
        id: "schools-admin",
        title: "Administration",
        refs: [
          { moduleId: "schools", href: "/schools/admissions" },
          { moduleId: "schools", href: "/schools/attendance" },
          { moduleId: "schools", href: "/schools/finance" },
          { moduleId: "schools", href: "/schools/reports" },
        ],
      },
    ],
  },
  AUTOS: {
    label: "Auto Sales",
    preferredHomeHref: "/car-sales",
    quickActions: [
      roleItem("/car-sales/leads", "Leads", Users),
      roleItem("/car-sales/inventory", "Inventory", Package),
      roleItem("/car-sales/deals", "Deals", Wallet),
    ],
    nativeModules: ["car-sales"],
    sections: [
      {
        id: "autos-pipeline",
        title: "Pipeline",
        refs: [
          { moduleId: "car-sales", href: "/car-sales" },
          { moduleId: "car-sales", href: "/car-sales/leads" },
          { moduleId: "car-sales", href: "/car-sales/deals" },
        ],
      },
      {
        id: "autos-stock",
        title: "Stock & Finance",
        refs: [
          { moduleId: "car-sales", href: "/car-sales/inventory" },
          { moduleId: "car-sales", href: "/car-sales/financing" },
        ],
      },
    ],
  },
  RETAIL: {
    label: "Retail",
    preferredHomeHref: "/retail",
    quickActions: [
      roleItem("/portal/pos", "Open POS", Payments),
      roleItem("/retail/sales", "Sales", ReceiptLong),
      roleItem("/retail/stock/count", "Stock Count", Package),
      roleItem("/retail/purchasing/receipts", "Receive Stock", LocalShipping),
      roleItem("/retail/customers", "Customers", Users),
      roleItem("/retail/setup", "Setup", Building2),
    ],
    nativeModules: ["retail", "reporting"],
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
      {
        id: "retail-range",
        title: "Range & Stock",
        refs: [
          { moduleId: "retail", href: "/retail/catalog" },
          { moduleId: "retail", href: "/retail/merchandising/pricing" },
          { moduleId: "retail", href: "/retail/merchandising/promotions" },
          { moduleId: "retail", href: "/retail/stock" },
          { moduleId: "retail", href: "/retail/stock/count" },
          { moduleId: "retail", href: "/retail/stock/transfers" },
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
          { moduleId: "retail", href: "/retail/accounting" },
          { moduleId: "retail", href: "/retail/reports" },
          { moduleId: "retail", href: "/retail/setup" },
          { moduleId: "retail", href: "/retail/setup/operations" },
          { moduleId: "retail", href: "/retail/setup/pos-policy" },
          { moduleId: "retail", href: "/retail/setup/accounting" },
        ],
      },
    ],
  },
  GENERAL: {
    label: "General Business",
    preferredHomeHref: null,
    quickActions: [],
    nativeModules: [...WORKSPACE_MODULE_ORDER],
    sections: [],
  },
};

export function normalizeWorkspaceProfile(value: string | null | undefined): WorkspaceProfile {
  const normalized = String(value || "").trim().toUpperCase();

  if (normalized === "SCRAP" || normalized === "SCRAP-METAL" || normalized === "SCRAPMETAL") {
    return "SCRAP_METAL";
  }
  if (normalized === "GOLD" || normalized === "GOLD-MINE" || normalized === "GOLDMINE") {
    return "GOLD_MINE";
  }
  if (normalized === "SCHOOL" || normalized === "SCHOOLS") {
    return "SCHOOLS";
  }
  if (
    normalized === "AUTO" ||
    normalized === "CAR_SALES" ||
    normalized === "CAR-SALES" ||
    normalized === "CARSALES" ||
    normalized === "AUTOS"
  ) {
    return "AUTOS";
  }

  return WORKSPACE_PROFILES.find((profile) => profile === normalized) ?? DEFAULT_WORKSPACE_PROFILE;
}

export function getWorkspaceProfileForTemplate(code: string | null | undefined): WorkspaceProfile | null {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  if (normalized.includes("GOLD")) return "GOLD_MINE";
  if (normalized.includes("SCRAP")) return "SCRAP_METAL";
  if (normalized.includes("SCHOOL")) return "SCHOOLS";
  if (normalized.includes("AUTO") || normalized.includes("CAR_SALES") || normalized.includes("CAR-SALES")) return "AUTOS";
  if (normalized.includes("THRIFT") || normalized.includes("RETAIL")) return "RETAIL";
  if (normalized.includes("CORE") || normalized.includes("ALL_FEATURES")) return "GENERAL";
  return null;
}

function buildContext(args: WorkspaceModelArgs): WorkspaceBuildContext {
  const visibleNavSections = filterNavSectionsByEnabledFeatures(
    getNavSectionsForRole(args.role),
    args.enabledFeatures,
  );

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
        items.push(item);
      }

      return {
        id: section.id,
        title: section.title,
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

function buildModuleSection(
  moduleId: WorkspaceModuleId,
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
  workspaceGroup: WorkspaceSectionGroup,
  excludedHrefs?: Set<string>,
): WorkspaceNavSection | null {
  const items = (visibleModules.get(moduleId) ?? []).filter((item) => !excludedHrefs?.has(item.href));
  if (items.length === 0) return null;

  return {
    id: moduleId,
    title: WORKSPACE_MODULES[moduleId].label,
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
  if (moduleId === "scrap-metal") {
    const sections = buildProfileSections(WORKSPACE_PROFILE_RECIPES.SCRAP_METAL, visibleModules)
      .map((section) => ({
        ...section,
        workspaceGroup,
        items: section.items.filter((item) => !excludedHrefs?.has(item.href)),
      }))
      .filter((section) => section.items.length > 0);

    return sections;
  }

  if (moduleId === "accounting") {
    const buildAccountingSection = (
      id: string,
      title: string,
      hrefs: readonly string[],
    ): WorkspaceNavSection | null => {
      const items: NavItem[] = [];
      const moduleItems = visibleModules.get("accounting") ?? [];

      for (const href of hrefs) {
        if (excludedHrefs?.has(href)) continue;
        const item = moduleItems.find((i) => i.href === href);
        if (item) {
          items.push(item);
        }
      }

      if (items.length === 0) return null;

      return {
        id: `accounting-${id}`,
        title,
        items,
        workspaceGroup,
      };
    };

    return [
      buildAccountingSection("overview", "Overview", ACCOUNTING_OPERATIONS_SECTIONS.overview),
      buildAccountingSection("receivables", "Receivables", ACCOUNTING_OPERATIONS_SECTIONS.receivables),
      buildAccountingSection("payables", "Payables", ACCOUNTING_OPERATIONS_SECTIONS.payables),
      buildAccountingSection("reporting", "Financial Reporting", ACCOUNTING_OPERATIONS_SECTIONS.reporting),
      buildAccountingSection("banking", "Payments & Banking", ACCOUNTING_OPERATIONS_SECTIONS.banking),
      buildAccountingSection("master", "Accounting Master", ACCOUNTING_OPERATIONS_SECTIONS.master),
    ].filter((section): section is WorkspaceNavSection => section !== null);
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

function getPrimarySections(
  recipe: WorkspaceProfileRecipe,
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
  verticalProduct: VerticalProductBundleDefinition,
): WorkspaceNavSection[] {
  if (recipe === WORKSPACE_PROFILE_RECIPES.GENERAL) {
    return buildGeneralSections(visibleModules, verticalProduct);
  }

  const profileSections = buildProfileSections(recipe, visibleModules);
  const usedHrefs = collectSectionHrefs(profileSections);

  if (recipe === WORKSPACE_PROFILE_RECIPES.RETAIL) {
    return profileSections;
  }

  return [
    ...profileSections,
    ...buildCanonicalCoreSections(visibleModules, usedHrefs, verticalProduct, "primary"),
  ];
}

function resolveEffectiveWorkspaceProfile(
  enabledFeatures: string[] | undefined,
  requestedProfile: WorkspaceProfile,
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
): WorkspaceProfile {
  if (requestedProfile === "GENERAL") {
    return inferWorkspaceProfileFromEnabledFeatures(enabledFeatures) ?? requestedProfile;
  }

  const ownerModule = PROFILE_OWNER_MODULES[requestedProfile];
  if (visibleModules.has(ownerModule)) {
    return requestedProfile;
  }

  const inferredProfile = inferWorkspaceProfileFromEnabledFeatures(enabledFeatures);
  if (inferredProfile && inferredProfile !== "GENERAL") {
    const inferredOwnerModule = PROFILE_OWNER_MODULES[inferredProfile];
    if (visibleModules.has(inferredOwnerModule)) {
      return inferredProfile;
    }
  }

  for (const profile of WORKSPACE_PROFILES) {
    if (profile === "GENERAL") continue;
    const candidateModule = PROFILE_OWNER_MODULES[profile];
    if (visibleModules.has(candidateModule)) {
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
  });
}

function getGeneralDashboardItem(context: WorkspaceBuildContext): NavItem | null {
  const settingsSection = context.navSectionById.get("settings");
  return settingsSection?.items.find((item) => item.href === "/dashboard") ?? null;
}

function flattenVisibleItems(sections: WorkspaceNavSection[]): NavItem[] {
  return sections.flatMap((section) => section.items);
}

function isScrapOperatorExperienceRole(role: string | null | undefined): boolean {
  const normalized = String(role ?? "").trim().toUpperCase();
  return normalized === "OPERATOR" || normalized === "CLERK";
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
  const preferredHomeHref = verticalProduct.preferredHomeHref ?? args.recipe.preferredHomeHref;
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
  return resolveWorkspaceVerticalProductBundle({
    enabledFeatures: undefined,
    workspaceProfile: profile,
  }).preferredHomeHref
    ?? WORKSPACE_PROFILE_RECIPES[normalizeWorkspaceProfile(profile)].preferredHomeHref
    ?? "/dashboard";
}

export function getComputedWorkspaceHomeHref(args: WorkspaceModelArgs): string {
  return getWorkspaceSidebarModel(args).homeHref;
}

export function getWorkspaceSidebarModel(args: WorkspaceModelArgs): WorkspaceSidebarModel {
  const requestedProfile = normalizeWorkspaceProfile(args.workspaceProfile);
  const context = buildContext(args);
  const visibleModules = getVisibleModules(context);
  const profile = resolveEffectiveWorkspaceProfile(args.enabledFeatures, requestedProfile, visibleModules);
  const recipe = WORKSPACE_PROFILE_RECIPES[profile];
  const verticalProduct = resolveWorkspaceVerticalProductBundle({
    enabledFeatures: args.enabledFeatures,
    workspaceProfile: profile,
  });
  const primarySections = getPrimarySections(recipe, visibleModules, verticalProduct);
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
  const additionalSections = recipe === WORKSPACE_PROFILE_RECIPES.GENERAL
    ? []
    : [
        ...canonicalAdditionalSections,
        ...buildAdditionalSections(recipe, visibleModules, usedPrimaryHrefs, verticalProduct),
      ];
  const sections = [...primarySections, ...additionalSections].filter((section) => {
    if (
      profile === "SCRAP_METAL" &&
      isScrapOperatorExperienceRole(context.role) &&
      (section.id === "management" ||
        section.id === "hr" ||
        section.id === "accounting" ||
        section.id.startsWith("accounting-"))
    ) {
      return false;
    }
    return true;
  });
  const homeTarget = getHomeTarget({
    recipe,
    context,
    sections,
    workspaceProfile: profile,
  });

  return {
    homeHref: homeTarget.href,
    homeLabel: homeTarget.label,
    workspaceLabel: verticalProduct.workspaceLabel || recipe.label,
    workspaceIcon: WORKSPACE_PROFILE_ICONS[profile] ?? Dashboard,
    quickActions: getQuickActions({
      role: args.role,
      enabledFeatures: args.enabledFeatures,
      workspaceProfile: profile,
    }),
    sections,
    supportItems: getSupportItems(context),
  };
}
