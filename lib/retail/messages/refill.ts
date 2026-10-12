import { prisma } from "@/lib/prisma";
import { balance } from "@/lib/retail/loyalty/ledger";

import { REMINDER_SOURCES, type ReminderKind } from "./audience";
import { firstName, offerValues, renderMessage } from "./render";

/**
 * A customer message written again just before the drain sends it (CUS-06):
 * from its batch's template, with the person's points or what they owe at
 * send time, so a message scheduled for Friday says Friday's balance. Null
 * keeps the body as queued (no batch, a customer since removed, a source not
 * registered).
 */

type Queued = { companyId: string; batchId: string | null; customerId: string | null; entityId: string | null };

async function templateOf(batchId: string | null): Promise<string | null> {
  if (!batchId) return null;
  const batch = await prisma.retailMessageBatch.findUnique({ where: { id: batchId }, select: { template: true } });
  return batch?.template ?? null;
}

export async function refillOffer(message: Queued): Promise<string | null> {
  const template = await templateOf(message.batchId);
  if (!template || !message.customerId) return null;
  const customer = await prisma.customer.findUnique({ where: { id: message.customerId }, select: { name: true } });
  if (!customer) return null;
  return renderMessage(template, offerValues({ name: customer.name, points: await balance(prisma, message.customerId) }));
}

export function refillReminder(kind: ReminderKind) {
  return async (message: Queued): Promise<string | null> => {
    const source = REMINDER_SOURCES[kind];
    const template = await templateOf(message.batchId);
    if (!source || !template || !message.entityId) return null;
    const items = await source.load(message.companyId, [message.entityId]);
    const item = items.find((entry) => entry.customer.id === message.customerId) ?? items[0];
    if (!item) return null;
    return renderMessage(template, { "first name": firstName(item.customer.name), ...item.values });
  };
}
