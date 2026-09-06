import {
  getAllowedUserRoleOptionsForWorkspace,
  USER_ROLE_LABELS,
} from "@corelithzw/platform/vertical-roles";
import {
  USER_MANAGEMENT_ROLES,
  type OrganizationListItem,
  type UserManagementRole,
  type UserRole,
} from "./types";

export type UserManagementRoleOption = {
  value: UserManagementRole;
  label: string;
};

const USER_MANAGEMENT_ROLE_SET = new Set<string>(USER_MANAGEMENT_ROLES);

function isUserManagementRole(role: string): role is UserManagementRole {
  return USER_MANAGEMENT_ROLE_SET.has(role);
}

export function getUserRoleLabel(role: UserRole | UserManagementRole): string {
  return USER_ROLE_LABELS[role as UserRole] ?? role;
}

export function getUserRoleOptionsForOrganization(
  organization: Pick<OrganizationListItem, "workspaceProfile" | "enabledFeatures"> | null | undefined,
): UserManagementRoleOption[] {
  return getAllowedUserRoleOptionsForWorkspace({
    workspaceProfile: organization?.workspaceProfile,
    enabledFeatures: organization?.enabledFeatures,
  }).filter((option): option is UserManagementRoleOption =>
    isUserManagementRole(option.value),
  );
}

export function getAllUserManagementRoleOptions(): UserManagementRoleOption[] {
  return USER_MANAGEMENT_ROLES.map((role) => ({
    value: role,
    label: getUserRoleLabel(role),
  }));
}
