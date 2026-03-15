import type { NavItem, NavSection } from "@/lib/navigation";
import { getNavSectionsForRole } from "@/lib/navigation";
import { filterHrefItemsByEnabledFeatures, filterNavSectionsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";
import { hasRole, type UserRole } from "@/lib/roles";
import {
  BarChart3,
  Building2,
  Calendar,
  Coins,
  Dashboard,
  FileCheck,
  FileText,
  Home,
  LocalShipping,
  ManageAccounts,
  Package,
  Payments,
  ReceiptLong,
  Recycle,
  Scale,
  ShieldCheck,
  TableRows,
  UserRound,
  Users,
  Wallet,
  Wrench,
} from "@/lib/icons";

export const WORKSPACE_PROFILES = [
  "GOLD_MINE",
  "SCRAP_METAL",
  "SCHOOLS",
  "AUTOS",
  "THRIFT",
  "GENERAL",
] as const;

export type WorkspaceProfile = (typeof WORKSPACE_PROFILES)[number];

export type WorkspaceSidebarModel = {
  homeHref: string;
  homeLabel: string;
  workspaceLabel: string;
  quickActions: NavItem[];
  sections: NavSection[];
  supportItems: NavItem[];
};

type WorkspaceDefinition = {
  label: string;
  homeHref: string;
  quickActions: NavItem[];
  sections: NavSection[];
  supportItems?: NavItem[];
};

const DEFAULT_WORKSPACE_PROFILE: WorkspaceProfile = "GOLD_MINE";

const SUPPORT_ITEMS: NavItem[] = [
  { href: "/help", icon: FileText, label: "Quick Tips" },
];

function roleItem(
  href: string,
  label: string,
  icon: NavItem["icon"],
  roles?: UserRole[],
): NavItem {
  return { href, label, icon, roles };
}

const WORKSPACE_DEFINITIONS: Record<WorkspaceProfile, WorkspaceDefinition> = {
  GOLD_MINE: {
    label: "Gold Mine",
    homeHref: "/gold",
    quickActions: [
      roleItem("/gold/intake/pours/new", "Log Gold Output", Payments, ["SUPERADMIN", "MANAGER"]),
      roleItem("/gold/intake/purchases/new", "Record Purchase", Coins, ["SUPERADMIN", "MANAGER"]),
      roleItem("/gold/transit/dispatches/new", "Record Dispatch", LocalShipping, ["SUPERADMIN", "MANAGER"]),
      roleItem("/gold/settlement/receipts/new", "Record Receipt", ReceiptLong, ["SUPERADMIN", "MANAGER"]),
    ],
    sections: [
      {
        id: "gold-operations",
        title: "Operations",
        items: [
          roleItem("/gold", "Gold Home", Coins),
          roleItem("/gold/intake/pours/new", "Log Output", Payments, ["SUPERADMIN", "MANAGER"]),
          roleItem("/gold/intake/purchases/new", "Purchases", Wallet, ["SUPERADMIN", "MANAGER"]),
        ],
      },
      {
        id: "gold-chain",
        title: "Transit & Settlement",
        items: [
          roleItem("/gold/transit/dispatches/new", "Dispatches", LocalShipping, ["SUPERADMIN", "MANAGER"]),
          roleItem("/gold/settlement/receipts/new", "Receipts", ReceiptLong, ["SUPERADMIN", "MANAGER"]),
          roleItem("/human-resources/payouts", "Worker Settlements", Coins),
        ],
      },
      {
        id: "gold-control",
        title: "Control Room",
        items: [
          roleItem("/reports/gold-chain", "Gold Reports", BarChart3),
          roleItem("/reports/gold-receipts", "Receipts Report", FileCheck),
          roleItem("/management/users", "Access Control", UserRound, ["SUPERADMIN", "MANAGER"]),
        ],
      },
    ],
  },
  SCRAP_METAL: {
    label: "Scrap Metal",
    homeHref: "/scrap-metal",
    quickActions: [
      roleItem("/scrap-metal/purchases", "Record Purchase", Payments),
      roleItem("/scrap-metal/batches", "Open Batch", Package),
      roleItem("/scrap-metal/sales", "Record Sale", ReceiptLong, ["SUPERADMIN", "MANAGER"]),
    ],
    sections: [
      {
        id: "scrap-buying",
        title: "Buying",
        items: [
          roleItem("/scrap-metal", "Scrap Home", Recycle),
          roleItem("/scrap-metal/purchases", "Purchases", Payments),
          roleItem("/scrap-metal/materials", "Materials", TableRows, ["SUPERADMIN", "MANAGER"]),
          roleItem("/scrap-metal/pricing", "Pricing", Coins),
        ],
      },
      {
        id: "scrap-yard",
        title: "Yard & Batches",
        items: [
          roleItem("/scrap-metal/batches", "Batches", Package),
          roleItem("/reports", "Scrap Reports", BarChart3),
        ],
      },
      {
        id: "scrap-sales",
        title: "Sales & Finance",
        items: [
          roleItem("/scrap-metal/sales", "Sales", ReceiptLong, ["SUPERADMIN", "MANAGER"]),
          roleItem("/accounting/receivables", "Buyer Documents", Scale),
          roleItem("/accounting/payables", "Supplier Documents", Wallet),
        ],
      },
      {
        id: "scrap-people",
        title: "Team & Settlements",
        items: [
          roleItem("/scrap-metal/settlements", "Scrap Settlements", ManageAccounts),
          roleItem("/human-resources", "Buyers & Crew", Users),
          roleItem("/management/users", "Workspace Access", UserRound, ["SUPERADMIN", "MANAGER"]),
        ],
      },
    ],
  },
  SCHOOLS: {
    label: "Schools",
    homeHref: "/schools",
    quickActions: [
      roleItem("/schools/admissions", "Admissions", Building2),
      roleItem("/schools/attendance", "Attendance", Calendar),
      roleItem("/schools/finance", "Finance", ReceiptLong),
    ],
    sections: [
      {
        id: "schools-campus",
        title: "Campus",
        items: [
          roleItem("/schools", "School Home", Building2),
          roleItem("/schools/students", "Students", Users),
          roleItem("/schools/teachers", "Teachers", ManageAccounts),
          roleItem("/schools/boarding", "Boarding", Home),
        ],
      },
      {
        id: "schools-academics",
        title: "Academics",
        items: [
          roleItem("/schools/academics", "Academics", TableRows),
          roleItem("/schools/timetable", "Timetable", Calendar),
          roleItem("/schools/assessments", "Assessments", FileCheck),
          roleItem("/schools/results/publish", "Results", FileText),
        ],
      },
      {
        id: "schools-admin",
        title: "Operations",
        items: [
          roleItem("/schools/admissions", "Admissions", Building2),
          roleItem("/schools/attendance", "Attendance", Calendar),
          roleItem("/schools/finance", "Finance", ReceiptLong),
          roleItem("/schools/reports", "Reports", BarChart3),
        ],
      },
    ],
  },
  AUTOS: {
    label: "Auto Sales",
    homeHref: "/car-sales",
    quickActions: [
      roleItem("/car-sales/leads", "Leads", Users),
      roleItem("/car-sales/inventory", "Inventory", Package),
      roleItem("/car-sales/deals", "Deals", Wallet),
    ],
    sections: [
      {
        id: "autos-pipeline",
        title: "Pipeline",
        items: [
          roleItem("/car-sales", "Auto Home", LocalShipping),
          roleItem("/car-sales/leads", "Leads", Users),
          roleItem("/car-sales/deals", "Deals", Wallet),
        ],
      },
      {
        id: "autos-stock",
        title: "Stock & Finance",
        items: [
          roleItem("/car-sales/inventory", "Inventory", Package),
          roleItem("/car-sales/financing", "Financing", ReceiptLong),
          roleItem("/management/users", "Workspace Access", UserRound, ["SUPERADMIN", "MANAGER"]),
        ],
      },
    ],
  },
  THRIFT: {
    label: "Smart Shop",
    homeHref: "/thrift",
    quickActions: [
      roleItem("/thrift/intake", "Intake", Package),
      roleItem("/thrift/catalog", "Catalog", TableRows),
      roleItem("/thrift/sales", "Sales", ReceiptLong),
    ],
    sections: [
      {
        id: "thrift-floor",
        title: "Floor",
        items: [
          roleItem("/thrift", "Shop Home", Wallet),
          roleItem("/thrift/intake", "Intake", Package),
          roleItem("/thrift/catalog", "Catalog", TableRows),
        ],
      },
      {
        id: "thrift-commerce",
        title: "Commerce",
        items: [
          roleItem("/thrift/sales", "Sales", ReceiptLong),
          roleItem("/portal/pos", "Point of Sale", Payments),
          roleItem("/management/users", "Workspace Access", UserRound, ["SUPERADMIN", "MANAGER"]),
        ],
      },
    ],
  },
  GENERAL: {
    label: "Operations",
    homeHref: "/dashboard",
    quickActions: [],
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

export function getWorkspaceHomeHref(profile: string | null | undefined): string {
  return WORKSPACE_DEFINITIONS[normalizeWorkspaceProfile(profile)].homeHref;
}

export function getWorkspaceSidebarModel(args: {
  role: string | null | undefined;
  enabledFeatures: string[] | undefined;
  workspaceProfile: string | null | undefined;
}): WorkspaceSidebarModel {
  const profile = normalizeWorkspaceProfile(args.workspaceProfile);

  if (profile === "GENERAL") {
    const sections = filterNavSectionsByEnabledFeatures(
      getNavSectionsForRole(args.role),
      args.enabledFeatures,
    );
    const overviewSection = sections.find((section) => section.id === "overview");
    const quickActionsSection = sections.find((section) => section.id === "daily");
    const contentSections = sections.filter(
      (section) => section.id !== "overview" && section.id !== "daily",
    );

    return {
      homeHref: "/dashboard",
      homeLabel: "Operations Home",
      workspaceLabel: WORKSPACE_DEFINITIONS.GENERAL.label,
      quickActions: quickActionsSection?.items ?? [],
      sections: contentSections,
      supportItems: overviewSection?.items.filter((item) => item.href !== "/") ?? SUPPORT_ITEMS,
    };
  }

  const definition = WORKSPACE_DEFINITIONS[profile];
  const sections = definition.sections
    .map((section) => ({
      ...section,
      items: filterHrefItemsByEnabledFeatures(
        filterNavItemsByRole(section.items, args.role),
        args.enabledFeatures,
      ),
    }))
    .filter((section) => section.items.length > 0);
  const quickActions = filterHrefItemsByEnabledFeatures(
    filterNavItemsByRole(definition.quickActions, args.role),
    args.enabledFeatures,
  );

  return {
    homeHref: definition.homeHref,
    homeLabel: `${definition.label} Home`,
    workspaceLabel: definition.label,
    quickActions,
    sections,
    supportItems: definition.supportItems ?? SUPPORT_ITEMS,
  };
}
