import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";

import { CustomerRefusal } from "./create";
import { RESTORE_FIRST } from "./update";

/**
 * A note on a customer (CUS-03): one to a thousand characters, read by
 * everyone who can open the customer, never edited. Written with
 * `RETAIL_CUSTOMER.NOTE_ADDED { noteId }`.
 */

export const noteInput = z.object({ body: z.string() });
export const WRITE_THE_NOTE = "Write the note.";
export const NOTE_TOO_LONG = "Keep the note under 1,000 characters.";

export async function addCustomerNote(
  tx: Prisma.TransactionClient,
  actor: RetailAuditActor,
  customerId: string,
  raw: unknown,
): Promise<{ id: string; body: string; createdAt: Date }> {
  const parsed = noteInput.safeParse(raw ?? {});
  const body = parsed.success ? parsed.data.body.trim() : "";
  if (!body) throw new CustomerRefusal(WRITE_THE_NOTE, 400, { note: WRITE_THE_NOTE });
  if (body.length > 1000) throw new CustomerRefusal(NOTE_TOO_LONG, 400, { note: NOTE_TOO_LONG });

  const customer = await tx.customer.findFirst({
    where: { id: customerId, companyId: actor.companyId },
    select: { archivedAt: true, mergedIntoId: true },
  });
  if (!customer) throw new CustomerRefusal("Customer not found", 404, {});
  if (customer.archivedAt || customer.mergedIntoId) throw new CustomerRefusal(RESTORE_FIRST, 409, {});

  const note = await tx.retailCustomerNote.create({
    data: { companyId: actor.companyId, customerId, body, createdById: actor.userId },
    select: { id: true, body: true, createdAt: true },
  });
  await writeRetailAuditEvent(tx, {
    actor,
    eventType: RETAIL_AUDIT_EVENTS.customerNoteAdded,
    entityType: "Customer",
    entityId: customerId,
    payload: { noteId: note.id },
  });
  return note;
}
