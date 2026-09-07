import type { WorkspaceProfile } from "./workspace-products";
import {
  inferWorkspaceProfileFromEnabledFeatures,
  normalizeWorkspaceProfileInput,
  RETIRED_WORKSPACE_PROFILES,
} from "./workspace-products";

/**
 * ST-2.5. The profiles that still have defaults, roles and personas behind them.
 *
 * `WorkspaceProfile` keeps `SCRAP_METAL` and `AUTOS` because stored tenant rows
 * and the Prisma enum still carry them, so the union is what a company row can
 * hold, and this is what the platform still knows how to configure. The two
 * literals are spelled out because `RETIRED_WORKSPACE_PROFILES` is typed as
 * `WorkspaceProfile[]` and so cannot narrow the union at the type level;
 * `isRetiredWorkspaceProfile` is the runtime half and reads that constant, so a
 * third retirement only has to be added in one place plus this `Exclude`.
 */
export type ActiveWorkspaceProfile = Exclude<WorkspaceProfile, "SCRAP_METAL" | "AUTOS">;

export function isRetiredWorkspaceProfile(profile: WorkspaceProfile): boolean {
  return RETIRED_WORKSPACE_PROFILES.includes(profile);
}

/**
 * Degrade a stored profile onto one the platform still configures.
 *
 * A tenant sitting on a dropped vertical keeps its row until somebody migrates
 * it, and every lookup in this file and in the role registry is a plain record
 * index. Without this it reads `undefined` and the caller crashes on a workspace
 * that used to work, so the fallback is spelled out rather than left to `??`.
 */
export function toActiveWorkspaceProfile(
  profile: WorkspaceProfile | null | undefined,
): ActiveWorkspaceProfile {
  if (!profile || isRetiredWorkspaceProfile(profile)) return "GENERAL";
  return profile as ActiveWorkspaceProfile;
}

export const EMPLOYEE_POSITION_VALUES = [
  "MANAGER",
  "SUPERVISOR",
  "CLERK",
  "SUPPORT_STAFF",
  "ACCOUNTANT",
  "ADMINISTRATOR",
  "STOREKEEPER",
  "BUYER",
  "CASHIER",
  "SALES_REP",
  "DRIVER",
  "TECHNICIAN",
  "OPERATOR",
  "ENGINEERS",
  "CHEMIST",
  "MINERS",
  "TEACHER",
] as const;

export type EmployeePositionValue = (typeof EMPLOYEE_POSITION_VALUES)[number];

export type EmployeePositionOption = {
  value: EmployeePositionValue;
  label: string;
};

type VerticalDefaultConfig = {
  employeePositions: readonly EmployeePositionValue[];
  defaultEmployeePosition: EmployeePositionValue;
  workspace: {
    siteNamePlaceholder: string;
    siteCodeExample: string;
    departmentNamePlaceholder: string;
    departmentCodeExample: string;
    locationPlaceholder: string;
    jobTitlePlaceholder: string;
  };
  maintenance: {
    technicianPosition: EmployeePositionValue;
    equipmentCategories: readonly string[];
    measurementUnits: readonly string[];
    siteNamePlaceholder: string;
  };
  stores: {
    allowFuel: boolean;
  };
  accounting: {
    includeGoldFlows: boolean;
    /**
     * S-2.3. Whether the accounting foundation pack seeds the school chart of
     * accounts and the seven `SCHOOL_FEE_*` posting rules for this vertical.
     */
    includeSchoolFlows: boolean;
  };
};

/**
 * Exported because `position` is an enum, not free text.
 *
 * Anything that wants to show a job title, or to let somebody *search* for one,
 * needs the same seventeen labels. A second copy would be a second copy to keep
 * in step — see `lib/people/search.ts`, which maps a typed word back onto the
 * enum so "driver" finds the drivers.
 */
export const EMPLOYEE_POSITION_LABELS: Record<EmployeePositionValue, string> = {
  MANAGER: "Manager",
  SUPERVISOR: "Supervisor",
  CLERK: "Clerk",
  SUPPORT_STAFF: "Support Staff",
  ACCOUNTANT: "Accountant",
  ADMINISTRATOR: "Administrator",
  STOREKEEPER: "Storekeeper",
  BUYER: "Buyer",
  CASHIER: "Cashier",
  SALES_REP: "Sales Representative",
  DRIVER: "Driver",
  TECHNICIAN: "Technician",
  OPERATOR: "Operator",
  ENGINEERS: "Engineer",
  CHEMIST: "Chemist",
  MINERS: "Miner",
  TEACHER: "Teacher",
};

const SHARED_POSITIONS = [
  "MANAGER",
  "SUPERVISOR",
  "CLERK",
  "SUPPORT_STAFF",
  "ACCOUNTANT",
  "ADMINISTRATOR",
] as const satisfies readonly EmployeePositionValue[];

const VERTICAL_DEFAULTS: Record<ActiveWorkspaceProfile, VerticalDefaultConfig> = {
  GOLD_MINE: {
    employeePositions: [...SHARED_POSITIONS, "OPERATOR", "ENGINEERS", "CHEMIST", "MINERS", "DRIVER"],
    defaultEmployeePosition: "MINERS",
    workspace: {
      siteNamePlaceholder: "Main Mine",
      siteCodeExample: "MAIN",
      departmentNamePlaceholder: "Mining",
      departmentCodeExample: "MIN",
      locationPlaceholder: "Kadoma, Zimbabwe",
      jobTitlePlaceholder: "Shift Foreman",
    },
    maintenance: {
      technicianPosition: "ENGINEERS",
      equipmentCategories: ["CRUSHER", "MILL", "PUMP", "GENERATOR", "VEHICLE", "OTHER"],
      measurementUnits: ["tonnes", "trips", "wheelbarrows"],
      siteNamePlaceholder: "Main Mine",
    },
    stores: {
      allowFuel: true,
    },
    accounting: {
      includeGoldFlows: true,
      includeSchoolFlows: false,
    },
  },
  SCHOOLS: {
    employeePositions: [...SHARED_POSITIONS, "TEACHER", "DRIVER"],
    defaultEmployeePosition: "TEACHER",
    workspace: {
      siteNamePlaceholder: "Main Campus",
      siteCodeExample: "MAIN",
      departmentNamePlaceholder: "Academics",
      departmentCodeExample: "ACAD",
      locationPlaceholder: "Harare, Zimbabwe",
      jobTitlePlaceholder: "Teacher",
    },
    maintenance: {
      technicianPosition: "TECHNICIAN",
      equipmentCategories: ["BUILDING", "CLASSROOM", "VEHICLE", "POWER", "SECURITY", "OTHER"],
      measurementUnits: ["rooms", "assets", "units"],
      siteNamePlaceholder: "Main Campus",
    },
    stores: {
      allowFuel: false,
    },
    accounting: {
      includeGoldFlows: false,
      includeSchoolFlows: true,
    },
  },
  RETAIL: {
    employeePositions: [...SHARED_POSITIONS, "STOREKEEPER", "BUYER", "CASHIER", "SALES_REP", "DRIVER"],
    defaultEmployeePosition: "CASHIER",
    workspace: {
      siteNamePlaceholder: "Main Store",
      siteCodeExample: "SHOP",
      departmentNamePlaceholder: "Sales Floor",
      departmentCodeExample: "SALES",
      locationPlaceholder: "CBD, Harare",
      jobTitlePlaceholder: "Shop Manager",
    },
    maintenance: {
      technicianPosition: "TECHNICIAN",
      equipmentCategories: ["POS", "DISPLAY", "COOLING", "POWER", "VEHICLE", "OTHER"],
      measurementUnits: ["units", "shelves", "registers"],
      siteNamePlaceholder: "Main Store",
    },
    stores: {
      allowFuel: false,
    },
    accounting: {
      includeGoldFlows: false,
      includeSchoolFlows: false,
    },
  },
  PAYROLL: {
    // A bureau's own staff, and the positions its clients' employees are likely
    // to hold. No miners, no teachers — a payroll-only workspace should not offer
    // a position list that describes somebody else's business.
    employeePositions: [...SHARED_POSITIONS, "STOREKEEPER", "DRIVER", "CASHIER", "SALES_REP", "TECHNICIAN", "OPERATOR"],
    defaultEmployeePosition: "SUPPORT_STAFF",
    workspace: {
      siteNamePlaceholder: "Head Office",
      siteCodeExample: "HO",
      departmentNamePlaceholder: "Payroll",
      departmentCodeExample: "PAY",
      locationPlaceholder: "Harare, Zimbabwe",
      jobTitlePlaceholder: "Payroll Officer",
    },
    maintenance: {
      // Present because the shape requires it, not because a bureau maintains
      // plant. The maintenance module is not in the template's bundles.
      technicianPosition: "TECHNICIAN",
      equipmentCategories: ["EQUIPMENT", "OTHER"],
      measurementUnits: ["units"],
      siteNamePlaceholder: "Head Office",
    },
    stores: {
      allowFuel: false,
    },
    accounting: {
      includeGoldFlows: false,
      includeSchoolFlows: false,
    },
  },
  GENERAL: {
    employeePositions: [...SHARED_POSITIONS, "STOREKEEPER", "DRIVER", "TECHNICIAN", "OPERATOR"],
    defaultEmployeePosition: "SUPPORT_STAFF",
    workspace: {
      siteNamePlaceholder: "Main Site",
      siteCodeExample: "MAIN",
      departmentNamePlaceholder: "Operations",
      departmentCodeExample: "OPS",
      locationPlaceholder: "Location details",
      jobTitlePlaceholder: "Operations Lead",
    },
    maintenance: {
      technicianPosition: "TECHNICIAN",
      equipmentCategories: ["EQUIPMENT", "VEHICLE", "POWER", "TOOLS", "OTHER"],
      measurementUnits: ["units", "assets", "jobs"],
      siteNamePlaceholder: "Main Site",
    },
    stores: {
      allowFuel: false,
    },
    accounting: {
      includeGoldFlows: false,
      includeSchoolFlows: false,
    },
  },
};

/**
 * The profile a workspace's defaults, roles and personas should be read from.
 *
 * Shared with `lib/platform/vertical-roles.ts`, which resolved the same thing
 * against its own record and had to agree with this one key for key.
 *
 * A stored profile only wins if it is a vertical we still configure: a dropped
 * one is treated as absent, so the feature set gets a chance to identify the
 * workspace before it falls back to GENERAL. A yard that also bought retail
 * therefore lands on RETAIL rather than on the general defaults.
 */
export function resolveActiveWorkspaceProfile(args: {
  workspaceProfile: string | null | undefined;
  enabledFeatures?: string[] | undefined;
}): ActiveWorkspaceProfile {
  const inferredProfile = inferWorkspaceProfileFromEnabledFeatures(args.enabledFeatures);
  const normalizedProfile = normalizeWorkspaceProfileInput(args.workspaceProfile);

  const profile =
    normalizedProfile &&
    normalizedProfile !== "GENERAL" &&
    !isRetiredWorkspaceProfile(normalizedProfile)
      ? normalizedProfile
      : inferredProfile ?? normalizedProfile ?? "GENERAL";

  return toActiveWorkspaceProfile(profile);
}

export function resolveVerticalDefaults(args: {
  workspaceProfile: string | null | undefined;
  enabledFeatures?: string[] | undefined;
}): VerticalDefaultConfig {
  return VERTICAL_DEFAULTS[resolveActiveWorkspaceProfile(args)];
}

export function getEmployeePositionOptions(args: {
  workspaceProfile: string | null | undefined;
  enabledFeatures?: string[] | undefined;
}): EmployeePositionOption[] {
  return resolveVerticalDefaults(args).employeePositions.map((value) => ({
    value,
    label: EMPLOYEE_POSITION_LABELS[value],
  }));
}

export function getDefaultEmployeePosition(args: {
  workspaceProfile: string | null | undefined;
  enabledFeatures?: string[] | undefined;
}): EmployeePositionValue {
  return resolveVerticalDefaults(args).defaultEmployeePosition;
}
