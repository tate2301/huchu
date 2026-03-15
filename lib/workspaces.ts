import { ACCOUNTING_TABS } from "@/lib/accounting/tab-config";
import { filterAccountingTabsByFeatures } from "@/lib/accounting/visibility";
import type { NavItem, NavSection } from "@/lib/navigation";
import { getNavSectionsForRole } from "@/lib/navigation";
import { filterHrefItemsByEnabledFeatures, filterNavSectionsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";
import { hasRole, type UserRole } from "@/lib/roles";
import {
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
import { managementModuleItems } from "@/lib/settings/management-nav";

export const WORKSPACE_PROFILES = [
  "GOLD_MINE",
  "SCRAP_METAL",
  "SCHOOLS",
  "AUTOS",
  "THRIFT",
  "GENERAL",
] as const;

export type WorkspaceProfile = (typeof WORKSPACE_PROFILES)[number];
export type WorkspaceSectionGroup = "primary" | "additional";
export type WorkspaceModuleId =
  | "gold"
  | "scrap-metal"
  | "schools"
  | "car-sales"
  | "thrift"
  | "hr"
  | "stores"
  | "maintenance"
  | "reporting"
  | "cctv"
  | "accounting"
  | "management";

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
const CORE_MODULE_IDS: readonly WorkspaceModuleId[] = ["accounting", "management"];
const WORKSPACE_MODULE_ORDER: readonly WorkspaceModuleId[] = [
  "gold",
  "scrap-metal",
  "schools",
  "car-sales",
  "thrift",
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
    label: "Gold Control",
    sectionId: "gold",
    homeHref: "/gold",
  }),
  "scrap-metal": createSectionModule({
    id: "scrap-metal",
    label: "Scrap Metal",
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
  thrift: createSectionModule({
    id: "thrift",
    label: "Smart Shop",
    sectionId: "thrift",
    homeHref: "/thrift",
  }),
  hr: createSectionModule({
    id: "hr",
    label: "Human Resources",
    sectionId: "hr",
    homeHref: "/human-resources",
  }),
  stores: createSectionModule({
    id: "stores",
    label: "Stock",
    sectionId: "stores",
    homeHref: "/stores/dashboard",
  }),
  maintenance: createSectionModule({
    id: "maintenance",
    label: "Assets",
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
      return filterHrefItemsByEnabledFeatures(managementModuleItems, context.enabledFeatures).map((item) => ({
        href: item.href,
        label: item.label,
        icon: item.icon ?? FileText,
      }));
    },
  },
};

const WORKSPACE_PROFILE_RECIPES: Record<WorkspaceProfile, WorkspaceProfileRecipe> = {
  GOLD_MINE: {
    label: "Gold Mine",
    preferredHomeHref: "/gold",
    quickActions: [
      roleItem("/gold/intake/pours/new", "Log Gold Output", Payments, ["SUPERADMIN", "MANAGER"]),
      roleItem("/gold/intake/purchases/new", "Record Purchase", Coins, ["SUPERADMIN", "MANAGER"]),
      roleItem("/gold/transit/dispatches/new", "Record Dispatch", LocalShipping, ["SUPERADMIN", "MANAGER"]),
      roleItem("/gold/settlement/receipts/new", "Record Receipt", ReceiptLong, ["SUPERADMIN", "MANAGER"]),
    ],
    nativeModules: ["gold", "hr", "reporting"],
    sections: [
      {
        id: "gold-operations",
        title: "Operations",
        refs: [
          { moduleId: "gold", href: "/gold" },
          { moduleId: "gold", href: "/gold/intake/pours/new" },
          { moduleId: "gold", href: "/gold/intake/purchases/new" },
        ],
      },
      {
        id: "gold-chain",
        title: "Transit & Settlement",
        refs: [
          { moduleId: "gold", href: "/gold/transit/dispatches/new" },
          { moduleId: "gold", href: "/gold/settlement/receipts/new" },
          { moduleId: "hr", href: "/human-resources/payouts" },
        ],
      },
      {
        id: "gold-control",
        title: "Control Room",
        refs: [
          { moduleId: "reporting", href: "/reports/gold-chain" },
          { moduleId: "reporting", href: "/reports/gold-receipts" },
        ],
      },
    ],
  },
  SCRAP_METAL: {
    label: "Scrap Metal",
    preferredHomeHref: "/scrap-metal",
    quickActions: [
      roleItem("/scrap-metal/purchases", "Record Purchase", Payments),
      roleItem("/scrap-metal/batches", "Open Batch", Package),
      roleItem("/scrap-metal/sales", "Record Sale", ReceiptLong, ["SUPERADMIN", "MANAGER"]),
    ],
    nativeModules: ["scrap-metal", "hr", "reporting"],
    sections: [
      {
        id: "scrap-buying",
        title: "Buying",
        refs: [
          { moduleId: "scrap-metal", href: "/scrap-metal" },
          { moduleId: "scrap-metal", href: "/scrap-metal/purchases" },
          { moduleId: "scrap-metal", href: "/scrap-metal/pricing" },
        ],
      },
      {
        id: "scrap-yard",
        title: "Yard & Batches",
        refs: [
          { moduleId: "scrap-metal", href: "/scrap-metal/batches" },
          { moduleId: "reporting", href: "/reports" },
        ],
      },
      {
        id: "scrap-sales",
        title: "Sales & Finance",
        refs: [
          { moduleId: "scrap-metal", href: "/scrap-metal/sales" },
        ],
      },
      {
        id: "scrap-people",
        title: "Team & Settlements",
        refs: [
          { moduleId: "hr", href: "/human-resources" },
          { moduleId: "hr", href: "/human-resources/payouts" },
        ],
      },
    ],
  },
  SCHOOLS: {
    label: "Schools",
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
        title: "Campus",
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
        title: "Operations",
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
  THRIFT: {
    label: "Smart Shop",
    preferredHomeHref: "/thrift",
    quickActions: [
      roleItem("/thrift/intake", "Intake", Package),
      roleItem("/thrift/catalog", "Catalog", TableRows),
      roleItem("/thrift/sales", "Sales", ReceiptLong),
    ],
    nativeModules: ["thrift"],
    sections: [
      {
        id: "thrift-floor",
        title: "Floor",
        refs: [
          { moduleId: "thrift", href: "/thrift" },
          { moduleId: "thrift", href: "/thrift/intake" },
          { moduleId: "thrift", href: "/thrift/catalog" },
        ],
      },
      {
        id: "thrift-commerce",
        title: "Commerce",
        refs: [
          { moduleId: "thrift", href: "/thrift/sales" },
          { moduleId: "thrift", href: "/portal/pos" },
        ],
      },
    ],
  },
  GENERAL: {
    label: "Operations",
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
  if (normalized.includes("THRIFT")) return "THRIFT";
  if (normalized.includes("CORE") || normalized.includes("ALL_FEATURES")) return "GENERAL";
  return null;
}

function filterNavItemsByRole(items: NavItem[], role: string | null | undefined): NavItem[] {
  return items.filter((item) => (item.roles ? hasRole(role, item.roles) : true));
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
  const entries = WORKSPACE_MODULE_ORDER.map((moduleId) => {
    const moduleDefinition = WORKSPACE_MODULES[moduleId];
    return [moduleId, moduleDefinition.getItems(context)] as const;
  }).filter((entry) => entry[1].length > 0);

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

function buildModuleSection(
  moduleId: WorkspaceModuleId,
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
  workspaceGroup: WorkspaceSectionGroup,
): WorkspaceNavSection | null {
  const items = visibleModules.get(moduleId) ?? [];
  if (items.length === 0) return null;

  return {
    id: moduleId,
    title: WORKSPACE_MODULES[moduleId].label,
    items,
    workspaceGroup,
  };
}

function buildGeneralSections(visibleModules: Map<WorkspaceModuleId, NavItem[]>): WorkspaceNavSection[] {
  return WORKSPACE_MODULE_ORDER
    .map((moduleId) => buildModuleSection(moduleId, visibleModules, "primary"))
    .filter((section): section is WorkspaceNavSection => section !== null);
}

function buildCanonicalCoreSections(
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
): WorkspaceNavSection[] {
  return CORE_MODULE_IDS
    .map((moduleId) => buildModuleSection(moduleId, visibleModules, "primary"))
    .filter((section): section is WorkspaceNavSection => section !== null);
}

function buildAdditionalSections(
  recipe: WorkspaceProfileRecipe,
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
): WorkspaceNavSection[] {
  return WORKSPACE_MODULE_ORDER
    .filter(
      (moduleId) =>
        !recipe.nativeModules.includes(moduleId) &&
        !CORE_MODULE_IDS.includes(moduleId) &&
        visibleModules.has(moduleId),
    )
    .map((moduleId) => buildModuleSection(moduleId, visibleModules, "additional"))
    .filter((section): section is WorkspaceNavSection => section !== null);
}

function getPrimarySections(
  recipe: WorkspaceProfileRecipe,
  visibleModules: Map<WorkspaceModuleId, NavItem[]>,
): WorkspaceNavSection[] {
  if (recipe === WORKSPACE_PROFILE_RECIPES.GENERAL) {
    return buildGeneralSections(visibleModules);
  }

  return [
    ...buildProfileSections(recipe, visibleModules),
    ...buildCanonicalCoreSections(visibleModules),
  ];
}

function getSupportItems(context: WorkspaceBuildContext): NavItem[] {
  const overviewSection = context.navSectionById.get("overview");
  return overviewSection?.items.filter((item) => item.href !== "/") ?? SUPPORT_ITEMS;
}

function getQuickActions(
  context: WorkspaceBuildContext,
  recipe: WorkspaceProfileRecipe,
): NavItem[] {
  if (recipe === WORKSPACE_PROFILE_RECIPES.GENERAL) {
    return context.navSectionById.get("daily")?.items ?? [];
  }

  return filterHrefItemsByEnabledFeatures(
    filterNavItemsByRole(recipe.quickActions, context.role),
    context.enabledFeatures,
  );
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
}): { href: string; label: string } {
  const visibleItems = flattenVisibleItems(args.sections);
  const preferredItem = args.recipe.preferredHomeHref
    ? visibleItems.find((item) => item.href === args.recipe.preferredHomeHref) ?? null
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
  return WORKSPACE_PROFILE_RECIPES[normalizeWorkspaceProfile(profile)].preferredHomeHref ?? "/dashboard";
}

export function getComputedWorkspaceHomeHref(args: WorkspaceModelArgs): string {
  return getWorkspaceSidebarModel(args).homeHref;
}

export function getWorkspaceSidebarModel(args: WorkspaceModelArgs): WorkspaceSidebarModel {
  const profile = normalizeWorkspaceProfile(args.workspaceProfile);
  const recipe = WORKSPACE_PROFILE_RECIPES[profile];
  const context = buildContext(args);
  const visibleModules = getVisibleModules(context);
  const primarySections = getPrimarySections(recipe, visibleModules);
  const additionalSections = recipe === WORKSPACE_PROFILE_RECIPES.GENERAL
    ? []
    : buildAdditionalSections(recipe, visibleModules);
  const sections = [...primarySections, ...additionalSections];
  const homeTarget = getHomeTarget({
    recipe,
    context,
    sections,
  });

  return {
    homeHref: homeTarget.href,
    homeLabel: homeTarget.label,
    workspaceLabel: recipe.label,
    quickActions: getQuickActions(context, recipe),
    sections,
    supportItems: getSupportItems(context),
  };
}
