import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { isWhatsAppConfigured } from "@/lib/messaging/whatsapp";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";

import { offerAudience, REMINDER_PURPOSE, REMINDER_TEMPLATE, reminderAudience } from "./audience";
import { MessageRefusal, NOBODY_TO_MESSAGE, reminderSourceFor } from "./preview";
import { firstName, OFFER_PLACEHOLDERS, offerValues, placeholderProblem, renderMessage } from "./render";

/**
 * Sending a message to customers (CUS-06, W-50): one batch, and one queued
 * WhatsApp per customer it reaches, each filled for that person. Nothing is
 * sent here: the outbox's drain (`drain.ts`) sends what is due, a scheduled
 * one at its time, re-filled then so `{points}` and `{owed}` are current.
 * With WhatsApp not connected the messages wait in the outbox and the answer
 * says so (98-decisions C-04); nothing fails for it.
 */

export const messageInput = z.object({
  purpose: z.enum(["OFFER", "ACCOUNT_REMINDER", "LAYBY_REMINDER"]),
  audience: z.enum(["ticked", "top-tier", "lapsed-30", "all-agreed"]).default("ticked"),
  ids: z.array(z.string().uuid()).max(500).optional(),
  about: z.string().optional(),
  body: z.string().trim().min(1).max(1000),
  sendAt: z.string().datetime().nullable(),
});

export type MessageInput = z.input<typeof messageInput>;

export const OFFER_TEMPLATE = "customer-offer";
export const PICK_A_TIME_TO_COME = "Pick a time to come.";

export type Queued = { batchId: string; queued: number; sendAt: string | null; waiting: boolean };

type Row = { customerId: string; to: string; body: string; entityType: string | null; entityId: string | null };

export async function queueCustomerMessages(
  actor: RetailAuditActor,
  raw: MessageInput,
  options: { now?: Date; whatsAppReady?: () => boolean } = {},
): Promise<Queued> {
  const input = messageInput.parse(raw);
  const now = options.now ?? new Date();
  const sendAt = input.sendAt ? new Date(input.sendAt) : null;
  if (sendAt && sendAt.getTime() <= now.getTime()) {
    throw new MessageRefusal(PICK_A_TIME_TO_COME, 400, { when: PICK_A_TIME_TO_COME });
  }

  let rows: Row[];
  let template: string;
  let audience: string = input.audience;
  const after: Array<(tx: Prisma.TransactionClient) => Promise<void>> = [];

  if (input.purpose === "OFFER") {
    const problem = placeholderProblem(input.body, OFFER_PLACEHOLDERS);
    if (problem) throw new MessageRefusal(problem, 400, { msg: problem });
    const { reached } = await offerAudience(actor.companyId, input.audience, { ids: input.ids, now });
    template = OFFER_TEMPLATE;
    rows = reached.map((customer) => ({
      customerId: customer.id,
      to: customer.to,
      body: renderMessage(input.body, offerValues(customer)),
      entityType: null,
      entityId: null,
    }));
  } else {
    const { kind, ids, source } = reminderSourceFor(input.about);
    if (REMINDER_PURPOSE[kind] !== input.purpose) throw new MessageRefusal("Those are not what this reminder is about.", 400);
    const problem = placeholderProblem(input.body, source.placeholders, source.hint);
    if (problem) throw new MessageRefusal(problem, 400, { msg: problem });
    const { reached } = await reminderAudience(actor.companyId, source, ids);
    template = REMINDER_TEMPLATE[kind];
    audience = "ticked";
    rows = reached.map((item) => ({
      customerId: item.customer.id,
      to: item.to,
      body: renderMessage(input.body, { "first name": firstName(item.customer.name), ...item.values }),
      entityType: source.entityType,
      entityId: item.about,
    }));
    for (const item of reached) if (item.after) after.push(item.after);
  }

  if (rows.length === 0) throw new MessageRefusal(NOBODY_TO_MESSAGE, 409);

  const batchId = await prisma.$transaction(async (tx) => {
    const batch = await tx.retailMessageBatch.create({
      data: {
        companyId: actor.companyId,
        purpose: input.purpose,
        audience,
        template: input.body,
        scheduledFor: sendAt,
        total: rows.length,
        createdById: actor.userId,
      },
      select: { id: true },
    });
    await tx.retailMessage.createMany({
      data: rows.map((row) => ({
        companyId: actor.companyId,
        channel: "WHATSAPP" as const,
        to: row.to,
        template,
        body: row.body,
        customerId: row.customerId,
        batchId: batch.id,
        scheduledFor: sendAt,
        entityType: row.entityType,
        entityId: row.entityId,
        createdById: actor.userId,
      })),
    });
    for (const run of after) await run(tx);
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.messagesQueued,
      entityType: "RetailMessageBatch",
      entityId: batch.id,
      payload: { purpose: input.purpose, audience, count: rows.length, scheduledFor: sendAt?.toISOString() ?? null },
    });
    return batch.id;
  });

  const ready = options.whatsAppReady ?? (() => isWhatsAppConfigured());
  return { batchId, queued: rows.length, sendAt: sendAt?.toISOString() ?? null, waiting: !ready() };
}
