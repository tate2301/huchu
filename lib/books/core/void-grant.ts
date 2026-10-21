import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { prisma } from "@/lib/prisma";

import { auditActor, tierOf, VOID_GRANT, type BooksActor } from "./can-do";
import { UndoRefused } from "./undo";

/**
 * "May void and revise posted documents" (books-final §2.3; brief default 2):
 * nobody has it until the owner gives it, to a manager or an accountant only,
 * as a `UserPermissionOverride` with the capability `books.void`. It never
 * covers permanent delete, reopening a month or a filed VAT return; owners
 * and superusers (Sign in as, Make changes) can always void and revise.
 */

const GRANTABLE = new Set(["MANAGER", "FINANCE_OFFICER"]);

export async function setVoidGrant(actor: BooksActor, userId: string, allowed: boolean) {
  if (tierOf(actor) !== "owner") throw new UndoRefused("Only the owner can let someone void and revise posted documents.", 403);
  const person = await prisma.user.findFirst({ where: { id: userId, companyId: actor.companyId }, select: { id: true, name: true, role: true } });
  if (!person) throw new UndoRefused("That person is not in this workspace.", 404);
  if (allowed && !GRANTABLE.has(String(person.role))) throw new UndoRefused(`${person.name ?? "They"} would need to be a manager or the accountant first: only they can be let void and revise.`, 409);
  const membership = await prisma.workspaceMembership.findFirst({ where: { companyId: actor.companyId, userId }, select: { id: true } });
  if (!membership) throw new UndoRefused("That person is not in this workspace.", 404);
  const before = await prisma.userPermissionOverride.findUnique({ where: { membershipId_permissionKey: { membershipId: membership.id, permissionKey: VOID_GRANT } }, select: { isAllowed: true } });
  const row = await prisma.userPermissionOverride.upsert({
    where: { membershipId_permissionKey: { membershipId: membership.id, permissionKey: VOID_GRANT } },
    create: { companyId: actor.companyId, membershipId: membership.id, permissionKey: VOID_GRANT, isAllowed: allowed, grantedById: actor.userId },
    update: { isAllowed: allowed, grantedById: actor.userId },
    select: { isAllowed: true },
  });
  await writePlatformAuditEvent({
    companyId: actor.companyId,
    actorId: actor.userId,
    eventType: allowed ? "books.void-grant.given" : "books.void-grant.taken",
    entityType: "User",
    entityId: userId,
    payload: { by: auditActor(actor), permissionKey: VOID_GRANT, from: before?.isAllowed ?? false, to: allowed },
  });
  return { userId, isAllowed: row.isAllowed };
}

/** Who in the workspace holds the grant now. */
export async function voidGrantHolders(companyId: string): Promise<string[]> {
  const rows = await prisma.userPermissionOverride.findMany({ where: { companyId, permissionKey: VOID_GRANT, isAllowed: true }, select: { membership: { select: { userId: true } } } });
  return rows.map((row) => row.membership.userId);
}

export type VoidGrant = {
  userId: string;
  /** Holds it now. */
  holds: boolean;
  /** Their role may be given it: a manager or the accountant (§2.3). */
  grantable: boolean;
  /** Who gave or took it last, and when. */
  by: { id: string; name: string | null; image: string | null } | null;
  at: string | null;
};

/** One person's grant, for their page in Management → Users (BooksWho, "Granting void and revise"). */
export async function voidGrantOf(companyId: string, userId: string): Promise<VoidGrant | null> {
  const person = await prisma.user.findFirst({ where: { id: userId, companyId }, select: { id: true, role: true } });
  if (!person) return null;
  const row = await prisma.userPermissionOverride.findFirst({
    where: { permissionKey: VOID_GRANT, membership: { userId, companyId } },
    select: { isAllowed: true, updatedAt: true, grantedBy: { select: { id: true, name: true, image: true } } },
  });
  return {
    userId,
    holds: Boolean(row?.isAllowed),
    grantable: GRANTABLE.has(String(person.role)),
    by: row?.grantedBy ? { id: row.grantedBy.id, name: row.grantedBy.name, image: row.grantedBy.image } : null,
    at: row ? row.updatedAt.toISOString() : null,
  };
}
