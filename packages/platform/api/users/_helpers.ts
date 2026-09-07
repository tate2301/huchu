import { z } from "zod";

import type { AuthenticatedSession } from "../../api-utils";
import { getAllowedUserRolesForWorkspace } from "../../vertical-roles";
import { prisma } from "@corelithzw/db/client";
import { ROLES, type UserRole } from "../../roles";

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

export async function appendUserManagementEvent(input: {
  companyId: string;
  actorId: string;
  actorRole: string;
  eventType:
    | "USER_CREATE"
    | "USER_SET_STATUS"
    | "USER_RESET_PASSWORD"
    | "USER_CHANGE_ROLE"
    | "USER_SET_FEATURE_ACCESS"
    | "USER_RESET_FEATURE_ACCESS"
    | "USER_SET_PERMISSION"
    | "USER_DELETE";
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.provisioningEvent.create({
      data: {
        companyId: input.companyId,
        eventType: input.eventType,
        status: "SUCCESS",
        message: input.message,
        payloadJson: JSON.stringify({
          actorId: input.actorId,
          actorRole: input.actorRole,
          ...input.payload,
        }),
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    // Do not fail user lifecycle actions if audit append fails.
    console.error("[API] user-management audit append failed:", error);
  }
}
