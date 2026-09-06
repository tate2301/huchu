import { hasTokenFeature } from "@/lib/platform/gating/token-check";

export const WORKSPACE_PROFILES = [
  "GOLD_MINE",
  "SCRAP_METAL",
  "SCHOOLS",
  "AUTOS",
  "RETAIL",
  // A client who bought nothing but payroll. Without its own profile they land
  // on the general dashboard, which for them is eight dead tiles and no way to
  // reach the thing they paid for.
  "PAYROLL",
  "GENERAL",
] as const;

export type WorkspaceProfile = (typeof WORKSPACE_PROFILES)[number];

/**
 * Profiles whose vertical was dropped (ST-1.1). Nothing resolves to them any
 * more — `normalizeWorkspaceProfileInput` maps both to `GENERAL` — but the
 * values stay in the union because stored tenant rows and the Prisma
 * `WorkspaceProfile` enum still carry them, and the persona registries that key
 * off the union are removed by ST-2.5 and ST-3.1. Retiring the value here
 * rather than deleting it is what keeps the rest of the tree compiling.
 */
export const RETIRED_WORKSPACE_PROFILES: readonly WorkspaceProfile[] = ["SCRAP_METAL", "AUTOS"];

export type WorkspaceModuleId =
  | "gold"
  | "schools"
  | "retail"
  | "crm"
  | "people"
  | "payroll"
  | "stores"
  | "maintenance"
  | "reporting"
  | "accounting"
  | "management";

export type VerticalProductId =
  | "gold-operations"
  | "school-operations"
  | "retail-operations"
  | "crm-sales"
  | "service-workshop"
  | "payroll-services"
  | "general-business";

type ModuleCopyOverride = {
  title?: string;
  description?: string;
  tabLabels?: Record<string, string>;
};

export type VerticalProductBundleDefinition = {
  id: VerticalProductId;
  label: string;
  workspaceLabel: string;
  description: string;
  customerExamples: string[];
  templateCodes: string[];
  preferredHomeHref: string | null;
  primaryModules: WorkspaceModuleId[];
  foundationalModules: WorkspaceModuleId[];
  moduleCopy?: Partial<Record<WorkspaceModuleId, ModuleCopyOverride>>;
};

export type WorkspaceModulePresentation = {
  title: string;
  description: string;
  tabLabels?: Record<string, string>;
};

type ResolveWorkspaceProductArgs = {
  workspaceProfile: string | null | undefined;
  enabledFeatures: string[] | undefined;
};

const DEFAULT_WORKSPACE_PROFILE: WorkspaceProfile = "GENERAL";
const GENERAL_GENERAL_PRODUCT_ID: VerticalProductId = "general-business";

/**
 * Every spelling that used to resolve to a dropped vertical, including the
 * canonical profile codes themselves. All of them now normalise to `GENERAL`.
 */
const RETIRED_PROFILE_INPUTS = new Set<string>([
  ...RETIRED_WORKSPACE_PROFILES,
  "SCRAP",
  "SCRAP-METAL",
  "SCRAPMETAL",
  "AUTO",
  "CAR_SALES",
  "CAR-SALES",
  "CARSALES",
]);

const DEFAULT_MODULE_PRESENTATION: Record<WorkspaceModuleId, WorkspaceModulePresentation> = {
  gold: {
    title: "Gold Operations",
    description: "",
    tabLabels: {
      home: "Overview",
      batches: "Pours",
      purchases: "Purchases",
      dispatches: "Dispatches",
      sales: "Receipts",
      prices: "Pricing",
      payouts: "Payouts",
      issues: "Exceptions",
      reports: "Reports",
    },
  },
  schools: {
    title: "School Operations",
    description: "",
  },
  retail: {
    title: "Retail",
    description: "",
  },
  crm: {
    title: "CRM",
    description: "",
  },
  people: {
    title: "People",
    description: "",
    tabLabels: {
      employees: "Employees",
      "shift-groups": "Rosters",
      incidents: "Incidents",
      approvals: "History",
    },
  },
  payroll: {
    title: "Payroll",
    description: "",
    tabLabels: {
      compensation: "Rules",
      salaries: "Salaries",
      "salary-outstanding": "Outstanding",
      runs: "Runs",
      disbursements: "Disbursements",
      "statutory-tables": "Tables & Rates",
      "statutory-returns": "Returns",
    },
  },
  stores: {
    title: "Stores & Inventory",
    description: "",
    tabLabels: {
      dashboard: "Overview",
      inventory: "Stock on Hand",
      movements: "Stock Movements",
      fuel: "Fuel Ledger",
      issue: "Issue Stock",
      receive: "Receive Stock",
    },
  },
  maintenance: {
    title: "Maintenance & Assets",
    description: "",
    tabLabels: {
      dashboard: "Overview",
      equipment: "Equipment Register",
      "work-orders": "Work Orders",
      breakdown: "Log Breakdown",
      schedule: "PM Schedule",
    },
  },
  reporting: {
    title: "Reports",
    description: "",
  },
  accounting: {
    title: "Accounting",
    description: "",
  },
  management: {
    title: "Management",
    description: "",
  },
};

export const VERTICAL_PRODUCT_BUNDLES: VerticalProductBundleDefinition[] = [
  {
    id: "gold-operations",
    label: "Gold Operations",
    workspaceLabel: "Gold Operations",
    description: "",
    customerExamples: ["Gold mines", "Mineral buying offices", "Processing operations"],
    templateCodes: ["TEMPLATE_GOLD_MINE"],
    preferredHomeHref: "/gold",
    primaryModules: ["gold", "reporting"],
    foundationalModules: ["people", "payroll", "stores", "maintenance", "accounting", "management"],
    moduleCopy: {
      payroll: {
        description: "",
        tabLabels: {
          salaries: "Salary Operations",
        },
      },
      maintenance: {
        description: "",
      },
      stores: {
        description: "",
      },
      accounting: {
        description: "",
      },
    },
  },
  {
    id: "school-operations",
    label: "School Operations",
    workspaceLabel: "School Operations",
    description: "",
    customerExamples: ["Primary schools", "High schools", "Training institutions"],
    templateCodes: ["TEMPLATE_SCHOOLS"],
    preferredHomeHref: "/schools",
    primaryModules: ["schools"],
    foundationalModules: ["accounting", "management", "people", "payroll"],
    moduleCopy: {
      accounting: {
        description: "",
      },
      people: {
        description: "",
      },
      payroll: {
        description: "",
      },
      management: {
        description: "",
      },
    },
  },
  {
    id: "retail-operations",
    label: "Retail",
    workspaceLabel: "Retail",
    description: "",
    customerExamples: ["Retail stores", "Boutiques", "Small chains"],
    templateCodes: ["TEMPLATE_RETAIL"],
    preferredHomeHref: "/retail",
    primaryModules: ["retail"],
    foundationalModules: ["stores", "accounting", "management", "people", "payroll"],
    moduleCopy: {
      stores: {
        description: "",
      },
      accounting: {
        description: "",
      },
      people: {
        description: "",
      },
      payroll: {
        description: "",
      },
    },
  },
  {
    id: "crm-sales",
    label: "Sales & CRM",
    workspaceLabel: "Sales & CRM",
    description: "",
    customerExamples: ["Field-sales teams", "Installers & fitters", "Service sales businesses"],
    templateCodes: ["TEMPLATE_CRM"],
    preferredHomeHref: "/crm",
    primaryModules: ["crm", "reporting"],
    foundationalModules: ["accounting", "people", "payroll", "management"],
    moduleCopy: {
      accounting: {
        description: "",
      },
      people: {
        description: "",
      },
      payroll: {
        description: "",
      },
    },
  },
  {
    id: "service-workshop",
    label: "Service Workshop",
    workspaceLabel: "Service Workshop",
    description: "",
    customerExamples: ["Mechanic workshops", "Technician services", "Engineering workshops"],
    templateCodes: ["TEMPLATE_TECH_WORKSHOP"],
    preferredHomeHref: "/maintenance",
    primaryModules: ["maintenance", "stores", "people", "payroll"],
    foundationalModules: ["accounting", "management"],
    moduleCopy: {
      maintenance: {
        description: "",
      },
      stores: {
        title: "Parts & Stores",
        description: "",
      },
      people: {
        description: "",
      },
      payroll: {
        description: "",
      },
      accounting: {
        description: "",
      },
    },
  },
  {
    // Payroll on its own. The whole product for a client who wants nothing else:
    // HR is primary, accounting and management are foundational — and
    // `foundationalModules` is not the same as required. A payroll-only tenant
    // that never buys `accounting.core` still runs payroll; the run completes,
    // posts nothing, and says so.
    id: "payroll-services",
    label: "Payroll Services",
    workspaceLabel: "Payroll",
    description: "",
    customerExamples: [
      "Payroll bureaux",
      "Accounting practices running client payrolls",
      "Companies that want payroll only",
    ],
    templateCodes: ["TEMPLATE_PAYROLL_BUREAU"],
    // Without this a payroll-only client lands on a dashboard of dead tiles. The
    // runs screen rather than the directory: a bureau opens this to pay people.
    preferredHomeHref: "/payroll/runs",
    primaryModules: ["payroll"],
    foundationalModules: ["people", "accounting", "management"],
  },
  {
    id: "general-business",
    label: "General Business",
    workspaceLabel: "General Business",
    description: "",
    customerExamples: ["SMEs", "Trading businesses", "Service companies"],
    templateCodes: ["TEMPLATE_CORE_STARTER", "TEMPLATE_ALL_FEATURES"],
    preferredHomeHref: null,
    primaryModules: ["stores", "people", "payroll", "reporting"],
    foundationalModules: ["accounting", "management", "maintenance"],
  },
];

function normalizeWorkspaceProfile(value: string | null | undefined): WorkspaceProfile {
  return normalizeWorkspaceProfileInput(value) ?? DEFAULT_WORKSPACE_PROFILE;
}

export function normalizeWorkspaceProfileInput(
  value: string | null | undefined,
): WorkspaceProfile | null {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return null;

  // Retired verticals (ST-1.1). A tenant row still holding one of these — or one
  // of the spellings that used to reach it — lands on the general workspace
  // rather than on a profile whose module no longer exists. Checked before the
  // exact-match lookup below, which would otherwise still find the retired
  // members of `WORKSPACE_PROFILES`.
  if (RETIRED_PROFILE_INPUTS.has(normalized)) return "GENERAL";

  if (normalized === "GOLD" || normalized === "GOLD-MINE" || normalized === "GOLDMINE") return "GOLD_MINE";
  if (normalized === "SCHOOL" || normalized === "SCHOOLS") return "SCHOOLS";
  if (normalized === "THRIFT") return "RETAIL";
  if (
    normalized === "PAYROLL_BUREAU" ||
    normalized === "PAYROLL-BUREAU" ||
    normalized === "BUREAU" ||
    normalized === "HR"
  ) {
    return "PAYROLL";
  }

  return WORKSPACE_PROFILES.find((profile) => profile === normalized) ?? null;
}

function getBundleById(id: VerticalProductId): VerticalProductBundleDefinition {
  return VERTICAL_PRODUCT_BUNDLES.find((bundle) => bundle.id === id) ?? VERTICAL_PRODUCT_BUNDLES[0];
}

export function inferWorkspaceProfileFromEnabledFeatures(
  enabledFeatures: string[] | undefined,
): WorkspaceProfile | null {
  const hasFeaturePrefix = (prefix: string) =>
    (enabledFeatures ?? []).some((feature) =>
      feature.trim().toLowerCase().startsWith(prefix),
    );

  // 1. Retail
  if (
    hasFeaturePrefix("retail.") ||
    hasTokenFeature(enabledFeatures, "retail.core") ||
    hasTokenFeature(enabledFeatures, "portal.pos")
  ) {
    return "RETAIL";
  }

  // 2. Schools
  if (hasFeaturePrefix("schools.") || hasTokenFeature(enabledFeatures, "schools.core")) {
    return "SCHOOLS";
  }

  // 3. Gold Mine (Check last as it has generic positions often confused with General)
  if (hasFeaturePrefix("gold.") || hasTokenFeature(enabledFeatures, "gold.home")) {
    return "GOLD_MINE";
  }

  // 4. Payroll only. Checked last on purpose: HR is foundational to every
  // vertical above, so `hr.payroll` alone is a payroll-only workspace but
  // `hr.payroll` beside `schools.core` is a school that also runs payroll — and
  // the ordering here is what tells them apart. Requires the statutory keys, so
  // an ordinary tenant that merely has payroll switched on is not misread as a
  // bureau.
  if (
    hasTokenFeature(enabledFeatures, "hr.payroll") &&
    hasTokenFeature(enabledFeatures, "hr.statutory-tables")
  ) {
    return "PAYROLL";
  }

  return null;
}

function resolveGeneralVerticalProduct(enabledFeatures: string[] | undefined): VerticalProductId {
  if (hasTokenFeature(enabledFeatures, "crm.core")) {
    return "crm-sales";
  }

  const hasWorkshopSignals =
    hasTokenFeature(enabledFeatures, "maintenance.equipment") &&
    hasTokenFeature(enabledFeatures, "stores.inventory") &&
    hasTokenFeature(enabledFeatures, "hr.employees");

  if (hasWorkshopSignals) {
    return "service-workshop";
  }

  return GENERAL_GENERAL_PRODUCT_ID;
}

export function resolveWorkspaceVerticalProductBundle(
  args: ResolveWorkspaceProductArgs,
): VerticalProductBundleDefinition {
  const requestedProfile = normalizeWorkspaceProfile(args.workspaceProfile);
  const inferredProfile = inferWorkspaceProfileFromEnabledFeatures(args.enabledFeatures);
  const effectiveProfile =
    requestedProfile === "GENERAL" && inferredProfile
      ? inferredProfile
      : requestedProfile;

  switch (effectiveProfile) {
    case "GOLD_MINE":
      return getBundleById("gold-operations");
    case "SCHOOLS":
      return getBundleById("school-operations");
    case "RETAIL":
      return getBundleById("retail-operations");
    case "PAYROLL":
      return getBundleById("payroll-services");
    case "GENERAL":
    // The retired profiles land here too. `normalizeWorkspaceProfile` already
    // turns them into `GENERAL`, so this is belt and braces rather than a path
    // anything reaches.
    default:
      return getBundleById(resolveGeneralVerticalProduct(args.enabledFeatures));
  }
}

export function getVerticalProductBundleForTemplate(
  templateCode: string | null | undefined,
): VerticalProductBundleDefinition | null {
  const normalized = String(templateCode || "").trim().toUpperCase();
  if (!normalized) return null;
  return (
    VERTICAL_PRODUCT_BUNDLES.find((bundle) => bundle.templateCodes.includes(normalized)) ??
    null
  );
}

export function getWorkspaceModulePresentation(args: ResolveWorkspaceProductArgs & {
  moduleId: WorkspaceModuleId;
}): WorkspaceModulePresentation {
  const bundle = resolveWorkspaceVerticalProductBundle(args);
  const base = DEFAULT_MODULE_PRESENTATION[args.moduleId];
  const override = bundle.moduleCopy?.[args.moduleId];

  return {
    title: override?.title ?? base.title,
    description: "",
    tabLabels: {
      ...(base.tabLabels ?? {}),
      ...(override?.tabLabels ?? {}),
    },
  };
}
