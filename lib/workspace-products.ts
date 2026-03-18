import { hasTokenFeature } from "@/lib/platform/gating/token-check";

export const WORKSPACE_PROFILES = [
  "GOLD_MINE",
  "SCRAP_METAL",
  "SCHOOLS",
  "AUTOS",
  "THRIFT",
  "GENERAL",
] as const;

export type WorkspaceProfile = (typeof WORKSPACE_PROFILES)[number];

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

export type VerticalProductId =
  | "gold-operations"
  | "scrap-recycling"
  | "school-operations"
  | "auto-sales"
  | "retail-thrift"
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

const DEFAULT_WORKSPACE_PROFILE: WorkspaceProfile = "GOLD_MINE";
const GENERAL_GENERAL_PRODUCT_ID: VerticalProductId = "general-business";

const DEFAULT_MODULE_PRESENTATION: Record<WorkspaceModuleId, WorkspaceModulePresentation> = {
  gold: {
    title: "Gold Operations",
    description: "Track gold production, purchases, dispatches, receipts, and exceptions in one operating flow.",
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
    title: "Scrap Metal",
    description: "Run buying, pricing, yard batching, and sales from a single scrap operations surface.",
  },
  schools: {
    title: "School Operations",
    description: "Manage students, teachers, academics, boarding, finance, and portals across the school.",
  },
  "car-sales": {
    title: "Auto Sales",
    description: "Manage leads, vehicle stock, financing, and deal execution across the sales pipeline.",
  },
  thrift: {
    title: "Retail & Thrift",
    description: "Run intake, cataloging, checkout, and point-of-sale workflows for resale and shop operations.",
  },
  hr: {
    title: "Human Resources",
    description: "Manage employees, salaries, payroll, incidents, approvals, and settlement workflows.",
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
    description: "Control stock, movements, receipts, issues, and fuel from one inventory workspace.",
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
    description: "Track equipment, work orders, planned maintenance, and breakdown response.",
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
    description: "Review operations, finance, and control performance through shared reporting surfaces.",
  },
  cctv: {
    title: "CCTV & Surveillance",
    description: "Monitor cameras, playback, events, and access activity across sites.",
  },
  accounting: {
    title: "Accounting",
    description: "Run ledger, receivables, payables, tax, and close controls from the finance workspace.",
  },
  management: {
    title: "Management",
    description: "Maintain users, master data, branding, compliance, and shared platform controls.",
  },
};

export const VERTICAL_PRODUCT_BUNDLES: VerticalProductBundleDefinition[] = [
  {
    id: "gold-operations",
    label: "Gold Operations",
    workspaceLabel: "Gold Operations",
    description: "Gold production, settlement, people, controls, and reporting for mining and mineral buyers.",
    customerExamples: ["Gold mines", "Mineral buying offices", "Processing operations"],
    templateCodes: ["TEMPLATE_GOLD_MINE"],
    preferredHomeHref: "/gold",
    primaryModules: ["gold", "reporting"],
    foundationalModules: ["hr", "stores", "maintenance", "accounting", "management"],
    moduleCopy: {
      hr: {
        description: "Manage crews, salaries, payroll, and settlement workflows alongside shift operations.",
        tabLabels: {
          payouts: "Settlements",
          salaries: "Salary Operations",
        },
      },
      maintenance: {
        description: "Track plant, equipment, work orders, and breakdown response across the mine.",
      },
      stores: {
        description: "Manage spares, consumables, fuel, and movement controls across mining sites.",
      },
      accounting: {
        description: "Run settlements, receivables, payables, tax, and close controls behind gold operations.",
      },
    },
  },
  {
    id: "scrap-recycling",
    label: "Scrap & Recycling",
    workspaceLabel: "Scrap & Recycling",
    description: "Buying, yard batching, pricing, sales, and settlements for recyclers and scrap traders.",
    customerExamples: ["Scrap yards", "Metal recyclers", "Industrial scrap traders"],
    templateCodes: ["TEMPLATE_SCRAP_METAL"],
    preferredHomeHref: "/scrap-metal",
    primaryModules: ["scrap-metal", "reporting"],
    foundationalModules: ["hr", "stores", "accounting", "management"],
    moduleCopy: {
      hr: {
        description: "Manage yard teams, salaries, approvals, and settlement controls for scrap operations.",
        tabLabels: {
          payouts: "Settlements",
        },
      },
      stores: {
        description: "Track scrap stock, yard movements, receipts, and issues through shared inventory controls.",
      },
      accounting: {
        description: "Run buyer settlements, receivables, payables, and close controls for scrap trading.",
      },
    },
  },
  {
    id: "school-operations",
    label: "School Operations",
    workspaceLabel: "School Operations",
    description: "Student life cycle, academics, fees, boarding, and portals for schools and training institutions.",
    customerExamples: ["Primary schools", "High schools", "Training institutions"],
    templateCodes: ["TEMPLATE_SCHOOLS"],
    preferredHomeHref: "/schools",
    primaryModules: ["schools"],
    foundationalModules: ["accounting", "management", "hr"],
    moduleCopy: {
      accounting: {
        description: "Support fees, receivables, banking, tax, and period controls for the school finance office.",
      },
      hr: {
        description: "Manage staff records, salaries, payroll, and approvals for teachers and support teams.",
      },
      management: {
        description: "Maintain master data, users, documents, branding, and compliance rules for the school.",
      },
    },
  },
  {
    id: "auto-sales",
    label: "Auto Sales",
    workspaceLabel: "Auto Sales",
    description: "Leads, inventory, financing, and deal execution for vehicle traders and dealerships.",
    customerExamples: ["Car dealerships", "Vehicle traders", "Auto sales operators"],
    templateCodes: ["TEMPLATE_CAR_SALES"],
    preferredHomeHref: "/car-sales",
    primaryModules: ["car-sales"],
    foundationalModules: ["accounting", "management", "hr"],
    moduleCopy: {
      accounting: {
        description: "Manage deal postings, receivables, commissions, banking, and tax controls for vehicle sales.",
      },
      hr: {
        description: "Manage sales staff, commissions, salaries, and approvals across the dealership team.",
      },
    },
  },
  {
    id: "retail-thrift",
    label: "Retail & Thrift",
    workspaceLabel: "Retail & Thrift",
    description: "Intake, cataloging, checkout, and POS operations for shops, resale, and thrift businesses.",
    customerExamples: ["Second-hand retailers", "Boutiques", "Resale marketplaces"],
    templateCodes: ["TEMPLATE_THRIFT"],
    preferredHomeHref: "/thrift",
    primaryModules: ["thrift"],
    foundationalModules: ["stores", "accounting", "management", "hr"],
    moduleCopy: {
      stores: {
        description: "Track receiving, stock on hand, movements, and fuel for shop and back-room operations.",
      },
      accounting: {
        description: "Manage sales, receivables, payables, banking, and tax from the shop finance workspace.",
      },
      hr: {
        description: "Manage shop teams, salaries, payroll, and approval history across store operations.",
      },
    },
  },
  {
    id: "service-workshop",
    label: "Service Workshop",
    workspaceLabel: "Service Workshop",
    description: "Parts, jobs, equipment, payroll, and workshop controls for service and technician businesses.",
    customerExamples: ["Mechanic workshops", "Technician services", "Engineering workshops"],
    templateCodes: ["TEMPLATE_TECH_WORKSHOP"],
    preferredHomeHref: "/maintenance",
    primaryModules: ["maintenance", "stores", "hr"],
    foundationalModules: ["accounting", "management"],
    moduleCopy: {
      maintenance: {
        description: "Run job work, equipment records, preventive maintenance, and workshop breakdown response.",
      },
      stores: {
        title: "Parts & Stores",
        description: "Control spare parts, consumables, fuel, and job-linked stock movements.",
      },
      hr: {
        description: "Manage technicians, attendance patterns, salaries, payroll, and workshop approvals.",
      },
      accounting: {
        description: "Track invoices, bills, payroll cost, and close controls behind workshop operations.",
      },
    },
  },
  {
    id: "multi-site-operations",
    label: "Multi-Site Operations",
    workspaceLabel: "Multi-Site Operations",
    description: "Stock, people, CCTV, and shared controls for growing SMEs operating across several sites.",
    customerExamples: ["Multi-site shops", "Security-stock operators", "Small distributed companies"],
    templateCodes: ["TEMPLATE_SMALL_BUSINESS_SECURITY_STOCK"],
    preferredHomeHref: "/stores/dashboard",
    primaryModules: ["stores", "hr", "cctv"],
    foundationalModules: ["accounting", "management", "reporting"],
    moduleCopy: {
      stores: {
        description: "Track stock, movements, receipts, and fuel across sites with tighter operating visibility.",
      },
      hr: {
        description: "Manage staff records, salaries, payroll, and approvals across multiple branches or depots.",
      },
      cctv: {
        description: "Monitor cameras, playback, events, and access activity across branches and shared facilities.",
      },
    },
  },
  {
    id: "general-business",
    label: "General Business",
    workspaceLabel: "General Business",
    description: "Shared finance, stock, people, and operational controls for general-purpose businesses.",
    customerExamples: ["SMEs", "Trading businesses", "Service companies"],
    templateCodes: ["TEMPLATE_CORE_STARTER", "TEMPLATE_ALL_FEATURES"],
    preferredHomeHref: null,
    primaryModules: ["stores", "hr", "reporting"],
    foundationalModules: ["accounting", "management", "maintenance"],
  },
];

function normalizeWorkspaceProfile(value: string | null | undefined): WorkspaceProfile {
  const normalized = String(value || "").trim().toUpperCase();
  return WORKSPACE_PROFILES.find((profile) => profile === normalized) ?? DEFAULT_WORKSPACE_PROFILE;
}

function getBundleById(id: VerticalProductId): VerticalProductBundleDefinition {
  return VERTICAL_PRODUCT_BUNDLES.find((bundle) => bundle.id === id) ?? VERTICAL_PRODUCT_BUNDLES[0];
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
  switch (normalizeWorkspaceProfile(args.workspaceProfile)) {
    case "GOLD_MINE":
      return getBundleById("gold-operations");
    case "SCRAP_METAL":
      return getBundleById("scrap-recycling");
    case "SCHOOLS":
      return getBundleById("school-operations");
    case "AUTOS":
      return getBundleById("auto-sales");
    case "THRIFT":
      return getBundleById("retail-thrift");
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
    description: override?.description ?? base.description,
    tabLabels: {
      ...(base.tabLabels ?? {}),
      ...(override?.tabLabels ?? {}),
    },
  };
}
