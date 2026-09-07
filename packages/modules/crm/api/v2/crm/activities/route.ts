import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";

const RECORD_KEYS = ["leadId", "dealId", "clientId", "personId"] as const;

const createActivitySchema = z
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

/**
 * Log an interaction against any CRM record.
 *
 * The per-lead endpoint predates deals, people and companies; this one takes
 * whichever record the activity belongs to, so the same composer works on
 * every record page.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const data = createActivitySchema.parse(await request.json());

    // Every referenced record has to be in this tenant, or an activity could be
    // written onto someone else's record.
    if (data.leadId) {
      const lead = await prisma.crmLead.findFirst({
        where: { id: data.leadId, companyId },
        select: { id: true, clientId: true },
      });
      if (!lead) return errorResponse("Lead not found", 404);
      data.clientId = data.clientId ?? lead.clientId ?? undefined;
    }
    if (data.dealId) {
      const deal = await prisma.crmDeal.findFirst({
        where: { id: data.dealId, companyId },
        select: { id: true, clientId: true },
      });
      if (!deal) return errorResponse("Deal not found", 404);
      data.clientId = data.clientId ?? deal.clientId ?? undefined;
    }
    if (data.personId) {
      const person = await prisma.crmPerson.findFirst({
        where: { id: data.personId, companyId },
        select: { id: true },
      });
      if (!person) return errorResponse("Person not found", 404);
    }
    if (data.clientId) {
      const client = await prisma.crmClient.findFirst({
        where: { id: data.clientId, companyId },
        select: { id: true },
      });
      if (!client) return errorResponse("Company not found", 404);
    }

    const occurredAt = data.occurredAt ? new Date(data.occurredAt) : new Date();
    const activity = await prisma.$transaction(async (tx) => {
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
          createdById: session.user.id,
          occurredAt,
        },
      });

      // "Last contacted" is what the CRM answers when someone asks whether a
      // customer has gone quiet, so it moves whenever an interaction is logged.
      if (data.personId) {
        await tx.crmPerson.update({
          where: { id: data.personId },
          data: { lastContactedAt: occurredAt },
        });
      }
      if (data.clientId) {
        await tx.crmClient.update({
          where: { id: data.clientId },
          data: { lastContactedAt: occurredAt },
        });
      }
      if (data.leadId) {
        await tx.crmLead.updateMany({
          where: { id: data.leadId, firstContactAt: null },
          data: { firstContactAt: occurredAt },
        });
      }

      return created;
    });

    return successResponse(activity, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/activities error:", error);
    return errorResponse("Failed to log the activity");
  }
}
