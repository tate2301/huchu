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
  const before = await prisma.userPermissionOverride.findUnique({ where: { userId_permissionKey: { userId, permissionKey: VOID_GRANT } }, select: { isAllowed: true } });
  const row = await prisma.userPermissionOverride.upsert({
    where: { userId_permissionKey: { userId, permissionKey: VOID_GRANT } },
    create: { companyId: actor.companyId, userId, permissionKey: VOID_GRANT, isAllowed: allowed, grantedById: actor.userId },
    update: { isAllowed: allowed, grantedById: actor.userId, companyId: actor.companyId },
    select: { userId: true, isAllowed: true },
  });
  await writePlatformAuditEvent({
    companyId: actor.companyId,
    actorId: actor.userId,
    eventType: allowed ? "books.void-grant.given" : "books.void-grant.taken",
    entityType: "User",
    entityId: userId,
    payload: { by: auditActor(actor), permissionKey: VOID_GRANT, from: before?.isAllowed ?? false, to: allowed },
  });
  return row;
}

/** Who in the workspace holds the grant now. */
export async function voidGrantHolders(companyId: string): Promise<string[]> {
  const rows = await prisma.userPermissionOverride.findMany({ where: { companyId, permissionKey: VOID_GRANT, isAllowed: true }, select: { userId: true } });
  return rows.map((row) => row.userId);
}
