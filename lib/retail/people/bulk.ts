import { NotificationEntityType, NotificationType } from "@prisma/client";

import { emitRetailNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent } from "@/lib/retail/audit";

import { viewerOf, type PeopleActor } from "./actor";
import type { Skipped } from "./access";
import { ROLE_REFUSAL_CHANGE } from "./change";
import { sendPin } from "./deliver";
import { issueTillPin } from "./pins";
import { fieldRefusal } from "./refusal";
import { loadPeople } from "./view";

/**
 * From People's selection (80-admin 5.5): new PINs for several people, and a
 * message to several.
 */

export const NO_ACCESS = "No access.";
export const NO_PHONE = "No phone.";
export const NO_PIN = "No PIN to reset.";

/** "Reset PINs": each person through the same PIN issue; who cannot have one is skipped with why. */
export async function resetPins(
  actor: PeopleActor,
  ids: string[],
  now = new Date(),
): Promise<{ sent: string[]; skipped: Skipped[]; handOver: Array<{ name: string; pin: string }> }> {
  const people = await loadPeople(actor.companyId, viewerOf(actor), { ids, now });
  const sent: string[] = [];
  const skipped: Skipped[] = [];
  const handOver: Array<{ name: string; pin: string }> = [];
  for (const person of people) {
    const why =
      person.state === "NO_ACCESS"
        ? NO_ACCESS
        : !person.can.sendPin
          ? ROLE_REFUSAL_CHANGE
          : person.pin.state === "NONE"
            ? NO_PIN
            : !person.phone
              ? NO_PHONE
              : null;
    if (why) {
      skipped.push({ id: person.id, name: person.name, why });
      continue;
    }
    const pin = await prisma.$transaction(async (tx) => {
      const issued = await issueTillPin(tx, { companyId: actor.companyId, userId: person.id, issuedById: actor.userId, now });
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.personPinSent,
        entityType: "User",
        entityId: person.id,
        payload: { wasLocked: person.pin.state === "LOCKED" },
      });
      return issued;
    });
    const delivery = await sendPin({ companyId: actor.companyId, phone: person.phone, pin, createdById: actor.userId });
    if (delivery.handOver) handOver.push({ name: person.name, pin });
    sent.push(person.id);
  }
  return { sent, skipped, handOver };
}

export const MESSAGE_NEEDED = "Write a message.";

/**
 * "Send a message": in the app to each (a `RETAIL_STAFF_MESSAGE`
 * notification), and on WhatsApp through the outbox to each with a phone.
 * Nothing secret goes in it, so it may wait in the queue.
 */
export async function messagePeople(
  actor: PeopleActor,
  ids: string[],
  raw: string,
): Promise<{ sent: number; whatsapp: number }> {
  const message = raw.trim();
  if (message.length < 1 || message.length > 500) throw fieldRefusal({ message: MESSAGE_NEEDED });
  const people = await prisma.user.findMany({
    where: { companyId: actor.companyId, id: { in: ids }, isActive: true },
    select: { id: true, phone: true },
  });
  if (people.length === 0) return { sent: 0, whatsapp: 0 };
  await emitRetailNotification({
    companyId: actor.companyId,
    recipientIds: people.map((person) => person.id),
    type: NotificationType.RETAIL_STAFF_MESSAGE,
    title: `A message from ${actor.userName ?? "the shop"}`,
    summary: message,
    entityType: NotificationEntityType.RETAIL_PERSON,
    entityId: actor.userId,
    viewPath: "/retail",
  });
  const withPhone = people.filter((person) => person.phone);
  if (withPhone.length > 0) {
    await prisma.retailMessage.createMany({
      data: withPhone.map((person) => ({
        companyId: actor.companyId,
        channel: "WHATSAPP" as const,
        to: person.phone!,
        template: "staff-message",
        body: message,
        createdById: actor.userId,
      })),
    });
  }
  return { sent: people.length, whatsapp: withPhone.length };
}
