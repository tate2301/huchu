import { z } from "zod";

import type { AuthenticatedSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export const managedRoleSchema = z.enum(["MANAGER", "CLERK"]);
export type ManagedRole = z.infer<typeof managedRoleSchema>;

export function canViewUserManagement(session: AuthenticatedSession): boolean {
  return session.user.role === "SUPERADMIN" || session.user.role === "MANAGER";
}

export function canMutateUserManagement(session: AuthenticatedSession): boolean {
  return session.user.role === "SUPERADMIN";
}

export function isManagedRole(role: string): role is ManagedRole {
  return role === "MANAGER" || role === "CLERK";
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
