import { prisma } from "@/lib/prisma";

/** What changed about a person's account, as Management → Users records it. */
export type UserManagementEventType =
  | "USER_CREATE"
  | "USER_SET_STATUS"
  | "USER_RESET_PASSWORD"
  | "USER_CHANGE_ROLE"
  | "USER_CHANGE_MEMBER_KIND"
  | "USER_SET_FEATURE_ACCESS"
  | "USER_RESET_FEATURE_ACCESS"
  | "USER_SET_PERMISSION"
  | "USER_DELETE";

/** Appends one change to a person's account to the workspace's record of them. */
export async function appendUserManagementEvent(input: {
  companyId: string;
  actorId: string;
  actorRole: string;
  eventType: UserManagementEventType;
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
