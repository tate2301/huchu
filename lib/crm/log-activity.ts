import { z } from "zod";

import { prisma } from "@/lib/prisma";

const RECORD_KEYS = ["leadId", "dealId", "clientId", "personId"] as const;

export const createActivitySchema = z
  .object({
    type: z.enum(["NOTE", "CALL", "EMAIL", "WHATSAPP", "MEETING"]),
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().max(4000).optional(),
    occurredAt: z.string().datetime().optional(),
    leadId: z.string().uuid().optional(),
    dealId: z.string().uuid().optional(),
    clientId: z.string().uuid().optional(),
    personId: z.string().uuid().optional(),
  })
  .refine((value) => RECORD_KEYS.some((key) => value[key]), {
    message: "An activity has to be logged against a record",
  });

export type ActivityInput = z.infer<typeof createActivitySchema>;

/** A record the activity names that is not in this workspace. */
export class ActivityRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActivityRefused";
  }
}

/**
 * Logs an interaction against any CRM record as the signed-in person:
 * `POST /api/v2/crm/activities` and Vane's approved "log a note" both come
 * here. Every record it names must be in this workspace; a deal's or lead's
 * company is filled in from it, and "last contacted" moves.
 */
export async function logCrmActivity(actor: { companyId: string; userId: string }, input: ActivityInput) {
  const { companyId } = actor;
  const data = { ...input };

  // Every referenced record has to be in this tenant, or an activity could be
  // written onto someone else's record.
  if (data.leadId) {
    const lead = await prisma.crmLead.findFirst({ where: { id: data.leadId, companyId }, select: { id: true, clientId: true } });
    if (!lead) throw new ActivityRefused("Lead not found");
    data.clientId = data.clientId ?? lead.clientId ?? undefined;
  }
  if (data.dealId) {
    const deal = await prisma.crmDeal.findFirst({ where: { id: data.dealId, companyId }, select: { id: true, clientId: true } });
    if (!deal) throw new ActivityRefused("Deal not found");
    data.clientId = data.clientId ?? deal.clientId ?? undefined;
  }
  if (data.personId) {
    const person = await prisma.crmPerson.findFirst({ where: { id: data.personId, companyId }, select: { id: true } });
    if (!person) throw new ActivityRefused("Person not found");
  }
  if (data.clientId) {
    const client = await prisma.crmClient.findFirst({ where: { id: data.clientId, companyId }, select: { id: true } });
    if (!client) throw new ActivityRefused("Company not found");
  }

  const occurredAt = data.occurredAt ? new Date(data.occurredAt) : new Date();
  return prisma.$transaction(async (tx) => {
    const created = await tx.crmActivity.create({
      data: {
        companyId,
        type: data.type,
        subject: data.subject,
        body: data.body,
        leadId: data.leadId,
        dealId: data.dealId,
        clientId: data.clientId,
        personId: data.personId,
        createdById: actor.userId,
        occurredAt,
      },
    });

    // "Last contacted" is what the CRM answers when someone asks whether a
    // customer has gone quiet, so it moves whenever an interaction is logged.
    if (data.personId) {
      await tx.crmPerson.update({ where: { id: data.personId }, data: { lastContactedAt: occurredAt } });
    }
    if (data.clientId) {
      await tx.crmClient.update({ where: { id: data.clientId }, data: { lastContactedAt: occurredAt } });
    }
    if (data.leadId) {
      await tx.crmLead.updateMany({ where: { id: data.leadId, firstContactAt: null }, data: { firstContactAt: occurredAt } });
    }

    return created;
  });
}
