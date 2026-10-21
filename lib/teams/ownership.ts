import type { OwnershipOffer } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { recordTeamsChange } from "./audit";
import type { Db } from "./db";
import { TeamsRefusal } from "./errors";

/**
 * Ownership. There is one owner, because billing moves with it. The owner
 * offers it; the other person accepts; the old owner becomes an admin in the
 * same transaction. An offer that is not answered lapses after seven days.
 */

export const OFFER_DAYS = 7;
const DAY = 86_400_000;

type Actor = { companyId: string; userId: string };

const shown = (offer: Pick<OwnershipOffer, "status" | "fromMembershipId" | "toMembershipId" | "expiresAt">) => ({
  status: offer.status,
  from: offer.fromMembershipId,
  to: offer.toMembershipId,
  expiresAt: offer.expiresAt.toISOString(),
});

/** Close offers whose seven days are up. Run on a schedule; the functions here call it for their own workspace. */
export async function lapseOwnershipOffers(now = new Date(), companyId?: string, db?: Db): Promise<number> {
  const client = db ?? prisma;
  const due = await client.ownershipOffer.findMany({ where: { status: "OPEN", expiresAt: { lte: now }, ...(companyId ? { companyId } : {}) } });
  let lapsed = 0;
  for (const offer of due) {
    const done = await client.ownershipOffer.updateMany({ where: { id: offer.id, status: "OPEN" }, data: { status: "LAPSED", decidedAt: now } });
    if (done.count === 0) continue;
    lapsed += 1;
    await recordTeamsChange(client, {
      companyId: offer.companyId,
      actorId: null,
      change: "ownership.lapsed",
      entityType: "ownership_offer",
      entityId: offer.id,
      before: shown(offer),
      after: shown({ ...offer, status: "LAPSED" }),
    });
  }
  return lapsed;
}

/**
 * The owner offers ownership to an active member. A second offer replaces an
 * open one, which lapses.
 */
export async function offerOwnership(actor: Actor, toMembershipId: string, now = new Date()): Promise<OwnershipOffer> {
  return prisma.$transaction(async (tx) => {
    const from = await tx.workspaceMembership.findFirst({ where: { companyId: actor.companyId, userId: actor.userId, status: "ACTIVE" } });
    if (!from) throw new TeamsRefusal("NOT_A_MEMBER", "You are not a member of this workspace.");
    if (!from.isOwner) throw new TeamsRefusal("OWNER_ONLY", "Only the owner can offer ownership.");
    const to = await tx.workspaceMembership.findFirst({ where: { id: toMembershipId, companyId: actor.companyId } });
    if (!to) throw new TeamsRefusal("NOT_FOUND", "That person is not a member of this workspace.");
    if (to.id === from.id) throw new TeamsRefusal("SELF", "You already own this workspace.");
    if (to.status !== "ACTIVE") throw new TeamsRefusal("NOT_OPEN", "Ownership can only go to an active member.");

    await lapseOwnershipOffers(now, actor.companyId, tx);
    const open = await tx.ownershipOffer.findFirst({ where: { companyId: actor.companyId, status: "OPEN" } });
    if (open) {
      await tx.ownershipOffer.update({ where: { id: open.id }, data: { status: "LAPSED", decidedAt: now } });
      await recordTeamsChange(tx, {
        companyId: actor.companyId,
        actorId: actor.userId,
        change: "ownership.lapsed",
        entityType: "ownership_offer",
        entityId: open.id,
        before: shown(open),
        after: shown({ ...open, status: "LAPSED" }),
        reason: "replaced by a new offer",
      });
    }
    const offer = await tx.ownershipOffer.create({
      data: { companyId: actor.companyId, fromMembershipId: from.id, toMembershipId: to.id, expiresAt: new Date(now.getTime() + OFFER_DAYS * DAY) },
    });
    await recordTeamsChange(tx, {
      companyId: actor.companyId,
      actorId: actor.userId,
      change: "ownership.offered",
      entityType: "ownership_offer",
      entityId: offer.id,
      after: shown(offer),
    });
    return offer;
  });
}

async function offerFor(tx: Db, actor: Actor, offerId: string) {
  const offer = await tx.ownershipOffer.findFirst({
    where: { id: offerId, companyId: actor.companyId },
    include: { toMembership: true, fromMembership: true },
  });
  if (!offer) throw new TeamsRefusal("NOT_FOUND", "That offer does not exist.");
  if (offer.toMembership.userId !== actor.userId) throw new TeamsRefusal("NOT_ALLOWED", "This offer is not for you.");
  if (offer.status !== "OPEN") throw new TeamsRefusal("NOT_OPEN", "This offer has already been answered or has lapsed.");
  return offer;
}

/**
 * Accept. In one transaction: the old owner stops being owner and becomes an
 * admin, the new owner becomes owner (and an admin by role), and billing,
 * which follows the owner, moves with it.
 */
export async function acceptOwnership(actor: Actor, offerId: string, now = new Date()): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const offer = await offerFor(tx, actor, offerId);
    if (offer.expiresAt <= now) {
      throw new TeamsRefusal("EXPIRED", "This offer has lapsed. Ask for a new one.");
    }
    const { fromMembership: from, toMembership: to } = offer;
    if (to.status !== "ACTIVE") throw new TeamsRefusal("NOT_OPEN", "You are not an active member.");
    // The offer was made by whoever owned the workspace; if that changed, it is stale.
    const current = await tx.workspaceMembership.findFirst({ where: { companyId: actor.companyId, isOwner: true } });
    if (current && current.id !== from.id) {
      throw new TeamsRefusal("NOT_OPEN", "The owner has changed since this offer was made.");
    }
    // Owner flag first: only one owner may exist at any moment.
    await tx.workspaceMembership.update({ where: { id: from.id }, data: { isOwner: false, isAdmin: true, role: "SUPERADMIN" } });
    await tx.workspaceMembership.update({ where: { id: to.id }, data: { isOwner: true, isAdmin: false, role: "SUPERADMIN" } });
    // The sign-in follows the membership, so both can reach the admin pages.
    await tx.user.updateMany({ where: { id: { in: [from.userId, to.userId] } }, data: { role: "SUPERADMIN" } });
    const after = await tx.ownershipOffer.update({ where: { id: offer.id }, data: { status: "ACCEPTED", decidedAt: now } });
    await recordTeamsChange(tx, {
      companyId: actor.companyId,
      actorId: actor.userId,
      change: "ownership.accepted",
      entityType: "ownership_offer",
      entityId: offer.id,
      before: { ...shown(offer), owner: from.id, newOwnerAdmin: to.isAdmin, oldOwnerAdmin: from.isAdmin },
      after: { ...shown(after), owner: to.id, newOwnerAdmin: false, oldOwnerAdmin: true },
    });
  });
}

/** Say no. The owner stays the owner. */
export async function declineOwnership(actor: Actor, offerId: string, now = new Date()): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const offer = await offerFor(tx, actor, offerId);
    const after = await tx.ownershipOffer.update({ where: { id: offer.id }, data: { status: "DECLINED", decidedAt: now } });
    await recordTeamsChange(tx, {
      companyId: actor.companyId,
      actorId: actor.userId,
      change: "ownership.declined",
      entityType: "ownership_offer",
      entityId: offer.id,
      before: shown(offer),
      after: shown(after),
    });
  });
}
