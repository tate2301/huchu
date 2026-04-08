import { z } from "zod";

import type { AuthenticatedSession } from "@/lib/api-utils";
import { getAllowedUserRolesForWorkspace } from "@/lib/platform/vertical-roles";
import { prisma } from "@/lib/prisma";
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
    | "USER_RESET_FEATURE_ACCESS";
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
