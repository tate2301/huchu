import { Prisma, type MembershipStatus, type UserRole, type WorkspaceMembership } from "@prisma/client";

import { repriceCompany } from "@/lib/platform/entitlements";
import { prisma } from "@/lib/prisma";

import { recordTeamsChange } from "./audit";
import type { Db } from "./db";
import { TeamsRefusal } from "./errors";
import { handOverAll, ownedRecordCount } from "./record-team";
import { lockSeats, requireSeat } from "./seats";

/**
 * Members: a person's place in a workspace.
 *
 * `User` still carries the sign-in (`companyId`, `role`, `isActive`); the
 * membership carries who owns the workspace, who is an admin and what state
 * the person is in. Every user is created through `createMember` so the two are
 * born together, and every writer that changes a user's role or access calls
 * `syncMemberships` so they stay together.
 */

type UserSelection = Prisma.UserSelect | undefined;

/**
 * Create a user and their membership in one write. Every `prisma.user.create`
 * goes through here.
 *
 * `owner` makes them the workspace's owner: only provisioning passes it, for
 * the person who set the workspace up.
 */
export async function createMember<S extends UserSelection = undefined>(
  db: Db,
  args: {
    data: Prisma.UserUncheckedCreateInput;
    select?: S;
    owner?: boolean;
    /** Who added them, for the audit line; null (the default) for the system, a seed or a script. */
    actorId?: string | null;
    /** How they came in: "invite", "invite_link", "provisioning" ... */
    reason?: string;
  },
): Promise<Prisma.UserGetPayload<{ select: S }>> {
  const { data } = args;
  const owner = args.owner ?? false;
  const active = data.isActive ?? true;
  const removedAt = data.accessRemovedAt ? new Date(data.accessRemovedAt) : null;
  const status: MembershipStatus = active ? "ACTIVE" : removedAt ? "REMOVED" : "SUSPENDED";
  const isAdmin = data.role === "SUPERADMIN" && !owner;
  const made = await db.user.create({
    data: {
      ...data,
      memberships: {
        create: {
          companyId: data.companyId,
          role: data.role,
          status,
          isOwner: owner,
          isAdmin,
          suspendedAt: status === "SUSPENDED" ? new Date() : null,
          removedAt,
          removedById: data.accessRemovedById ?? null,
        },
      },
    },
    // The id is always read, for the audit line; the caller's own selection rides along.
    select: (args.select ? { ...args.select, id: true } : undefined) as never,
  });
  const membership = await db.workspaceMembership.findFirst({ where: { userId: (made as { id: string }).id, companyId: data.companyId }, select: { id: true } });
  await recordTeamsChange(db, {
    companyId: data.companyId,
    actorId: args.actorId ?? null,
    change: "member.added",
    entityType: "membership",
    entityId: membership?.id ?? (made as { id: string }).id,
    after: { status, role: data.role, isAdmin, isOwner: owner },
    reason: args.reason,
  });
  return made as unknown as Prisma.UserGetPayload<{ select: S }>;
}

/**
 * Bring memberships into line with their users: one person, or everyone in a
 * workspace. Creates a membership a user does not have yet. For the writers
 * that change `User.role` or `User.isActive` directly.
 *
 * A pending invitee (INVITED) is left alone; ownership is never touched here.
 */
export async function syncMemberships(db: Db, scope: { userId: string } | { companyId: string }): Promise<void> {
  const where = "userId" in scope ? Prisma.sql`u."id" = ${scope.userId}` : Prisma.sql`u."companyId" = ${scope.companyId}`;
  await db.$executeRaw`
    INSERT INTO "WorkspaceMembership" AS m ("id", "companyId", "userId", "status", "role", "isAdmin", "suspendedAt", "removedAt", "removedById", "createdAt", "updatedAt")
    SELECT
      gen_random_uuid()::text, u."companyId", u."id",
      (CASE WHEN u."isActive" THEN 'ACTIVE' WHEN u."accessRemovedAt" IS NOT NULL THEN 'REMOVED' ELSE 'SUSPENDED' END)::"MembershipStatus",
      u."role", u."role" = 'SUPERADMIN',
      CASE WHEN NOT u."isActive" AND u."accessRemovedAt" IS NULL THEN CURRENT_TIMESTAMP END,
      u."accessRemovedAt", u."accessRemovedById", u."createdAt", CURRENT_TIMESTAMP
    FROM "User" u
    WHERE ${where}
    ON CONFLICT ("companyId", "userId") DO UPDATE SET
      "status" = EXCLUDED."status",
      "role" = EXCLUDED."role",
      "isAdmin" = (EXCLUDED."role" = 'SUPERADMIN' AND NOT m."isOwner"),
      "suspendedAt" = CASE WHEN EXCLUDED."status" = 'SUSPENDED' THEN COALESCE(m."suspendedAt", EXCLUDED."suspendedAt") END,
      "removedAt" = EXCLUDED."removedAt",
      "removedById" = EXCLUDED."removedById",
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE m."status" <> 'INVITED'`;
}

/** The people who can act on a workspace's members. */
type Actor = { companyId: string; userId: string };

type Held = WorkspaceMembership & { user: { id: string; name: string } };

async function heldBy(tx: Prisma.TransactionClient, companyId: string, where: { id?: string; userId?: string }): Promise<Held | null> {
  return tx.workspaceMembership.findFirst({ where: { companyId, ...where }, include: { user: { select: { id: true, name: true } } } });
}

async function actorIn(tx: Prisma.TransactionClient, actor: Actor): Promise<Held> {
  const held = await heldBy(tx, actor.companyId, { userId: actor.userId });
  if (!held || held.status !== "ACTIVE") throw new TeamsRefusal("NOT_A_MEMBER", "You are not a member of this workspace.");
  return held;
}

async function targetIn(tx: Prisma.TransactionClient, companyId: string, membershipId: string): Promise<Held> {
  const held = await heldBy(tx, companyId, { id: membershipId });
  if (!held) throw new TeamsRefusal("NOT_FOUND", "That person is not a member of this workspace.");
  return held;
}

/** Whether `actor` may suspend, restore or remove `target`: the owner anyone but themselves; an admin members who are not admins. */
function mayManage(actor: Held, target: Held): boolean {
  if (actor.id === target.id || target.isOwner) return false;
  if (actor.isOwner) return true;
  return actor.isAdmin && !target.isAdmin;
}

async function otherActiveAdmins(tx: Prisma.TransactionClient, target: Held): Promise<number> {
  return tx.workspaceMembership.count({
    where: { companyId: target.companyId, isAdmin: true, status: "ACTIVE", id: { not: target.id } },
  });
}

async function refuseUnlessManageable(tx: Prisma.TransactionClient, actor: Held, target: Held, verb: string) {
  if (target.isOwner) throw new TeamsRefusal("IS_OWNER", `${target.user.name} owns this workspace. Offer ownership to someone else first.`);
  if (actor.id === target.id) throw new TeamsRefusal("SELF", `You cannot ${verb} yourself.`);
  if (!mayManage(actor, target)) {
    throw new TeamsRefusal(target.isAdmin ? "OWNER_ONLY" : "NOT_ALLOWED", target.isAdmin ? "Only the owner can do that to an admin." : "You cannot do that.");
  }
  if (target.isAdmin && (await otherActiveAdmins(tx, target)) === 0) {
    throw new TeamsRefusal("LAST_ADMIN", `${target.user.name} is the only admin. Make someone else an admin first.`);
  }
}

const shown = (held: Held) => ({ status: held.status, role: held.role, isAdmin: held.isAdmin });

/** Free the seat and end their sessions. Everything they did stays. */
export async function suspendMember(
  actor: Actor,
  membershipId: string,
  now = new Date(),
  /** `until`: the day they are due back, written on the audit line. `handTo`: who takes the records they own. */
  options: { until?: Date | null; handTo?: string } = {},
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const by = await actorIn(tx, actor);
    const target = await targetIn(tx, actor.companyId, membershipId);
    if (target.status === "SUSPENDED") return;
    if (target.status !== "ACTIVE") throw new TeamsRefusal("NOT_OPEN", `${target.user.name} is not an active member.`);
    await refuseUnlessManageable(tx, by, target, "suspend");
    if (options.handTo) {
      if (options.handTo === target.id) throw new TeamsRefusal("SELF", "Choose someone else to take them over.");
      await handOverAll(tx, actor, target.id, options.handTo, `${target.user.name} is suspended.`);
    }
    await tx.user.update({ where: { id: target.userId }, data: { isActive: false, sessionsEndedAt: now } });
    const after = await tx.workspaceMembership.update({ where: { id: target.id }, data: { status: "SUSPENDED", suspendedAt: now } });
    await recordTeamsChange(tx, {
      companyId: actor.companyId,
      actorId: actor.userId,
      change: "member.suspended",
      entityType: "membership",
      entityId: target.id,
      before: shown(target),
      after: { ...shown({ ...target, ...after }), ...(options.until ? { until: options.until.toISOString() } : {}) },
    });
  });
  await repriceCompany(actor.companyId);
}

/**
 * Remove them from the workspace. Their name stays on everything they did.
 *
 * The records they own go to `handTo` in the same step; while they own any and
 * no one is named, it is refused (OPEN_WORK) so nothing is left without an
 * owner.
 */
export async function removeMember(actor: Actor, membershipId: string, options: { handTo?: string; now?: Date } = {}): Promise<void> {
  const now = options.now ?? new Date();
  await prisma.$transaction(async (tx) => {
    const by = await actorIn(tx, actor);
    const target = await targetIn(tx, actor.companyId, membershipId);
    if (target.status === "REMOVED") return;
    await refuseUnlessManageable(tx, by, target, "remove");
    const owned = await ownedRecordCount(tx, actor.companyId, target.id);
    if (owned > 0) {
      if (!options.handTo) {
        throw new TeamsRefusal("OPEN_WORK", `${target.user.name} owns ${owned} ${owned === 1 ? "record" : "records"}. Choose who takes them over.`);
      }
      if (options.handTo === target.id) throw new TeamsRefusal("SELF", "Choose someone else to take them over.");
      await handOverAll(tx, actor, target.id, options.handTo, `${target.user.name} was removed from the workspace.`);
    }
    await tx.user.update({
      where: { id: target.userId },
      data: { isActive: false, accessRemovedAt: now, accessRemovedById: actor.userId, sessionsEndedAt: now },
    });
    const after = await tx.workspaceMembership.update({
      where: { id: target.id },
      data: { status: "REMOVED", removedAt: now, removedById: actor.userId },
    });
    await recordTeamsChange(tx, {
      companyId: actor.companyId,
      actorId: actor.userId,
      change: "member.removed",
      entityType: "membership",
      entityId: target.id,
      before: shown(target),
      after: shown({ ...target, ...after }),
    });
  });
  await repriceCompany(actor.companyId);
}

/**
 * Bring a suspended or removed person back. It takes a seat, so it is refused
 * while the workspace is full.
 */
export async function restoreMember(actor: Actor, membershipId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const by = await actorIn(tx, actor);
    const target = await targetIn(tx, actor.companyId, membershipId);
    if (target.status === "ACTIVE") return;
    if (target.status === "INVITED") throw new TeamsRefusal("NOT_OPEN", `${target.user.name} has not joined yet.`);
    if (!mayManage(by, target)) {
      throw new TeamsRefusal(target.isAdmin ? "OWNER_ONLY" : "NOT_ALLOWED", target.isAdmin ? "Only the owner can do that to an admin." : "You cannot do that.");
    }
    await lockSeats(tx, actor.companyId);
    await requireSeat(tx, actor.companyId, target.role);
    await tx.user.update({ where: { id: target.userId }, data: { isActive: true, accessRemovedAt: null, accessRemovedById: null } });
    const after = await tx.workspaceMembership.update({
      where: { id: target.id },
      data: { status: "ACTIVE", suspendedAt: null, removedAt: null, removedById: null },
    });
    await recordTeamsChange(tx, {
      companyId: actor.companyId,
      actorId: actor.userId,
      change: "member.restored",
      entityType: "membership",
      entityId: target.id,
      before: shown(target),
      after: shown({ ...target, ...after }),
    });
  });
  await repriceCompany(actor.companyId);
}

/**
 * Change what someone does. Making someone an admin, or taking it away, is the
 * owner's alone: an admin cannot move anyone to or from admin.
 */
export async function changeMemberRole(actor: Actor, membershipId: string, role: UserRole): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const by = await actorIn(tx, actor);
    const target = await targetIn(tx, actor.companyId, membershipId);
    if (target.status === "REMOVED") throw new TeamsRefusal("NOT_OPEN", `${target.user.name} has been removed.`);
    if (target.role === role) return;
    const touchesAdmin = role === "SUPERADMIN" || target.role === "SUPERADMIN";
    if (!by.isOwner && (!by.isAdmin || touchesAdmin || target.isOwner)) {
      throw new TeamsRefusal(touchesAdmin ? "OWNER_ONLY" : "NOT_ALLOWED", touchesAdmin ? "Only the owner can make or unmake an admin." : "You cannot do that.");
    }
    if (target.isAdmin && role !== "SUPERADMIN" && (await otherActiveAdmins(tx, target)) === 0) {
      throw new TeamsRefusal("LAST_ADMIN", `${target.user.name} is the only admin. Make someone else an admin first.`);
    }
    await tx.user.update({ where: { id: target.userId }, data: { role } });
    // A new role starts from that role's features, as it does in the product.
    await tx.userFeatureFlag.deleteMany({ where: { userId: target.userId } });
    const after = await tx.workspaceMembership.update({
      where: { id: target.id },
      data: { role, isAdmin: role === "SUPERADMIN" && !target.isOwner },
    });
    await recordTeamsChange(tx, {
      companyId: actor.companyId,
      actorId: actor.userId,
      change: touchesAdmin ? "member.admin_changed" : "member.role_changed",
      entityType: "membership",
      entityId: target.id,
      before: shown(target),
      after: shown({ ...target, ...after }),
    });
  });
  await repriceCompany(actor.companyId);
}

/**
 * Give a workspace that has no owner its earliest active manager or superadmin,
 * the rule the migration backfilled by. For seeds and for workspaces made
 * without provisioning; a workspace with an owner is left alone.
 */
export async function ensureOwner(db: Db, companyId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE "WorkspaceMembership" m SET "isOwner" = true, "isAdmin" = false, "updatedAt" = CURRENT_TIMESTAMP
    FROM (
      SELECT "id" FROM "WorkspaceMembership"
      WHERE "companyId" = ${companyId} AND "status" = 'ACTIVE' AND "role" IN ('MANAGER', 'SUPERADMIN')
      ORDER BY "createdAt", "id" LIMIT 1
    ) earliest
    WHERE m."id" = earliest."id"
      AND NOT EXISTS (SELECT 1 FROM "WorkspaceMembership" held WHERE held."companyId" = ${companyId} AND held."isOwner")`;
}
