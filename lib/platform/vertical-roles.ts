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

export function resolveWorkspaceProfileForRoles(args: {
  workspaceProfile: string | null | undefined;
  enabledFeatures?: string[] | undefined;
}): ManagedWorkspaceProfile {
  const normalized = normalizeWorkspaceProfileInput(args.workspaceProfile) as ManagedWorkspaceProfile | null;
  if (normalized && normalized in VERTICAL_USER_ROLES) return normalized;
  const inferred = inferWorkspaceProfileFromEnabledFeatures(args.enabledFeatures);
  if (inferred && inferred in VERTICAL_USER_ROLES) return inferred;
  return "GENERAL";
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
