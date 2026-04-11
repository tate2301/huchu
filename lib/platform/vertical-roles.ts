import {
  inferWorkspaceProfileFromEnabledFeatures,
  normalizeWorkspaceProfileInput,
} from "@/lib/workspace-products";
import type { UserRole } from "@/lib/roles";
import {
  getRegisteredRoles,
  type ManagedWorkspaceProfile,
  USER_ROLE_LABELS,
  VERTICAL_ROLE_REGISTRY,
} from "@/lib/platform/vertical-role-registry";

export type { ManagedWorkspaceProfile };
export { USER_ROLE_LABELS };
export const VERTICAL_USER_ROLES: Record<ManagedWorkspaceProfile, UserRole[]> = Object.fromEntries(
  Object.entries(VERTICAL_ROLE_REGISTRY).map(([profile, config]) => [profile, config.roles]),
) as Record<ManagedWorkspaceProfile, UserRole[]>;

export type EmployeePrimaryModule =
  | "HR"
  | "GOLD"
  | "SCRAP_METAL"
  | "CAR_SALES"
  | "RETAIL"
  | "THRIFT"
  | "SCHOOLS";

const EMPLOYEE_MODULE_PROFILE_MAP: Record<EmployeePrimaryModule, ManagedWorkspaceProfile | null> = {
  HR: null,
  GOLD: "GOLD_MINE",
  SCRAP_METAL: "SCRAP_METAL",
  CAR_SALES: "AUTOS",
  RETAIL: "RETAIL",
  THRIFT: "RETAIL",
  SCHOOLS: "SCHOOLS",
};

export function resolveWorkspaceProfileForRoles(args: {
  workspaceProfile: string | null | undefined;
  enabledFeatures?: string[] | undefined;
}): ManagedWorkspaceProfile {
  const inferred = inferWorkspaceProfileFromEnabledFeatures(args.enabledFeatures);
  const normalized = normalizeWorkspaceProfileInput(args.workspaceProfile) as ManagedWorkspaceProfile | null;

  const profile =
    normalized && normalized !== "GENERAL" && normalized in VERTICAL_USER_ROLES
      ? normalized
      : (inferred as ManagedWorkspaceProfile | null) ?? normalized ?? "GENERAL";

  return profile;
}

export function resolveWorkspaceProfileForEmployeeModule(args: {
  primaryModule: string | null | undefined;
  workspaceProfile: string | null | undefined;
  enabledFeatures?: string[] | undefined;
}): ManagedWorkspaceProfile {
  const normalizedPrimaryModule = args.primaryModule?.trim().toUpperCase() as
    | EmployeePrimaryModule
    | undefined;
  const mappedProfile =
    normalizedPrimaryModule && normalizedPrimaryModule in EMPLOYEE_MODULE_PROFILE_MAP
      ? EMPLOYEE_MODULE_PROFILE_MAP[normalizedPrimaryModule]
      : null;

  if (mappedProfile) {
    return mappedProfile;
  }

  return resolveWorkspaceProfileForRoles({
    workspaceProfile: args.workspaceProfile,
    enabledFeatures: args.enabledFeatures,
  });
}

export function getAllowedUserRolesForWorkspace(args: {
  workspaceProfile: string | null | undefined;
  enabledFeatures?: string[] | undefined;
}): UserRole[] {
  const profile = resolveWorkspaceProfileForRoles(args);
  return getRegisteredRoles(profile);
}

export function getAllowedUserRoleOptionsForWorkspace(args: {
  workspaceProfile: string | null | undefined;
  enabledFeatures?: string[] | undefined;
}): Array<{ value: UserRole; label: string }> {
  return getAllowedUserRolesForWorkspace(args).map((value) => ({
    value,
    label: USER_ROLE_LABELS[value] ?? value,
  }));
}
