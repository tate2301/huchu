import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent } from "@/lib/retail/audit";
import { closeFiscalDayIfLastShift } from "@/lib/retail/fiscal-settings";
import type { Sent } from "@/lib/retail/messages/send-now";
import { closeShiftUncounted } from "@/lib/retail/shift-close-uncounted";

import { viewerOf, type PeopleActor } from "./actor";
import { isLastOwner, onlyOwner } from "./change";
import { sendPin } from "./deliver";
import type { HandOver } from "./invite";
import { issueTillPin } from "./pins";
import { PeopleRefusal, PERSON_NOT_FOUND } from "./refusal";
import { pinByDefault } from "./roles";
import { loadPeople, loadPerson, type PersonView } from "./view";

/**
 * Removing a person's access and giving it back (80-admin W-57). Removing
 * ends their open shifts without a count first, takes their till PIN away and
 * withdraws any invite; their sessions end at their next request, and their
 * sales and history stay. Owner-level only (`retail.people:delete`).
 */

export const OWN_ACCESS = "You cannot remove your own access.";
export const noAccessAlready = (name: string) => `${name} has no access already.`;
export const hasAccessAlready = (name: string) => `${name} has access already.`;

export type RemoveResult = { data: PersonView; closedShifts: string[] };

/** Why this person's access cannot go, or null. */
async function removeRefusal(actor: PeopleActor, person: PersonView): Promise<string | null> {
  if (person.id === actor.userId) return OWN_ACCESS;
  if (person.state === "NO_ACCESS") return noAccessAlready(person.name);
  if (person.role === "OWNER" && (await isLastOwner(actor.companyId, person.id))) return onlyOwner(person.name);
  return null;
}

async function remove(actor: PeopleActor, person: PersonView, now: Date): Promise<string[]> {
  const closed = await prisma.$transaction(async (tx) => {
    const shifts = await tx.retailShift.findMany({
      where: { companyId: actor.companyId, cashierId: person.id, status: "OPEN" },
      orderBy: { openedAt: "asc" },
      select: { id: true },
    });
    const closedNos: string[] = [];
    for (const shift of shifts) {
      const done = await closeShiftUncounted(tx, {
        actor,
        shiftId: shift.id,
        reason: `Access removed for ${person.name}`,
        now,
      });
      if (done) closedNos.push(done.shiftNo);
    }
    await tx.user.update({
      where: { id: person.id },
      data: { isActive: false, accessRemovedAt: now, accessRemovedById: actor.userId },
    });
    await tx.retailTillPin.deleteMany({ where: { userId: person.id } });
    await tx.retailStaffInvite.updateMany({
      where: { userId: person.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.personAccessRemoved,
      entityType: "User",
      entityId: person.id,
      payload: { closedShifts: closedNos },
    });
    return closedNos;
  });
  // A shift closed here may have been the shop's last: its fiscal day closes with it (SET-08).
  if (closed.length > 0) await closeFiscalDayIfLastShift(actor, now);
  return closed;
}

export async function removeAccess(actor: PeopleActor, id: string, now = new Date()): Promise<RemoveResult> {
  const person = await loadPerson(actor.companyId, viewerOf(actor), id, { now });
  if (!person) throw new PeopleRefusal(PERSON_NOT_FOUND, 404);
  const refusal = await removeRefusal(actor, person);
  if (refusal) throw new PeopleRefusal(refusal, 409);
  const closedShifts = await remove(actor, person, now);
  const data = await loadPerson(actor.companyId, viewerOf(actor), id, { now });
  return { data: data!, closedShifts };
}

export type Skipped = { id: string; name: string; why: string };

/** Remove access for several: each through the same rules; self and the last owner are skipped with their reason. */
export async function removeAccessMany(
  actor: PeopleActor,
  ids: string[],
  now = new Date(),
): Promise<{ removed: string[]; skipped: Skipped[]; closedShifts: string[] }> {
  const people = await loadPeople(actor.companyId, viewerOf(actor), { ids, now });
  const removed: string[] = [];
  const skipped: Skipped[] = [];
  const closedShifts: string[] = [];
  for (const person of people) {
    const refusal = await removeRefusal(actor, person);
    if (refusal) {
      skipped.push({ id: person.id, name: person.name, why: refusal });
      continue;
    }
    closedShifts.push(...(await remove(actor, person, now)));
    removed.push(person.id);
  }
  return { removed, skipped, closedShifts };
}

export type RestoreResult = { data: PersonView; sent?: Sent; handOver?: HandOver };

/** "Give access back", with a new PIN when asked (on by default for managers, cashiers and stock clerks). */
export async function giveAccessBack(
  actor: PeopleActor,
  id: string,
  input: { sendNewPin?: boolean },
  now = new Date(),
): Promise<RestoreResult> {
  const person = await loadPerson(actor.companyId, viewerOf(actor), id, { now });
  if (!person) throw new PeopleRefusal(PERSON_NOT_FOUND, 404);
  if (person.state !== "NO_ACCESS") throw new PeopleRefusal(hasAccessAlready(person.name), 409);
  const sendNewPin = input.sendNewPin ?? pinByDefault(person.role);

  const pin = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { isActive: true, accessRemovedAt: null, accessRemovedById: null },
    });
    const issued = sendNewPin
      ? await issueTillPin(tx, { companyId: actor.companyId, userId: id, issuedById: actor.userId, now })
      : null;
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.personAccessRestored,
      entityType: "User",
      entityId: id,
      payload: { pin: Boolean(issued) },
    });
    return issued;
  });

  const delivery = pin ? await sendPin({ companyId: actor.companyId, phone: person.phone, pin, createdById: actor.userId }) : {};
  const data = await loadPerson(actor.companyId, viewerOf(actor), id, { now });
  return { data: data!, ...delivery };
}
