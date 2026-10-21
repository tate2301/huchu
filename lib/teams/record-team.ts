import type { Prisma, RecordAccessGrant, RecordSubjectType, RecordTeamMember } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { recordTeamsChange } from "./audit";
import type { Db } from "./db";
import { TeamsRefusal } from "./errors";
import { notifyAccessRequest, notifyRecordHandedOver, settleTeamsNotifications } from "./notify";

/**
 * The team on a record. One owner of the job, others working on it, and
 * people who only follow it (`followsOnly`). Being on the team means following
 * the record; following alone means being told, not working on it. A record a
 * person is not on is opened by asking: the owner (or an admin) lets them in
 * with a per-record grant.
 *
 * A record is a `(type, id)` pair, the same one comments and files use, so a
 * deal, a student, a customer or a product all work the same way. This file
 * does not know whether the record exists; the caller has checked.
 */

export type RecordRef = { type: RecordSubjectType; id: string };
type Actor = { companyId: string; userId: string };
/** What the notices call the record, and where they link to. */
export type RecordLabel = { label: string; viewPath: string };

const where = (companyId: string, record: RecordRef) => ({ companyId, subjectType: record.type, subjectId: record.id });
const shownRecord = (record: RecordRef) => ({ subjectType: record.type, subjectId: record.id });

type Tx = Prisma.TransactionClient;
type Seat = Awaited<ReturnType<typeof actorIn>>;

async function actorIn(tx: Db, actor: Actor) {
  const held = await tx.workspaceMembership.findFirst({
    where: { companyId: actor.companyId, userId: actor.userId, status: "ACTIVE" },
    include: { user: { select: { name: true } } },
  });
  if (!held) throw new TeamsRefusal("NOT_A_MEMBER", "You are not a member of this workspace.");
  return held;
}

async function activeMember(tx: Db, companyId: string, membershipId: string) {
  const held = await tx.workspaceMembership.findFirst({ where: { id: membershipId, companyId }, include: { user: { select: { name: true } } } });
  if (!held) throw new TeamsRefusal("NOT_FOUND", "That person is not a member of this workspace.");
  if (held.status !== "ACTIVE") throw new TeamsRefusal("NOT_OPEN", `${held.user.name} is not an active member.`);
  return held;
}

const isAdminOf = (member: { isOwner: boolean; isAdmin: boolean }) => member.isOwner || member.isAdmin;

async function ownerRow(tx: Db, companyId: string, record: RecordRef) {
  return tx.recordTeamMember.findFirst({ where: { ...where(companyId, record), isOwner: true }, include: { membership: { include: { user: { select: { name: true } } } } } });
}

/** Whether `by` runs this record: its owner, or the workspace's owner or an admin. */
async function runsRecord(tx: Db, by: Seat, record: RecordRef): Promise<boolean> {
  if (isAdminOf(by)) return true;
  const mine = await tx.recordTeamMember.findFirst({ where: { ...where(by.companyId, record), membershipId: by.id, isOwner: true } });
  return Boolean(mine);
}

const shownRow = (row: Pick<RecordTeamMember, "isOwner" | "followsOnly">) => ({ isOwner: row.isOwner, followsOnly: row.followsOnly });

/**
 * Whether a person can open a record: they are on its team, they hold a grant
 * for it, or they own or administer the workspace.
 */
export async function canSeeRecord(db: Db, companyId: string, record: RecordRef, userId: string): Promise<boolean> {
  const member = await db.workspaceMembership.findFirst({ where: { companyId, userId, status: "ACTIVE" } });
  if (!member) return false;
  if (isAdminOf(member)) return true;
  const [team, grant] = await Promise.all([
    db.recordTeamMember.findFirst({ where: { ...where(companyId, record), membershipId: member.id }, select: { id: true } }),
    db.recordAccessGrant.findFirst({ where: { ...where(companyId, record), membershipId: member.id, status: "ACTIVE" }, select: { id: true } }),
  ]);
  return Boolean(team || grant);
}

export type TeamEntry = {
  id: string;
  membershipId: string;
  userId: string;
  name: string;
  isOwner: boolean;
  followsOnly: boolean;
  /** Owner first, then the people working on it, then followers; each by when they joined. */
  joinedAt: Date;
};

/** The team on a record, in the order a team list shows it. */
export async function recordTeam(db: Db, companyId: string, record: RecordRef): Promise<TeamEntry[]> {
  const rows = await db.recordTeamMember.findMany({
    where: where(companyId, record),
    include: { membership: { select: { id: true, userId: true, user: { select: { name: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return rows
    .map((row) => ({
      id: row.id,
      membershipId: row.membershipId,
      userId: row.membership.userId,
      name: row.membership.user.name,
      isOwner: row.isOwner,
      followsOnly: row.followsOnly,
      joinedAt: row.createdAt,
    }))
    .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || Number(a.followsOnly) - Number(b.followsOnly) || a.joinedAt.getTime() - b.joinedAt.getTime());
}

/** Everyone on the record's team (working or following) who is still a member, for who to tell. */
export async function teamUserIds(db: Db, companyId: string, record: RecordRef): Promise<string[]> {
  const rows = await db.recordTeamMember.findMany({
    where: { ...where(companyId, record), membership: { status: "ACTIVE" } },
    select: { membership: { select: { userId: true } } },
  });
  return rows.map((row) => row.membership.userId);
}

async function put(
  tx: Tx,
  by: Seat,
  target: { id: string; userId: string },
  record: RecordRef,
  mode: { followsOnly: boolean; owner?: boolean },
): Promise<{ row: RecordTeamMember; before: RecordTeamMember | null }> {
  const before = await tx.recordTeamMember.findUnique({
    where: { companyId_subjectType_subjectId_membershipId: { companyId: by.companyId, subjectType: record.type, subjectId: record.id, membershipId: target.id } },
  });
  // Joining never demotes: a person already working on it who follows stays working on it.
  const followsOnly = before ? before.followsOnly && mode.followsOnly : mode.followsOnly;
  const row = before
    ? await tx.recordTeamMember.update({ where: { id: before.id }, data: { followsOnly, isOwner: mode.owner ? true : before.isOwner } })
    : await tx.recordTeamMember.create({ data: { ...where(by.companyId, record), membershipId: target.id, followsOnly, isOwner: Boolean(mode.owner) } });
  return { row, before };
}

/**
 * Put someone on the team to work on the record: yourself, or (as the record's
 * owner or a workspace admin) someone else. `owner: true` makes them owner of a
 * record that has none; to change an owner, hand it over.
 */
export async function joinTeam(actor: Actor, record: RecordRef, options: { membershipId?: string; owner?: boolean } = {}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const by = await actorIn(tx, actor);
    const target = options.membershipId && options.membershipId !== by.id ? await activeMember(tx, actor.companyId, options.membershipId) : by;
    if (target.id !== by.id && !(await runsRecord(tx, by, record))) throw new TeamsRefusal("NOT_ALLOWED", "Only the record's owner or an admin can add someone to its team.");
    if (target.id === by.id && !(await canSeeRecord(tx, actor.companyId, record, actor.userId))) {
      throw new TeamsRefusal("NOT_ALLOWED", "You cannot open this record. Ask for access first.");
    }
    if (options.owner) {
      if (await ownerRow(tx, actor.companyId, record)) throw new TeamsRefusal("ALREADY_ON_TEAM", "This record already has an owner. Hand it over instead.");
      if (target.id !== by.id && !isAdminOf(by) && !(await runsRecord(tx, by, record))) throw new TeamsRefusal("NOT_ALLOWED", "You cannot do that.");
    }
    const { row, before } = await put(tx, by, target, record, { followsOnly: false, owner: options.owner });
    if (before && !before.followsOnly && before.isOwner === row.isOwner) return;
    await recordTeamsChange(tx, {
      companyId: actor.companyId,
      actorId: actor.userId,
      change: "record_team.joined",
      entityType: "record_team",
      entityId: row.id,
      before: before ? { ...shownRecord(record), ...shownRow(before) } : null,
      after: { ...shownRecord(record), membership: target.id, ...shownRow(row) },
    });
  });
}

/** Step off the team (or stop following). The owner cannot: hand the record over first. */
export async function leaveTeam(actor: Actor, record: RecordRef, options: { membershipId?: string } = {}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const by = await actorIn(tx, actor);
    const target = options.membershipId && options.membershipId !== by.id ? await activeMember(tx, actor.companyId, options.membershipId) : by;
    if (target.id !== by.id && !(await runsRecord(tx, by, record))) throw new TeamsRefusal("NOT_ALLOWED", "Only the record's owner or an admin can take someone off its team.");
    const row = await tx.recordTeamMember.findUnique({
      where: { companyId_subjectType_subjectId_membershipId: { companyId: actor.companyId, subjectType: record.type, subjectId: record.id, membershipId: target.id } },
    });
    if (!row) return;
    if (row.isOwner) throw new TeamsRefusal("IS_OWNER", `${target.user.name} owns this record. Hand it over first.`);
    await tx.recordTeamMember.delete({ where: { id: row.id } });
    await recordTeamsChange(tx, {
      companyId: actor.companyId,
      actorId: actor.userId,
      change: row.followsOnly ? "record_team.unfollowed" : "record_team.left",
      entityType: "record_team",
      entityId: row.id,
      before: { ...shownRecord(record), membership: target.id, ...shownRow(row) },
      after: null,
    });
  });
}

/**
 * Follow a record: told about it, not working on it. A person already on the
 * team is already following, so nothing changes for them.
 */
export async function followRecord(actor: Actor, record: RecordRef, options: { membershipId?: string } = {}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const by = await actorIn(tx, actor);
    const target = options.membershipId && options.membershipId !== by.id ? await activeMember(tx, actor.companyId, options.membershipId) : by;
    if (target.id !== by.id && !(await runsRecord(tx, by, record))) throw new TeamsRefusal("NOT_ALLOWED", "Only the record's owner or an admin can add a follower.");
    await followWith(tx, by, target, record);
  });
}

async function followWith(tx: Tx, by: Seat, target: { id: string }, record: RecordRef) {
  const exists = await tx.recordTeamMember.findUnique({
    where: { companyId_subjectType_subjectId_membershipId: { companyId: by.companyId, subjectType: record.type, subjectId: record.id, membershipId: target.id } },
  });
  if (exists) return;
  const row = await tx.recordTeamMember.create({ data: { ...where(by.companyId, record), membershipId: target.id, followsOnly: true } });
  await recordTeamsChange(tx, {
    companyId: by.companyId,
    actorId: by.userId,
    change: "record_team.followed",
    entityType: "record_team",
    entityId: row.id,
    after: { ...shownRecord(record), membership: target.id, ...shownRow(row) },
  });
}

/**
 * Commenting is a statement of interest: the author starts following the
 * record unless they are on its team already. Quiet when it changes nothing.
 */
export async function followByCommenting(db: Db, companyId: string, userId: string, record: RecordRef): Promise<void> {
  const run = async (tx: Tx) => {
    const by = await tx.workspaceMembership.findFirst({ where: { companyId, userId, status: "ACTIVE" }, include: { user: { select: { name: true } } } });
    if (by) await followWith(tx, by, by, record);
  };
  if ("$transaction" in db) await db.$transaction(run);
  else await run(db);
}

async function handOverInside(
  tx: Tx,
  by: Seat,
  record: RecordRef,
  to: Awaited<ReturnType<typeof activeMember>>,
  options: RecordLabel & { note?: string; letIn?: boolean },
): Promise<void> {
  const current = await ownerRow(tx, by.companyId, record);
  if (current?.membershipId === to.id) throw new TeamsRefusal("ALREADY_ON_TEAM", `${to.user.name} already owns this record.`);
  if (!(await canSeeRecord(tx, by.companyId, record, to.userId))) {
    if (!options.letIn) throw new TeamsRefusal("NOT_ALLOWED", `${to.user.name} cannot open this record. Let them see it, then hand it over.`);
    await decideAccess(tx, by, record, to.id, "ACTIVE");
  }
  if (current) await tx.recordTeamMember.update({ where: { id: current.id }, data: { isOwner: false, followsOnly: false } });
  const { row } = await put(tx, by, to, record, { followsOnly: false, owner: true });
  await recordTeamsChange(tx, {
    companyId: by.companyId,
    actorId: by.userId,
    change: "record_team.handed_over",
    entityType: "record_team",
    entityId: row.id,
    before: { ...shownRecord(record), owner: current?.membershipId ?? null },
    after: { ...shownRecord(record), owner: to.id },
    reason: options.note,
  });
  await notifyRecordHandedOver(tx, {
    companyId: by.companyId,
    toUserId: to.userId,
    fromUserId: by.userId,
    fromName: by.user.name,
    recordLabel: options.label,
    viewPath: options.viewPath,
    ref: row.id,
    note: options.note,
  });
}

/**
 * Give the record to someone else. The new owner gets a Needs you notice with
 * the note; the old owner stays on the team. They must be able to open the
 * record: pass `letIn` to give them a grant in the same step.
 */
export async function handOver(
  actor: Actor,
  record: RecordRef,
  toMembershipId: string,
  options: RecordLabel & { note?: string; letIn?: boolean },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const by = await actorIn(tx, actor);
    if (!(await runsRecord(tx, by, record))) throw new TeamsRefusal("NOT_ALLOWED", "Only the record's owner or an admin can hand it over.");
    await handOverInside(tx, by, record, await activeMember(tx, actor.companyId, toMembershipId), options);
  });
}

/**
 * Hand every record a person owns to someone else, in the caller's transaction.
 * Removing a member does this first. Returns how many records moved.
 */
export async function handOverAll(tx: Tx, actor: Actor, fromMembershipId: string, toMembershipId: string, note?: string): Promise<number> {
  const by = await actorIn(tx, actor);
  const to = await activeMember(tx, actor.companyId, toMembershipId);
  const owned = await tx.recordTeamMember.findMany({ where: { companyId: actor.companyId, membershipId: fromMembershipId, isOwner: true } });
  for (const row of owned) {
    const record = { type: row.subjectType, id: row.subjectId };
    await handOverInside(tx, by, record, to, { label: "a record", viewPath: "/", note, letIn: true });
  }
  return owned.length;
}

/** How many records a person owns: what removing them would have to hand over. */
export function ownedRecordCount(db: Db, companyId: string, membershipId: string): Promise<number> {
  return db.recordTeamMember.count({ where: { companyId, membershipId, isOwner: true } });
}

// Access to a record you are not on.

async function decideAccess(
  tx: Tx,
  by: Seat,
  record: RecordRef,
  membershipId: string,
  status: "ACTIVE" | "DENIED",
): Promise<RecordAccessGrant> {
  const before = await tx.recordAccessGrant.findUnique({
    where: { companyId_subjectType_subjectId_membershipId: { companyId: by.companyId, subjectType: record.type, subjectId: record.id, membershipId } },
  });
  const now = new Date();
  const grant = before
    ? await tx.recordAccessGrant.update({ where: { id: before.id }, data: { status, grantedById: by.userId, decidedAt: now } })
    : await tx.recordAccessGrant.create({ data: { ...where(by.companyId, record), membershipId, status, grantedById: by.userId, decidedAt: now } });
  await recordTeamsChange(tx, {
    companyId: by.companyId,
    actorId: by.userId,
    change: status === "ACTIVE" ? "record_access.granted" : "record_access.denied",
    entityType: "record_access",
    entityId: grant.id,
    before: before ? { ...shownRecord(record), status: before.status } : null,
    after: { ...shownRecord(record), membership: membershipId, status },
  });
  await settleTeamsNotifications(tx, { companyId: by.companyId, type: "TEAMS_ACCESS_REQUEST", ref: grant.id, action: status === "ACTIVE" ? "granted" : "denied" });
  return grant;
}

/**
 * Ask to open a record you are not on. The record's owner (or, if it has none,
 * the workspace owner) gets a Needs you notice. Asking again after a refusal
 * asks again.
 */
export async function requestAccess(actor: Actor, record: RecordRef, options: RecordLabel): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const by = await actorIn(tx, actor);
    if (await canSeeRecord(tx, actor.companyId, record, actor.userId)) throw new TeamsRefusal("ALREADY_ON_TEAM", "You can already open this record.");
    const before = await tx.recordAccessGrant.findUnique({
      where: { companyId_subjectType_subjectId_membershipId: { companyId: actor.companyId, subjectType: record.type, subjectId: record.id, membershipId: by.id } },
    });
    if (before?.status === "REQUESTED") return;
    const grant = before
      ? await tx.recordAccessGrant.update({ where: { id: before.id }, data: { status: "REQUESTED", grantedById: null, decidedAt: null } })
      : await tx.recordAccessGrant.create({ data: { ...where(actor.companyId, record), membershipId: by.id } });
    await recordTeamsChange(tx, {
      companyId: actor.companyId,
      actorId: actor.userId,
      change: "record_access.requested",
      entityType: "record_access",
      entityId: grant.id,
      before: before ? { ...shownRecord(record), status: before.status } : null,
      after: { ...shownRecord(record), membership: by.id, status: "REQUESTED" },
    });
    const owner = await ownerRow(tx, actor.companyId, record);
    const workspaceOwner = owner ? null : await tx.workspaceMembership.findFirst({ where: { companyId: actor.companyId, isOwner: true, status: "ACTIVE" } });
    const asked = owner?.membership.userId ?? workspaceOwner?.userId;
    if (asked) {
      await notifyAccessRequest(tx, {
        companyId: actor.companyId,
        ownerUserIds: [asked],
        requestedById: actor.userId,
        requestedBy: by.user.name,
        recordLabel: options.label,
        viewPath: options.viewPath,
        ref: grant.id,
      });
    }
  });
}

/** Let someone open the record, whether or not they asked. Its owner or a workspace admin decides. */
export async function grantAccess(actor: Actor, record: RecordRef, membershipId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const by = await actorIn(tx, actor);
    if (!(await runsRecord(tx, by, record))) throw new TeamsRefusal("NOT_ALLOWED", "Only the record's owner or an admin can let someone in.");
    await activeMember(tx, actor.companyId, membershipId);
    await decideAccess(tx, by, record, membershipId, "ACTIVE");
  });
}

/** Turn a request down. They can ask again. */
export async function denyAccess(actor: Actor, record: RecordRef, membershipId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const by = await actorIn(tx, actor);
    if (!(await runsRecord(tx, by, record))) throw new TeamsRefusal("NOT_ALLOWED", "Only the record's owner or an admin can decide that.");
    const asked = await tx.recordAccessGrant.findUnique({
      where: { companyId_subjectType_subjectId_membershipId: { companyId: actor.companyId, subjectType: record.type, subjectId: record.id, membershipId } },
    });
    if (!asked) throw new TeamsRefusal("NOT_FOUND", "Nobody asked for access.");
    await decideAccess(tx, by, record, membershipId, "DENIED");
  });
}
