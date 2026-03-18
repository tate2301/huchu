import { ACCOUNTING_TABS } from "@/lib/accounting/tab-config";
import { filterAccountingTabsByFeatures } from "@/lib/accounting/visibility";
import type { NavItem, NavSection } from "@/lib/navigation";
import { getNavSectionsForRole } from "@/lib/navigation";
import { normalizeFeatureKey } from "@/lib/platform/gating/catalog-utils";
import { filterNavSectionsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";
import { getPrimaryQuickActions } from "@/lib/primary-actions";
import type { UserRole } from "@/lib/roles";
import {
  resolveWorkspaceVerticalProductBundle,
  type VerticalProductBundleDefinition,
  WORKSPACE_PROFILES,
  type WorkspaceModuleId,
  type WorkspaceProfile,
} from "@/lib/workspace-products";
import {
  ArrowDownward,
  Building2,
  Calendar,
  Coins,
  FileText,
  LocalShipping,
  Package,
  Payments,
  ReceiptLong,
  TableRows,
  Users,
  Wallet,
  type LucideIcon,
} from "@/lib/icons";
import { RETAIL_OPERATIONS_SECTIONS } from "@/lib/retail/tab-config";
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

const DEFAULT_WORKSPACE_PROFILE: WorkspaceProfile = "GOLD_MINE";
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
  retail: createSectionModule({
    id: "retail",
    label: "Retail",
    sectionId: "retail",
    homeHref: "/retail",
  }),
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
      return getVisibleManagementModuleItems(context.enabledFeatures).map((item) => ({
        href: item.href,
        label: item.label,
        icon: item.icon ?? FileText,
      }));
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
      roleItem("/scrap-metal/buying/purchases", "Record Purchase", Payments),
      roleItem("/scrap-metal/yard/batches", "Open Batch", Package),
      roleItem("/scrap-metal/trading/sales", "Record Sale", ReceiptLong, ["SUPERADMIN", "MANAGER"]),
      roleItem("/stores/receive", "Receive Stock", ArrowDownward),
    ],
    nativeModules: ["scrap-metal", "reporting"],
    sections: [
      {
        id: "scrap-overview",
        title: "Overview",
        refs: [{ moduleId: "scrap-metal", href: "/scrap-metal" }],
      },
      {
        id: "scrap-buying",
        title: "Buying",
        refs: SCRAP_OPERATIONS_SECTIONS.buying.map((href) => ({ moduleId: "scrap-metal" as const, href })),
      },
      {
        id: "scrap-yard",
        title: "Yard",
        refs: SCRAP_OPERATIONS_SECTIONS.yard.map((href) => ({ moduleId: "scrap-metal" as const, href })),
      },
      {
        id: "scrap-trading",
        title: "Trading",
        refs: SCRAP_OPERATIONS_SECTIONS.trading.map((href) => ({ moduleId: "scrap-metal" as const, href })),
      },
      {
        id: "scrap-settlements",
        title: "Settlements",
        refs: SCRAP_OPERATIONS_SECTIONS.settlements.map((href) => ({ moduleId: "scrap-metal" as const, href })),
      },
      {
        id: "scrap-reports",
        title: "Reports",
        refs: SCRAP_OPERATIONS_SECTIONS.reporting.map((href) => ({ moduleId: "scrap-metal" as const, href })),
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
        roleItem("/portal/pos", "Point of Sale", Payments),
        roleItem("/retail/sales", "Sales", ReceiptLong),
        roleItem("/retail/catalog", "Catalog", TableRows),
        roleItem("/retail/purchasing/orders", "Purchase Order", ReceiptLong),
        roleItem("/retail/shifts", "Shifts & Cash-up", Wallet),
      ],
    nativeModules: ["retail", "reporting"],
    sections: [
      {
        id: "retail-overview",
        title: "Overview",
        refs: RETAIL_OPERATIONS_SECTIONS.overview.map((href) => ({ moduleId: "retail" as const, href })),
      },
        {
          id: "retail-pos",
          title: "Point of Sale",
          refs: RETAIL_OPERATIONS_SECTIONS.pos.map((href) => ({ moduleId: "retail" as const, href })),
        },
        {
          id: "retail-sales",
          title: "Sales",
          refs: RETAIL_OPERATIONS_SECTIONS.sales.map((href) => ({ moduleId: "retail" as const, href })),
        },
        {
          id: "retail-catalog",
          title: "Catalog",
          refs: RETAIL_OPERATIONS_SECTIONS.catalog.map((href) => ({ moduleId: "retail" as const, href })),
        },
      {
        id: "retail-purchasing",
        title: "Purchasing",
        refs: RETAIL_OPERATIONS_SECTIONS.purchasing.map((href) => ({ moduleId: "retail" as const, href })),
      },
      {
        id: "retail-merchandising",
        title: "Merchandising",
        refs: RETAIL_OPERATIONS_SECTIONS.merchandising.map((href) => ({ moduleId: "retail" as const, href })),
      },
        {
          id: "retail-shifts",
          title: "Shifts & Cash-up",
          refs: RETAIL_OPERATIONS_SECTIONS.shifts.map((href) => ({ moduleId: "retail" as const, href })),
        },
      {
        id: "retail-reports",
        title: "Reports",
        refs: RETAIL_OPERATIONS_SECTIONS.reporting.map((href) => ({ moduleId: "retail" as const, href })),
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
): WorkspaceNavSection[] {
  return getOrderedModuleIds(verticalProduct)
    .filter((moduleId): moduleId is WorkspaceModuleId => CANONICAL_MODULE_IDS.includes(moduleId))
    .map((moduleId) => buildModuleSection(moduleId, visibleModules, "primary", excludedHrefs))
    .filter((section): section is WorkspaceNavSection => section !== null);
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

  return [
    ...profileSections,
    ...buildCanonicalCoreSections(visibleModules, usedHrefs, verticalProduct),
  ];
}

function resolveEffectiveWorkspaceProfile(
  requestedProfile: WorkspaceProfile,
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
): WorkspaceProfile {
  if (requestedProfile === "GENERAL") {
    return requestedProfile;
  }

  const ownerModule = PROFILE_OWNER_MODULES[requestedProfile];
  return visibleModules.has(ownerModule) ? requestedProfile : "GENERAL";
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
  const profile = resolveEffectiveWorkspaceProfile(requestedProfile, visibleModules);
  const recipe = WORKSPACE_PROFILE_RECIPES[profile];
  const verticalProduct = resolveWorkspaceVerticalProductBundle({
    enabledFeatures: args.enabledFeatures,
    workspaceProfile: profile,
  });
  const primarySections = getPrimarySections(recipe, visibleModules, verticalProduct);
  const usedPrimaryHrefs = collectSectionHrefs(primarySections);
  const additionalSections = recipe === WORKSPACE_PROFILE_RECIPES.GENERAL
    ? []
    : buildAdditionalSections(recipe, visibleModules, usedPrimaryHrefs, verticalProduct);
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
    workspaceLabel: verticalProduct.workspaceLabel || recipe.label,
    quickActions: getQuickActions({
      role: args.role,
      enabledFeatures: args.enabledFeatures,
      workspaceProfile: profile,
    }),
    sections,
    supportItems: getSupportItems(context),
  };
}
