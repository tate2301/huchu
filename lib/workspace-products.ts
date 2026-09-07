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

/**
 * What each vertical's *own* features look like.
 *
 * `prefix` is the namespace the module owns outright; `signals` are individual
 * keys that count as evidence even when the prefix is absent. Only features a
 * vertical genuinely owns belong here — `hr.*` and `accounting.*` are
 * foundational to every vertical and so are evidence for none of them.
 */
const PROFILE_FEATURE_EVIDENCE: Array<{
  profile: Exclude<WorkspaceProfile, "GENERAL">;
  prefix: string;
  signals: string[];
}> = [
  { profile: "GOLD_MINE", prefix: "gold.", signals: ["gold.home"] },
  { profile: "SCHOOLS", prefix: "schools.", signals: ["schools.core"] },
  { profile: "RETAIL", prefix: "retail.", signals: ["retail.core", "portal.pos"] },
];

/**
 * Which vertical is this tenant actually in?
 *
 * ## Why this counts rather than returning the first match
 *
 * It used to be an ordered chain: retail first, then schools, then gold. Any
 * tenant with a single `retail.*` key was Retail — so St Mary's, with 120
 * pupils and a tuck shop, was a shop; and so was a gold mine, and so was a
 * creative agency. Every seeded demo tenant has the full feature set switched
 * on, so **every screenshot of every vertical was branded "Retail"**, which is
 * how this was found: not by a test, but by looking at the pictures.
 *
 * The chain was not wrong by accident. With one signal per vertical there is
 * nothing to choose between them and *some* order has to win. The fix is to
 * stop asking "does this tenant have any retail feature" and start asking
 * "which vertical does this tenant have the *most* of" — a school running a
 * tuck shop has twenty `schools.*` keys and two `retail.*` ones, and that is a
 * school.
 *
 * Ties keep the historical order (gold, schools, retail), so a tenant with
 * genuinely equal footing in two verticals resolves exactly as it did before
 * and nothing silently moves.
 *
 * ## Payroll is still last, and still special
 *
 * HR is foundational to every vertical above, so `hr.payroll` alone means a
 * payroll-only workspace while `hr.payroll` beside `schools.core` is a school
 * that runs payroll. Requiring the statutory keys as well stops an ordinary
 * tenant with payroll switched on being misread as a bureau. That reasoning is
 * unchanged; only the three verticals above it now compete on weight.
 *
 * ## This is a fallback
 *
 * `Company.workspaceProfile` is authoritative and `resolveEffectiveWorkspaceProfile`
 * honours it first. Inference exists for tenants that never had one set —
 * which, before this change, was every seeded tenant except the payroll bureau.
 */
export function inferWorkspaceProfileFromEnabledFeatures(
  enabledFeatures: string[] | undefined,
): WorkspaceProfile | null {
  const features = (enabledFeatures ?? []).map((feature) => feature.trim().toLowerCase());

  let best: { profile: Exclude<WorkspaceProfile, "GENERAL">; weight: number } | null = null;

  for (const { profile, prefix, signals } of PROFILE_FEATURE_EVIDENCE) {
    const owned = features.filter((feature) => feature.startsWith(prefix)).length;
    const flagged = signals.filter((signal) => hasTokenFeature(enabledFeatures, signal)).length;

    // A named signal is evidence in its own right, but a prefix match already
    // counted it — so take whichever reading is larger rather than adding them
    // and letting `retail.core` score twice.
    const weight = Math.max(owned, flagged);
    if (weight === 0) continue;

    // Strictly greater, so the first vertical in PROFILE_FEATURE_EVIDENCE wins
    // a tie and the previous precedence survives.
    if (!best || weight > best.weight) {
      best = { profile, weight };
    }
  }

  if (best) return best.profile;

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
  /*
    Infer only when nothing was stated.

    `normalizeWorkspaceProfile` answers GENERAL both to `null` and to the string
    "GENERAL", and this used to hand both to inference — so a service business
    that had deliberately been set to GENERAL got a vertical's bundle, and with
    it that vertical's name above the sidebar.

    This was the *fourth* place the same collapse lived, after
    `resolveEffectiveWorkspaceProfile`, `resolveWorkspaceProfileClaim` and the
    seeds. Each one hid the next: with the first three fixed, Hurudza Creative's
    JWT correctly said GENERAL and the sidebar still rendered "School
    Operations", because the *label* comes from the bundle and the bundle was
    still inferring on its own.

    `normalizeWorkspaceProfileInput` returns null for absent or unrecognised
    input, which is the only thing that separates the two cases.
  */
  const profileWasStated = normalizeWorkspaceProfileInput(args.workspaceProfile) !== null;
  const inferredProfile = profileWasStated
    ? null
    : inferWorkspaceProfileFromEnabledFeatures(args.enabledFeatures);
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
