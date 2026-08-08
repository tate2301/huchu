import type { WorkspaceProfile } from "@/lib/workspace-products";
import {
  inferWorkspaceProfileFromEnabledFeatures,
  normalizeWorkspaceProfileInput,
} from "@/lib/workspace-products";

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

const EMPLOYEE_POSITION_LABELS: Record<EmployeePositionValue, string> = {
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

const VERTICAL_DEFAULTS: Record<WorkspaceProfile, VerticalDefaultConfig> = {
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
  SCRAP_METAL: {
    employeePositions: ["MANAGER", "BUYER", "SUPPORT_STAFF"],
    defaultEmployeePosition: "BUYER",
    workspace: {
      siteNamePlaceholder: "Main Yard",
      siteCodeExample: "YARD",
      departmentNamePlaceholder: "Buying",
      departmentCodeExample: "BUY",
      locationPlaceholder: "Industrial Area",
      jobTitlePlaceholder: "Yard Supervisor",
    },
    maintenance: {
      technicianPosition: "TECHNICIAN",
      equipmentCategories: ["YARD_EQUIPMENT", "VEHICLE", "SCALE", "PRESS", "POWER", "OTHER"],
      measurementUnits: ["kilograms", "loads", "units"],
      siteNamePlaceholder: "Main Yard",
    },
    stores: {
      allowFuel: false,
    },
    accounting: {
      includeGoldFlows: false,
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
  AUTOS: {
    employeePositions: [...SHARED_POSITIONS, "SALES_REP", "TECHNICIAN", "DRIVER", "BUYER", "STOREKEEPER"],
    defaultEmployeePosition: "SALES_REP",
    workspace: {
      siteNamePlaceholder: "Main Dealership",
      siteCodeExample: "SHOW",
      departmentNamePlaceholder: "Sales",
      departmentCodeExample: "SALE",
      locationPlaceholder: "City Centre",
      jobTitlePlaceholder: "Sales Executive",
    },
    maintenance: {
      technicianPosition: "TECHNICIAN",
      equipmentCategories: ["VEHICLE", "SHOP_EQUIPMENT", "LIFT", "TOOLS", "POWER", "OTHER"],
      measurementUnits: ["jobs", "vehicles", "units"],
      siteNamePlaceholder: "Main Dealership",
    },
    stores: {
      allowFuel: false,
    },
    accounting: {
      includeGoldFlows: false,
      includeSchoolFlows: false,
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

export function resolveVerticalDefaults(args: {
  workspaceProfile: string | null | undefined;
  enabledFeatures?: string[] | undefined;
}): VerticalDefaultConfig {
  const inferredProfile = inferWorkspaceProfileFromEnabledFeatures(args.enabledFeatures);
  const normalizedProfile = normalizeWorkspaceProfileInput(args.workspaceProfile) as WorkspaceProfile | null;

  const profile =
    normalizedProfile && normalizedProfile !== "GENERAL" && normalizedProfile in VERTICAL_DEFAULTS
      ? normalizedProfile
      : inferredProfile ?? normalizedProfile ?? "GENERAL";

  return VERTICAL_DEFAULTS[profile] ?? VERTICAL_DEFAULTS.GENERAL;
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
