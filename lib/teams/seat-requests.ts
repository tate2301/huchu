import type { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { recordTeamsChange, TEAMS_EVENT_PREFIX } from "./audit";
import type { Db } from "./db";
import { TeamsRefusal } from "./errors";
import { createInvite } from "./invites";
import { settleTeamsNotifications } from "./notify";
import { seatLine, setSeatLimit } from "./seats";
import { roleWord } from "./words";

/**
 * A request for a seat, from an admin to the owner, while every seat is taken. The request is the audit line
 * `seats.requested` (what was typed) and the owner's Needs you notice (what waits); the owner's answer settles
 * the notice. Adding the seat raises the limit and sends the invite the admin typed, in one step.
 */

type Actor = { companyId: string; userId: string };

export type SeatRequestState = "open" | "not-now" | "added" | "removed";

export type SeatRequest = {
  ref: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: UserRole;
  roleWord: string;
  askedById: string;
  askedBy: string;
  askedAt: string;
  state: SeatRequestState;
  decidedAt: string | null;
};

type Asked = { name: string; role: UserRole; phone?: string | null; email?: string | null; ref: string };

function stateOf(actions: Array<{ actedAt: Date | null; actionTaken: string | null }>): { state: SeatRequestState; at: Date | null } {
  const done = actions.find((a) => a.actedAt);
  if (!done) return { state: "open", at: null };
  const action = done.actionTaken;
  return { state: action === "seat-added" ? "added" : action === "removed" ? "removed" : "not-now", at: done.actedAt };
}

/** Requests still on the table: waiting for the owner, or answered "not now" and not yet removed. */
export async function listSeatRequests(db: Db, companyId: string, onlyRef?: string): Promise<SeatRequest[]> {
  const events = await db.platformAuditEvent.findMany({
    where: { companyId, eventType: `${TEAMS_EVENT_PREFIX}seats.requested`, createdAt: { gt: new Date(Date.now() - 30 * 86_400_000) }, ...(onlyRef ? { payloadJson: { contains: onlyRef } } : {}) },
    orderBy: { createdAt: "desc" },
  });
  if (events.length === 0) return [];
  const asked = events.flatMap((event) => {
    const after = (JSON.parse(event.payloadJson ?? "{}") as { after?: Asked }).after;
    return after?.ref ? [{ event, after }] : [];
  });
  const notices = await db.notification.findMany({
    where: { companyId, type: "TEAMS_SEAT_REQUEST", OR: asked.map(({ after }) => ({ payloadJson: { contains: `"ref":${JSON.stringify(after.ref)}` } })) },
    include: { recipients: { select: { actedAt: true, actionTaken: true } } },
  });
  const askers = await db.user.findMany({ where: { id: { in: [...new Set(asked.flatMap(({ event }) => (event.actor ? [event.actor] : [])))] } }, select: { id: true, name: true } });
  return asked.flatMap(({ event, after }) => {
    const notice = notices.find((n) => (n.payloadJson ?? "").includes(`"ref":${JSON.stringify(after.ref)}`));
    const { state, at } = stateOf(notice?.recipients ?? []);
    if (state === "added" || state === "removed") return [];
    return [
      {
        ref: after.ref,
        name: after.name,
        phone: after.phone ?? null,
        email: after.email ?? null,
        role: after.role,
        roleWord: roleWord({ role: after.role, isOwner: false, isAdmin: after.role === "SUPERADMIN" }),
        askedById: event.actor ?? "",
        askedBy: askers.find((a) => a.id === event.actor)?.name ?? "",
        askedAt: event.createdAt.toISOString(),
        state,
        decidedAt: at?.toISOString() ?? null,
      },
    ];
  });
}

async function requestFor(db: Db, actor: Actor, ref: string): Promise<SeatRequest> {
  const [found] = await listSeatRequests(db, actor.companyId, ref);
  if (!found || found.ref !== ref) throw new TeamsRefusal("NOT_FOUND", "That request is not open any more.");
  return found;
}

/** The owner adds the seat: the limit goes up by one and the invite the admin typed goes out. */
export async function addSeatForRequest(actor: Actor, ref: string, now = new Date()): Promise<{ inviteId: string; token: string; phone: string | null; email: string | null }> {
  const request = await requestFor(prisma, actor, ref);
  const line = await seatLine(prisma, actor.companyId, now);
  if (line.left === 0) await setSeatLimit(actor, line.limit + 1);
  const { invite, token } = await createInvite(
    { companyId: actor.companyId, userId: request.askedById },
    { name: request.name, phone: request.phone, email: request.email, role: request.role, channel: request.phone ? "WHATSAPP" : "EMAIL" },
    now,
  );
  await settleTeamsNotifications(prisma, { companyId: actor.companyId, type: "TEAMS_SEAT_REQUEST", ref, action: "seat-added" });
  return { inviteId: invite.id, token, phone: invite.phone, email: invite.email };
}

/** The owner says not now: the request stays as a draft with the admin, who can remove it. */
export async function declineSeatRequest(actor: Actor, ref: string, now = new Date()): Promise<void> {
  const by = await prisma.workspaceMembership.findFirst({ where: { companyId: actor.companyId, userId: actor.userId, status: "ACTIVE" } });
  if (!by?.isOwner) throw new TeamsRefusal("OWNER_ONLY", "Only the owner can answer a request for a seat.");
  await requestFor(prisma, actor, ref);
  await prisma.notificationRecipient.updateMany({
    where: { actedAt: null, notification: { companyId: actor.companyId, type: "TEAMS_SEAT_REQUEST", payloadJson: { contains: `"ref":${JSON.stringify(ref)}` } } },
    data: { isRead: true, readAt: now, actedAt: now, actionTaken: "not-now" },
  });
  await recordTeamsChange(prisma, { companyId: actor.companyId, actorId: actor.userId, change: "seats.declined", entityType: "seats", entityId: actor.companyId, after: { ref } });
}

/** The admin who asked takes the request off the list. */
export async function removeSeatRequest(actor: Actor, ref: string): Promise<void> {
  const request = await requestFor(prisma, actor, ref);
  const by = await prisma.workspaceMembership.findFirst({ where: { companyId: actor.companyId, userId: actor.userId, status: "ACTIVE" } });
  if (!by || (request.askedById !== actor.userId && !by.isOwner && !by.isAdmin)) throw new TeamsRefusal("NOT_ALLOWED", "You cannot do that.");
  const now = new Date();
  await prisma.notificationRecipient.updateMany({
    where: { notification: { companyId: actor.companyId, type: "TEAMS_SEAT_REQUEST", payloadJson: { contains: `"ref":${JSON.stringify(ref)}` } } },
    data: { isRead: true, readAt: now, actedAt: now, actionTaken: "removed" },
  });
  await recordTeamsChange(prisma, { companyId: actor.companyId, actorId: actor.userId, change: "seats.declined", entityType: "seats", entityId: actor.companyId, after: { ref }, reason: "removed" });
}
