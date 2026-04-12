import { hasTokenFeature } from "@/lib/platform/gating/token-check";

export const WORKSPACE_PROFILES = [
  "GOLD_MINE",
  "SCRAP_METAL",
  "SCHOOLS",
  "AUTOS",
  "RETAIL",
  "GENERAL",
] as const;

export type WorkspaceProfile = (typeof WORKSPACE_PROFILES)[number];

export type WorkspaceModuleId =
  | "gold"
  | "scrap-metal"
  | "schools"
  | "car-sales"
  | "retail"
  | "hr"
  | "stores"
  | "maintenance"
  | "reporting"
  | "cctv"
  | "accounting"
  | "management";

export type VerticalProductId =
  | "gold-operations"
  | "scrap-recycling"
  | "school-operations"
  | "auto-sales"
  | "retail-operations"
  | "service-workshop"
  | "multi-site-operations"
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
  "scrap-metal": {
    title: "Scrap & Recycling",
    description: "",
  },
  schools: {
    title: "School Operations",
    description: "",
  },
  "car-sales": {
    title: "Auto Sales",
    description: "",
  },
  retail: {
    title: "Retail",
    description: "",
  },
  hr: {
    title: "Human Resources",
    description: "",
    tabLabels: {
      employees: "Employees",
      "shift-groups": "Shift Groups",
      incidents: "Incidents",
      payouts: "Settlements",
      salaries: "Salaries",
      "salary-outstanding": "Outstanding Salaries",
      compensation: "Compensation",
      payroll: "Payroll",
      disbursements: "Disbursements",
      approvals: "Approvals",
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
  cctv: {
    title: "CCTV & Surveillance",
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
    foundationalModules: ["hr", "stores", "maintenance", "accounting", "management"],
    moduleCopy: {
      hr: {
        description: "",
        tabLabels: {
          payouts: "Settlements",
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
    id: "scrap-recycling",
    label: "Scrap & Recycling",
    workspaceLabel: "Scrap & Recycling",
    description: "",
    customerExamples: ["Scrap yards", "Metal recyclers", "Industrial scrap traders"],
    templateCodes: ["TEMPLATE_SCRAP_METAL"],
    preferredHomeHref: "/scrap-metal",
    primaryModules: ["scrap-metal", "reporting"],
    foundationalModules: ["hr", "stores", "maintenance", "accounting", "management"],
    moduleCopy: {
      hr: {
        description: "",
        tabLabels: {
          payouts: "Settlements",
        },
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
    foundationalModules: ["accounting", "management", "hr"],
    moduleCopy: {
      accounting: {
        description: "",
      },
      hr: {
        description: "",
      },
      management: {
        description: "",
      },
    },
  },
  {
    id: "auto-sales",
    label: "Auto Sales",
    workspaceLabel: "Auto Sales",
    description: "",
    customerExamples: ["Car dealerships", "Vehicle traders", "Auto sales operators"],
    templateCodes: ["TEMPLATE_CAR_SALES"],
    preferredHomeHref: "/car-sales",
    primaryModules: ["car-sales"],
    foundationalModules: ["accounting", "management", "hr"],
    moduleCopy: {
      accounting: {
        description: "",
      },
      hr: {
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
    foundationalModules: ["stores", "accounting", "management", "hr"],
    moduleCopy: {
      stores: {
        description: "",
      },
      accounting: {
        description: "",
      },
      hr: {
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
    primaryModules: ["maintenance", "stores", "hr"],
    foundationalModules: ["accounting", "management"],
    moduleCopy: {
      maintenance: {
        description: "",
      },
      stores: {
        title: "Parts & Stores",
        description: "",
      },
      hr: {
        description: "",
      },
      accounting: {
        description: "",
      },
    },
  },
  {
    id: "multi-site-operations",
    label: "Multi-Site Operations",
    workspaceLabel: "Multi-Site Operations",
    description: "",
    customerExamples: ["Multi-site shops", "Security-stock operators", "Small distributed companies"],
    templateCodes: ["TEMPLATE_SMALL_BUSINESS_SECURITY_STOCK"],
    preferredHomeHref: "/stores/dashboard",
    primaryModules: ["stores", "hr", "cctv"],
    foundationalModules: ["accounting", "management", "reporting"],
    moduleCopy: {
      stores: {
        description: "",
      },
      hr: {
        description: "",
      },
      cctv: {
        description: "",
      },
    },
  },
  {
    id: "general-business",
    label: "General Business",
    workspaceLabel: "General Business",
    description: "",
    customerExamples: ["SMEs", "Trading businesses", "Service companies"],
    templateCodes: ["TEMPLATE_CORE_STARTER", "TEMPLATE_ALL_FEATURES"],
    preferredHomeHref: null,
    primaryModules: ["stores", "hr", "reporting"],
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

  if (normalized === "SCRAP" || normalized === "SCRAP-METAL" || normalized === "SCRAPMETAL") return "SCRAP_METAL";
  if (normalized === "GOLD" || normalized === "GOLD-MINE" || normalized === "GOLDMINE") return "GOLD_MINE";
  if (normalized === "SCHOOL" || normalized === "SCHOOLS") return "SCHOOLS";
  if (
    normalized === "AUTO" ||
    normalized === "CAR_SALES" ||
    normalized === "CAR-SALES" ||
    normalized === "CARSALES" ||
    normalized === "AUTOS"
  ) {
    return "AUTOS";
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

  // 1. Scrap Metal (High Priority)
  if (
    hasFeaturePrefix("scrap-metal.") ||
    hasTokenFeature(enabledFeatures, "scrap-metal.home") ||
    hasTokenFeature(enabledFeatures, "scrap-metal.purchases") ||
    hasTokenFeature(enabledFeatures, "scrap-metal.batches")
  ) {
    return "SCRAP_METAL";
  }

  // 2. Retail
  if (
    hasFeaturePrefix("retail.") ||
    hasTokenFeature(enabledFeatures, "retail.core") ||
    hasTokenFeature(enabledFeatures, "portal.pos")
  ) {
    return "RETAIL";
  }

  // 3. Schools
  if (hasFeaturePrefix("schools.") || hasTokenFeature(enabledFeatures, "schools.core")) {
    return "SCHOOLS";
  }

  // 4. Autos
  if (hasFeaturePrefix("autos.") || hasTokenFeature(enabledFeatures, "autos.core")) {
    return "AUTOS";
  }

  // 5. Gold Mine (Check last as it has generic positions often confused with General)
  if (hasFeaturePrefix("gold.") || hasTokenFeature(enabledFeatures, "gold.home")) {
    return "GOLD_MINE";
  }

  return null;
}

function resolveGeneralVerticalProduct(enabledFeatures: string[] | undefined): VerticalProductId {
  const hasMultiSiteSignals =
    hasTokenFeature(enabledFeatures, "cctv.overview") &&
    hasTokenFeature(enabledFeatures, "stores.inventory") &&
    hasTokenFeature(enabledFeatures, "hr.employees");

  if (hasMultiSiteSignals) {
    return "multi-site-operations";
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
    case "SCRAP_METAL":
      return getBundleById("scrap-recycling");
    case "SCHOOLS":
      return getBundleById("school-operations");
    case "AUTOS":
      return getBundleById("auto-sales");
    case "RETAIL":
      return getBundleById("retail-operations");
    case "GENERAL":
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
