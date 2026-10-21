import type { UserRole } from "@prisma/client";

import { UNBILLED_ROLES } from "@/lib/platform/verticals";
import { prisma } from "@/lib/prisma";

import { recordTeamsChange } from "./audit";
import type { Db } from "./db";
import { TeamsRefusal } from "./errors";
import { notifySeatRequest, settleTeamsNotifications } from "./notify";

/**
 * Seats. The plan sets a limit (`Company.seatLimit`, five to start). Active
 * members and invites still waiting each hold one, till staff included; only
 * the school portal accounts (parents and students) do not. Suspending,
 * removing, revoking and letting an invite expire all free the seat, and
 * restoring or inviting needs one.
 *
 * A workspace already over its limit keeps working; it just cannot add anyone.
 */

export type SeatCount = { used: number; limit: number; members: number; invites: number };

export type SeatLine = SeatCount & {
  left: number;
  /** room: seats to spare; last: one left; full: none left (or over the limit). */
  state: "room" | "last" | "full";
  /** "4 of 5 seats used". */
  text: string;
};

const BILLED = { role: { notIn: [...UNBILLED_ROLES] as UserRole[] } };

/** An invite holds its seat until it is accepted, revoked or runs out. */
export function openInviteWhere(companyId: string, now: Date) {
  return { companyId, status: { in: ["SENT", "NOT_DELIVERED"] as Array<"SENT" | "NOT_DELIVERED"> }, expiresAt: { gt: now }, ...BILLED };
}

export async function seatCount(db: Db, companyId: string, now = new Date()): Promise<SeatCount> {
  const [company, members, invites] = await Promise.all([
    db.company.findUnique({ where: { id: companyId }, select: { seatLimit: true } }),
    db.workspaceMembership.count({ where: { companyId, status: "ACTIVE", ...BILLED } }),
    db.workspaceInvite.count({ where: openInviteWhere(companyId, now) }),
  ]);
  if (!company) throw new TeamsRefusal("NOT_FOUND", "That workspace does not exist.");
  return { used: members + invites, limit: company.seatLimit, members, invites };
}

export function seatLineOf(count: SeatCount): SeatLine {
  const left = Math.max(0, count.limit - count.used);
  return {
    ...count,
    left,
    state: left === 0 ? "full" : left === 1 ? "last" : "room",
    text: `${count.used} of ${count.limit} seats used`,
  };
}

/** What Members and the invite composer show: "4 of 5 seats used". */
export async function seatLine(db: Db, companyId: string, now = new Date()): Promise<SeatLine> {
  return seatLineOf(await seatCount(db, companyId, now));
}

/**
 * Whether one more person fits. Someone in a role that is not billed always
 * fits. Pass the role of whoever is being added.
 */
export async function canInvite(db: Db, companyId: string, role?: UserRole, now = new Date()): Promise<{ ok: boolean; line: SeatLine }> {
  const line = await seatLine(db, companyId, now);
  const free = role !== undefined && UNBILLED_ROLES.includes(role);
  return { ok: free || line.left > 0, line };
}

/** Throw SEATS_FULL unless one more person fits. */
export async function requireSeat(db: Db, companyId: string, role?: UserRole, now = new Date()): Promise<SeatLine> {
  const { ok, line } = await canInvite(db, companyId, role, now);
  if (!ok) throw new TeamsRefusal("SEATS_FULL", `All ${line.limit} seats are taken.`);
  return line;
}

/**
 * Take the workspace's lock for the rest of the transaction, so two people
 * filling the last seat at once cannot both succeed. Call before counting.
 */
export async function lockSeats(tx: Pick<Db, "$queryRaw">, companyId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id" = ${companyId} FOR UPDATE`;
}

/** Raise or lower the limit: the owner's alone (billing moves with it). */
export async function setSeatLimit(actor: { companyId: string; userId: string }, limit: number): Promise<SeatLine> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) throw new TeamsRefusal("INVALID", "Choose a whole number of seats.");
  return prisma.$transaction(async (tx) => {
    const by = await tx.workspaceMembership.findFirst({ where: { companyId: actor.companyId, userId: actor.userId, status: "ACTIVE" } });
    if (!by) throw new TeamsRefusal("NOT_A_MEMBER", "You are not a member of this workspace.");
    if (!by.isOwner) throw new TeamsRefusal("OWNER_ONLY", "Only the owner can change the number of seats.");
    await lockSeats(tx, actor.companyId);
    const before = await seatCount(tx, actor.companyId);
    if (before.limit !== limit) {
      await tx.company.update({ where: { id: actor.companyId }, data: { seatLimit: limit } });
      await recordTeamsChange(tx, {
        companyId: actor.companyId,
        actorId: actor.userId,
        change: "seats.limit_changed",
        entityType: "seats",
        entityId: actor.companyId,
        before: { limit: before.limit, used: before.used },
        after: { limit, used: before.used },
      });
      if (limit > before.limit) await settleTeamsNotifications(tx, { companyId: actor.companyId, type: "TEAMS_SEAT_REQUEST", action: "seat-added" });
    }
    return seatLineOf({ ...before, limit });
  });
}

/**
 * An admin asks the owner for a seat when the workspace is full: the owner
 * gets a Needs you notice with the name and role the admin typed. Refused
 * when a seat is free (just invite) or when the owner asks themselves.
 */
export async function requestSeat(actor: { companyId: string; userId: string }, input: { name: string; role: UserRole }, now = new Date()): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new TeamsRefusal("INVALID", "Say who the seat is for.");
  await prisma.$transaction(async (tx) => {
    const by = await tx.workspaceMembership.findFirst({ where: { companyId: actor.companyId, userId: actor.userId, status: "ACTIVE" }, include: { user: { select: { name: true } } } });
    if (!by) throw new TeamsRefusal("NOT_A_MEMBER", "You are not a member of this workspace.");
    if (!by.isOwner && !by.isAdmin) throw new TeamsRefusal("NOT_ALLOWED", "Only an owner or admin can ask for a seat.");
    if (by.isOwner) throw new TeamsRefusal("SELF", "You own this workspace. Raise the number of seats yourself.");
    const owner = await tx.workspaceMembership.findFirst({ where: { companyId: actor.companyId, isOwner: true, status: "ACTIVE" } });
    if (!owner) throw new TeamsRefusal("NOT_FOUND", "This workspace has no owner to ask.");
    const line = await seatLine(tx, actor.companyId, now);
    if (line.left > 0) throw new TeamsRefusal("NOT_OPEN", `There ${line.left === 1 ? "is a seat" : "are seats"} free. Invite them.`);
    const ref = crypto.randomUUID();
    await recordTeamsChange(tx, {
      companyId: actor.companyId,
      actorId: actor.userId,
      change: "seats.requested",
      entityType: "seats",
      entityId: actor.companyId,
      after: { name, role: input.role, used: line.used, limit: line.limit, ref },
    });
    await notifySeatRequest(tx, {
      companyId: actor.companyId,
      ownerUserId: owner.userId,
      requestedById: actor.userId,
      requestedBy: by.user.name,
      name,
      role: input.role.toLowerCase().replace(/_/g, " "),
      ref,
    });
  });
}
