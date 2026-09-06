import type { UserRole } from "@/lib/roles";
import {
  type ActiveWorkspaceProfile,
  resolveActiveWorkspaceProfile,
} from "@/lib/platform/vertical-defaults";
import {
  getRegisteredRoles,
  type ManagedWorkspaceProfile,
  USER_ROLE_LABELS,
  VERTICAL_ROLE_REGISTRY,
} from "@/lib/platform/vertical-role-registry";

export type { ManagedWorkspaceProfile };
export { USER_ROLE_LABELS };
export const VERTICAL_USER_ROLES: Record<ActiveWorkspaceProfile, UserRole[]> = Object.fromEntries(
  Object.entries(VERTICAL_ROLE_REGISTRY).map(([profile, config]) => [profile, config.roles]),
) as Record<ActiveWorkspaceProfile, UserRole[]>;

/**
 * The module an employee's record is filed under.
 *
 * `SCRAP_METAL` and `CAR_SALES` are gone with their verticals (ST-1.1). An
 * employee row still holding one of those strings is not in this union, so it
 * misses the map below and falls through to the workspace's own profile — which
 * for a dropped vertical is GENERAL. That is the intended degrade, not a gap.
 */
export type EmployeePrimaryModule =
  | "HR"
  | "GOLD"
  | "RETAIL"
  | "THRIFT"
  | "SCHOOLS";

const EMPLOYEE_MODULE_PROFILE_MAP: Record<EmployeePrimaryModule, ActiveWorkspaceProfile | null> = {
  HR: null,
  GOLD: "GOLD_MINE",
  RETAIL: "RETAIL",
  THRIFT: "RETAIL",
  SCHOOLS: "SCHOOLS",
};

export function resolveWorkspaceProfileForRoles(args: {
  workspaceProfile: string | null | undefined;
  enabledFeatures?: string[] | undefined;
}): ActiveWorkspaceProfile {
  return resolveActiveWorkspaceProfile(args);
}

export function resolveWorkspaceProfileForEmployeeModule(args: {
  primaryModule: string | null | undefined;
  workspaceProfile: string | null | undefined;
  enabledFeatures?: string[] | undefined;
}): ActiveWorkspaceProfile {
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
  return getRegisteredRoles(profile, args.enabledFeatures);
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
