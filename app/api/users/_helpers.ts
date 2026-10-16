import { z } from "zod";

import type { AuthenticatedSession } from "@/lib/api-utils";
import { getAllowedUserRolesForWorkspace } from "@/lib/platform/vertical-roles";
import { ROLES, type UserRole } from "@/lib/roles";

export const managedRoleSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
  z.enum(ROLES),
);
export type ManagedRole = UserRole;

export function canViewUserManagement(session: AuthenticatedSession): boolean {
  return session.user.role === "SUPERADMIN" || session.user.role === "MANAGER";
}

export function canMutateUserManagement(session: AuthenticatedSession): boolean {
  return session.user.role === "SUPERADMIN";
}

/**
 * Permissions are a wider door than the rest of user management on purpose.
 *
 * Creating accounts and resetting passwords are superadmin work because they
 * make new ways into the workspace. Deciding whether a rep on your team may
 * export a list is the job of whoever runs that team, and routing it through
 * one superadmin is how people end up over-permissioned: it is easier to ask
 * once for everything than four times for the right things.
 */
export function canManageUserPermissions(session: AuthenticatedSession): boolean {
  return session.user.role === "SUPERADMIN" || session.user.role === "MANAGER";
}

export function getManagedRolesForSession(session: AuthenticatedSession): UserRole[] {
  return getAllowedUserRolesForWorkspace({
    workspaceProfile: (session.user as { workspaceProfile?: string }).workspaceProfile,
    enabledFeatures: (session.user as { enabledFeatures?: string[] }).enabledFeatures,
  });
}

export function isManagedRole(session: AuthenticatedSession, role: string): role is ManagedRole {
  return getManagedRolesForSession(session).includes(role as UserRole);
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

