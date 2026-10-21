import { createHash, randomBytes } from "node:crypto";

import type { InviteChannel, UserRole, WorkspaceInvite } from "@prisma/client";

import { repriceCompany } from "@/lib/platform/entitlements";
import { getProduct } from "@/lib/platform/products";
import { prisma } from "@/lib/prisma";

import { recordTeamsChange } from "./audit";
import type { Db } from "./db";
import { TeamsRefusal } from "./errors";
import { createMember } from "./members";
import { lockSeats, requireSeat } from "./seats";

/**
 * Invites: four ways in, one list. An invite is a row until the person accepts;
 * accepting makes the user and the membership, so the seat the invite held
 * becomes the seat the member holds and the count does not move.
 *
 * This file does not send anything. `createInvite` and `resendInvite` hand the
 * raw token back once, for the caller to put in a link and deliver (email or
 * WhatsApp); only its SHA-256 is stored. A send that fails calls
 * `markNotDelivered`.
 */

export const INVITE_DAYS = 7;
const DAY = 86_400_000;

/** Only the token's SHA-256 is kept. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const newToken = () => randomBytes(32).toString("base64url");

type Actor = { companyId: string; userId: string };

/** Owner or admin, still active. */
async function inviterIn(tx: Db, actor: Actor) {
  const held = await tx.workspaceMembership.findFirst({ where: { companyId: actor.companyId, userId: actor.userId, status: "ACTIVE" } });
  if (!held) throw new TeamsRefusal("NOT_A_MEMBER", "You are not a member of this workspace.");
  if (!held.isOwner && !held.isAdmin) throw new TeamsRefusal("NOT_ALLOWED", "Only an owner or admin can invite people.");
  return held;
}

/** Only the owner makes an admin, and that includes inviting one. */
function refuseAdminUnlessOwner(by: { isOwner: boolean }, role: UserRole) {
  if (role === "SUPERADMIN" && !by.isOwner) throw new TeamsRefusal("OWNER_ONLY", "Only the owner can invite an admin.");
}

/** A path inside the app: the record or page the person was invited for. */
function cleanLandsOn(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) throw new TeamsRefusal("INVALID", "That is not a page in the app.");
  return value;
}

function cleanEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TeamsRefusal("INVALID", "That email address does not look right.");
  return email;
}

function cleanPhone(value: string | null | undefined): string | null {
  const phone = value?.replace(/[\s-]/g, "") || null;
  if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) throw new TeamsRefusal("INVALID", "Phone numbers start with + and the country code.");
  return phone;
}

const shown = (invite: Pick<WorkspaceInvite, "status" | "role" | "channel" | "email" | "phone" | "expiresAt" | "landsOn">) => ({
  status: invite.status,
  role: invite.role,
  channel: invite.channel,
  email: invite.email,
  phone: invite.phone,
  expiresAt: invite.expiresAt.toISOString(),
  landsOn: invite.landsOn,
});

/**
 * Mark invites whose seven days are up as EXPIRED, which is what frees their
 * seat for good. Counting already ignores them, so this only tidies the list
 * and leaves the audit line. Run on a schedule; the other functions here call
 * it for their own workspace first.
 */
export async function expireInvites(now = new Date(), companyId?: string, db?: Db): Promise<number> {
  const client = db ?? prisma;
  const due = await client.workspaceInvite.findMany({
    where: { status: { in: ["SENT", "NOT_DELIVERED"] }, expiresAt: { lte: now }, ...(companyId ? { companyId } : {}) },
  });
  for (const invite of due) {
    const done = await client.workspaceInvite.updateMany({ where: { id: invite.id, status: invite.status }, data: { status: "EXPIRED" } });
    if (done.count === 0) continue;
    await recordTeamsChange(client, {
      companyId: invite.companyId,
      actorId: null,
      change: "invite.expired",
      entityType: "invite",
      entityId: invite.id,
      before: shown(invite),
      after: shown({ ...invite, status: "EXPIRED" }),
    });
  }
  return due.length;
}

export type NewInvite = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role: UserRole;
  /** Defaults to email when there is one, WhatsApp otherwise. */
  channel?: InviteChannel;
  /** The record or page they land on once in. */
  landsOn?: string | null;
};

/** Invite one person. Refused when no seat is free. Returns the raw token once. */
export async function createInvite(actor: Actor, input: NewInvite, now = new Date()): Promise<{ invite: WorkspaceInvite; token: string }> {
  const email = cleanEmail(input.email);
  const phone = cleanPhone(input.phone);
  if (!email && !phone) throw new TeamsRefusal("INVALID", "Add an email address or a WhatsApp number.");
  const channel: InviteChannel = input.channel ?? (email ? "EMAIL" : "WHATSAPP");
  if (channel === "EMAIL" && !email) throw new TeamsRefusal("INVALID", "Add an email address to invite by email.");
  if (channel === "WHATSAPP" && !phone) throw new TeamsRefusal("INVALID", "Add a WhatsApp number to invite by WhatsApp.");
  const landsOn = cleanLandsOn(input.landsOn);

  const result = await prisma.$transaction(async (tx) => {
    const by = await inviterIn(tx, actor);
    refuseAdminUnlessOwner(by, input.role);
    await lockSeats(tx, actor.companyId);
    await expireInvites(now, actor.companyId, tx);
    if (email) {
      const user = await tx.user.findUnique({ where: { email }, select: { companyId: true } });
      if (user) {
        throw new TeamsRefusal(
          user.companyId === actor.companyId ? "ALREADY_MEMBER" : "INVALID",
          user.companyId === actor.companyId ? "That person is already in this workspace." : "That email address belongs to another workspace.",
        );
      }
    }
    const waiting = await tx.workspaceInvite.findFirst({
      where: {
        companyId: actor.companyId,
        status: { in: ["SENT", "NOT_DELIVERED"] },
        OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
      },
    });
    if (waiting) throw new TeamsRefusal("ALREADY_INVITED", "That person has already been invited.");
    await requireSeat(tx, actor.companyId, input.role, now);

    const token = newToken();
    const invite = await tx.workspaceInvite.create({
      data: {
        companyId: actor.companyId,
        name: input.name?.trim() || null,
        email,
        phone,
        role: input.role,
        channel,
        tokenHash: hashToken(token),
        invitedById: actor.userId,
        landsOn,
        sentAt: now,
        expiresAt: new Date(now.getTime() + INVITE_DAYS * DAY),
      },
    });
    await recordTeamsChange(tx, {
      companyId: actor.companyId,
      actorId: actor.userId,
      change: "invite.created",
      entityType: "invite",
      entityId: invite.id,
      after: shown(invite),
    });
    return { invite, token };
  });
  await repriceCompany(actor.companyId);
  return result;
}

async function inviteIn(tx: Db, companyId: string, inviteId: string): Promise<WorkspaceInvite> {
  const invite = await tx.workspaceInvite.findFirst({ where: { id: inviteId, companyId } });
  if (!invite) throw new TeamsRefusal("NOT_FOUND", "That invite does not exist.");
  return invite;
}

/**
 * Send it again with a new token and a fresh seven days. The old link stops
 * working. An invite that ran out needs a free seat again.
 */
export async function resendInvite(
  actor: Actor,
  inviteId: string,
  change: { email?: string | null; phone?: string | null; channel?: InviteChannel } = {},
  now = new Date(),
): Promise<{ invite: WorkspaceInvite; token: string }> {
  return prisma.$transaction(async (tx) => {
    await inviterIn(tx, actor);
    await lockSeats(tx, actor.companyId);
    const before = await inviteIn(tx, actor.companyId, inviteId);
    if (before.status === "ACCEPTED" || before.status === "REVOKED") throw new TeamsRefusal("NOT_OPEN", "That invite can no longer be sent.");
    const email = change.email === undefined ? before.email : cleanEmail(change.email);
    const phone = change.phone === undefined ? before.phone : cleanPhone(change.phone);
    const channel = change.channel ?? (change.email && !change.phone ? "EMAIL" : change.phone && !change.email ? "WHATSAPP" : before.channel);
    if ((channel === "EMAIL" && !email) || (channel === "WHATSAPP" && !phone)) throw new TeamsRefusal("INVALID", "There is nothing to send it to.");
    const holdsSeat = before.expiresAt > now && (before.status === "SENT" || before.status === "NOT_DELIVERED");
    if (!holdsSeat) await requireSeat(tx, actor.companyId, before.role, now);

    const token = newToken();
    const invite = await tx.workspaceInvite.update({
      where: { id: before.id },
      data: { status: "SENT", email, phone, channel, tokenHash: hashToken(token), sentAt: now, expiresAt: new Date(now.getTime() + INVITE_DAYS * DAY) },
    });
    await recordTeamsChange(tx, {
      companyId: actor.companyId,
      actorId: actor.userId,
      change: "invite.resent",
      entityType: "invite",
      entityId: invite.id,
      before: shown(before),
      after: shown(invite),
    });
    return { invite, token };
  });
}

/** Take it back. Frees the seat; the link stops working. */
export async function revokeInvite(actor: Actor, inviteId: string, now = new Date()): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await inviterIn(tx, actor);
    const before = await inviteIn(tx, actor.companyId, inviteId);
    if (before.status === "REVOKED") return;
    if (before.status === "ACCEPTED") throw new TeamsRefusal("NOT_OPEN", "They have already joined. Remove them from Members.");
    const invite = await tx.workspaceInvite.update({ where: { id: before.id }, data: { status: "REVOKED", revokedAt: now, revokedById: actor.userId } });
    await recordTeamsChange(tx, {
      companyId: actor.companyId,
      actorId: actor.userId,
      change: "invite.revoked",
      entityType: "invite",
      entityId: invite.id,
      before: shown(before),
      after: shown(invite),
    });
  });
  await repriceCompany(actor.companyId);
}

/** The send did not go. The seat stays held; the row offers another way out. */
export async function markNotDelivered(companyId: string, inviteId: string, reason?: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const before = await inviteIn(tx, companyId, inviteId);
    if (before.status !== "SENT") return;
    const invite = await tx.workspaceInvite.update({ where: { id: before.id }, data: { status: "NOT_DELIVERED" } });
    await recordTeamsChange(tx, {
      companyId,
      actorId: null,
      change: "invite.delivery_failed",
      entityType: "invite",
      entityId: invite.id,
      before: shown(before),
      after: shown(invite),
      reason,
    });
  });
}

export type Joined = {
  userId: string;
  membershipId: string;
  companyId: string;
  /** Where to send them: the record or page the invite was for, else the product's home. */
  landsOn: string;
};

async function homeOf(db: Db, companyId: string): Promise<string> {
  const company = await db.company.findUnique({ where: { id: companyId }, select: { product: true } });
  return company ? getProduct(company.product).homePath : "/";
}

async function joinWorkspace(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  input: { companyId: string; role: UserRole; name: string; email: string | null; phone: string | null },
): Promise<{ userId: string; membershipId: string }> {
  if (input.email) {
    const taken = await tx.user.findUnique({ where: { email: input.email }, select: { companyId: true } });
    if (taken) {
      throw new TeamsRefusal(
        taken.companyId === input.companyId ? "ALREADY_MEMBER" : "INVALID",
        taken.companyId === input.companyId ? "You are already in this workspace." : "That email address belongs to another workspace.",
      );
    }
  }
  const user = await createMember(tx, {
    data: { companyId: input.companyId, name: input.name, email: input.email, phone: input.phone, role: input.role, emailVerified: input.email ? new Date() : null },
    select: { id: true, memberships: { select: { id: true } } },
  });
  return { userId: user.id, membershipId: user.memberships[0].id };
}

/**
 * Open an invite. The person becomes an active member in the role they were
 * invited for and lands where the invite said. Each way it can fail has its
 * own code: NOT_FOUND (no such link), EXPIRED, NOT_OPEN (revoked or used).
 */
export async function acceptInvite(input: { token: string; name?: string }, now = new Date()): Promise<Joined> {
  const hash = hashToken(input.token);
  const joined = await prisma.$transaction(async (tx) => {
    const invite = await tx.workspaceInvite.findUnique({ where: { tokenHash: hash } });
    if (!invite) throw new TeamsRefusal("NOT_FOUND", "This invite link does not work. Ask for a new one.");
    if (invite.status === "ACCEPTED" || invite.status === "REVOKED") throw new TeamsRefusal("NOT_OPEN", invite.status === "ACCEPTED" ? "This invite has already been used." : "This invite was taken back.");
    if (invite.status === "EXPIRED" || invite.expiresAt <= now) {
      throw new TeamsRefusal("EXPIRED", "This invite has run out. Ask for a new one.");
    }
    // The invite already holds the seat, so joining does not need another.
    await lockSeats(tx, invite.companyId);
    const name = (input.name ?? invite.name ?? "").trim();
    if (!name) throw new TeamsRefusal("INVALID", "Add your name.");
    const made = await joinWorkspace(tx, { companyId: invite.companyId, role: invite.role, name, email: invite.email, phone: invite.phone });
    const after = await tx.workspaceInvite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedAt: now, acceptedMembershipId: made.membershipId },
    });
    await recordTeamsChange(tx, {
      companyId: invite.companyId,
      actorId: made.userId,
      change: "invite.accepted",
      entityType: "invite",
      entityId: invite.id,
      before: shown(invite),
      after: shown(after),
    });
    await recordTeamsChange(tx, {
      companyId: invite.companyId,
      actorId: invite.invitedById,
      change: "member.added",
      entityType: "membership",
      entityId: made.membershipId,
      after: { status: "ACTIVE", role: invite.role, isAdmin: invite.role === "SUPERADMIN" },
      reason: "invite",
    });
    return { ...made, companyId: invite.companyId, landsOn: invite.landsOn ?? (await homeOf(tx, invite.companyId)) };
  });
  await repriceCompany(joined.companyId);
  return joined;
}

/** The invite behind a link, for the page that asks for a name: null when it does not work. */
export async function lookUpInvite(token: string, now = new Date()) {
  const invite = await prisma.workspaceInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { company: { select: { name: true, product: true } } },
  });
  if (!invite) return null;
  const state = invite.status === "ACCEPTED" || invite.status === "REVOKED" ? invite.status : invite.status === "EXPIRED" || invite.expiresAt <= now ? "EXPIRED" : "OPEN";
  return { state, workspace: invite.company.name, product: invite.company.product, role: invite.role, name: invite.name, email: invite.email, phone: invite.phone };
}

// The shared link: one per workspace and role.

/**
 * Turn the link for a role on and get its token (shown once). Turning it on
 * again rotates the token, so an old copy of the link never works again.
 */
export async function turnOnInviteLink(actor: Actor, role: UserRole, now = new Date()): Promise<{ token: string }> {
  return prisma.$transaction(async (tx) => {
    const by = await inviterIn(tx, actor);
    refuseAdminUnlessOwner(by, role);
    const before = await tx.inviteLink.findUnique({ where: { companyId_role: { companyId: actor.companyId, role } } });
    const token = newToken();
    const link = before
      ? await tx.inviteLink.update({ where: { id: before.id }, data: { tokenHash: hashToken(token), isActive: true, rotatedAt: now } })
      : await tx.inviteLink.create({ data: { companyId: actor.companyId, role, tokenHash: hashToken(token), createdById: actor.userId } });
    await recordTeamsChange(tx, {
      companyId: actor.companyId,
      actorId: actor.userId,
      change: before ? (before.isActive ? "invite_link.rotated" : "invite_link.turned_on") : "invite_link.turned_on",
      entityType: "invite_link",
      entityId: link.id,
      before: before ? { role, isActive: before.isActive } : null,
      after: { role, isActive: true },
    });
    return { token };
  });
}

/** Turn it off: the link stops working and stays dead. */
export async function turnOffInviteLink(actor: Actor, role: UserRole): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await inviterIn(tx, actor);
    const before = await tx.inviteLink.findUnique({ where: { companyId_role: { companyId: actor.companyId, role } } });
    if (!before || !before.isActive) return;
    // A new random hash, so the old token cannot match even by accident.
    await tx.inviteLink.update({ where: { id: before.id }, data: { isActive: false, tokenHash: hashToken(newToken()) } });
    await recordTeamsChange(tx, {
      companyId: actor.companyId,
      actorId: actor.userId,
      change: "invite_link.turned_off",
      entityType: "invite_link",
      entityId: before.id,
      before: { role, isActive: true },
      after: { role, isActive: false },
    });
  });
}

/** Join through the shared link. It needs a free seat, because nothing held one. */
export async function acceptInviteLink(
  input: { token: string; name: string; email?: string | null; phone?: string | null; landsOn?: string | null },
  now = new Date(),
): Promise<Joined> {
  const email = cleanEmail(input.email);
  const phone = cleanPhone(input.phone);
  const name = input.name.trim();
  if (!name) throw new TeamsRefusal("INVALID", "Add your name.");
  if (!email && !phone) throw new TeamsRefusal("INVALID", "Add an email address or a WhatsApp number.");
  const joined = await prisma.$transaction(async (tx) => {
    const link = await tx.inviteLink.findUnique({ where: { tokenHash: hashToken(input.token) } });
    if (!link || !link.isActive) throw new TeamsRefusal("NOT_FOUND", "This invite link does not work. Ask for a new one.");
    await lockSeats(tx, link.companyId);
    await expireInvites(now, link.companyId, tx);
    await requireSeat(tx, link.companyId, link.role, now);
    const made = await joinWorkspace(tx, { companyId: link.companyId, role: link.role, name, email, phone });
    await recordTeamsChange(tx, {
      companyId: link.companyId,
      actorId: link.createdById,
      change: "member.added",
      entityType: "membership",
      entityId: made.membershipId,
      after: { status: "ACTIVE", role: link.role, isAdmin: link.role === "SUPERADMIN" },
      reason: "invite_link",
    });
    return { ...made, companyId: link.companyId, landsOn: cleanLandsOn(input.landsOn) ?? (await homeOf(tx, link.companyId)) };
  });
  await repriceCompany(joined.companyId);
  return joined;
}
