import type { NotificationType } from "@prisma/client";

import { emitTeamsNotification } from "@/lib/notifications";

import type { Db } from "./db";

/**
 * What the people who must act are told. Every one is a "needs you" item: it
 * stays in the inbox until the person acts on it (the workflow settles it) or
 * dismisses it, however often it is opened.
 *
 * All of them run inside the transaction that makes the change they are about.
 */

type Tx = Parameters<typeof emitTeamsNotification>[0];

export function notifySeatRequest(
  db: Db,
  args: { companyId: string; ownerUserId: string; requestedById: string; requestedBy: string; name: string; role: string; ref: string },
) {
  return emitTeamsNotification(db as Tx, {
    companyId: args.companyId,
    recipientIds: [args.ownerUserId],
    actorId: args.requestedById,
    type: "TEAMS_SEAT_REQUEST",
    title: `${args.requestedBy} asked for a seat`,
    summary: `${args.requestedBy} wants to add ${args.name} as ${args.role}. All the seats are taken.`,
    viewPath: "/settings/members",
    ref: args.ref,
  });
}

export function notifyOwnershipOffer(
  db: Db,
  args: { companyId: string; toUserId: string; fromUserId: string; fromName: string; workspace: string; offerId: string; lapses: Date },
) {
  return emitTeamsNotification(db as Tx, {
    companyId: args.companyId,
    recipientIds: [args.toUserId],
    actorId: args.fromUserId,
    type: "TEAMS_OWNERSHIP_OFFER",
    title: `${args.fromName} offered you ownership of ${args.workspace}`,
    summary: "Billing moves to you and they become an admin. The offer lapses in 7 days.",
    viewPath: "/settings/members",
    ref: args.offerId,
    expiresAt: args.lapses,
  });
}

export function notifyRecordHandedOver(
  db: Db,
  args: { companyId: string; toUserId: string; fromUserId: string; fromName: string; recordLabel: string; viewPath: string; ref: string; note?: string },
) {
  return emitTeamsNotification(db as Tx, {
    companyId: args.companyId,
    recipientIds: [args.toUserId],
    actorId: args.fromUserId,
    type: "TEAMS_RECORD_HANDED_OVER",
    title: `${args.fromName} handed ${args.recordLabel} to you`,
    summary: args.note ? `You now own ${args.recordLabel}. ${args.note}` : `You now own ${args.recordLabel}.`,
    viewPath: args.viewPath,
    ref: args.ref,
  });
}

export function notifyAccessRequest(
  db: Db,
  args: { companyId: string; ownerUserIds: string[]; requestedById: string; requestedBy: string; recordLabel: string; viewPath: string; ref: string },
) {
  return emitTeamsNotification(db as Tx, {
    companyId: args.companyId,
    recipientIds: args.ownerUserIds,
    actorId: args.requestedById,
    type: "TEAMS_ACCESS_REQUEST",
    title: `${args.requestedBy} asked to see ${args.recordLabel}`,
    summary: `${args.requestedBy} cannot open ${args.recordLabel}. Grant or deny access.`,
    viewPath: args.viewPath,
    ref: args.ref,
  });
}

/**
 * The thing a notification asked for has been done (or refused, or lapsed):
 * mark every recipient's copy acted on, so it leaves Needs you for all of them.
 * Without a `ref`, every open one of that type in the workspace.
 */
export async function settleTeamsNotifications(db: Db, args: { companyId: string; type: NotificationType; ref?: string; action: string }): Promise<void> {
  const now = new Date();
  await db.notificationRecipient.updateMany({
    where: {
      actedAt: null,
      notification: {
        companyId: args.companyId,
        type: args.type,
        ...(args.ref ? { payloadJson: { contains: `"ref":${JSON.stringify(args.ref)}` } } : {}),
      },
    },
    data: { isRead: true, readAt: now, actedAt: now, actionTaken: args.action },
  });
}
