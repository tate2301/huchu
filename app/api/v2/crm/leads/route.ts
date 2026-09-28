import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { reserveIdentifier } from "@/lib/id-generator";
import { crmLeadStageSchema, defaultProbabilityForStage } from "@/lib/crm/pipeline";
import { leadsRegister } from "@/lib/crm/registers/server/leads";
import { registerGet } from "@/lib/crm/registers/server/route";
import { deriveLeadChannel } from "@/lib/crm/sources";
import { autoAssignLead } from "@/lib/crm/auto-assign";
import { runAutomations } from "@/lib/crm/automation-runner";
import { scoreLead } from "@/lib/crm/lead-scoring";
import { isCompanyUser } from "../_helpers";

const createLeadSchema = z.object({
  title: z.string().trim().max(200).nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  contactName: z.string().trim().max(200).nullable().optional(),
  contactEmail: z.string().trim().email().max(200).nullable().optional(),
  contactPhone: z.string().trim().max(40).nullable().optional(),
  stage: crmLeadStageSchema.optional(),
  estimatedValue: z.number().finite().nonnegative().nullable().optional(),
  currency: z.string().trim().max(10).optional(),
  services: z.array(z.string().trim().max(80)).max(40).optional(),
  source: z.string().trim().max(120).nullable().optional(),
  sourceChannel: z.string().trim().max(20).nullable().optional(),
  utmSource: z.string().trim().max(120).nullable().optional(),
  utmMedium: z.string().trim().max(120).nullable().optional(),
  utmCampaign: z.string().trim().max(120).nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
});

/** The list: see `registerGet` — the page's own query string, paged. */
export async function GET(request: NextRequest) {
  return registerGet(request, leadsRegister);
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const data = createLeadSchema.parse(await request.json());
    const stage = data.stage ?? "NEW";

    if (data.clientId) {
      const client = await prisma.crmClient.findFirst({
        where: { id: data.clientId, companyId: session.user.companyId },
        select: { id: true },
      });
      if (!client) return errorResponse("Invalid client", 400);
    }
    if (!(await isCompanyUser(session.user.companyId, data.assignedToId))) {
      return errorResponse("Invalid assignee", 400);
    }

    const leadNo = await reserveIdentifier(prisma, {
      companyId: session.user.companyId,
      entity: "CRM_LEAD",
    });

    const sourceChannel = deriveLeadChannel({
      explicitChannel: data.sourceChannel,
      utmMedium: data.utmMedium,
      utmSource: data.utmSource,
      source: data.source,
      origin: "MANUAL",
    });

    // A lead with nobody on it is a lead nobody works, so one gets picked when
    // the caller didn't name anyone.
    const assignment = data.assignedToId
      ? null
      : await autoAssignLead(session.user.companyId);

    const score = scoreLead({
      estimatedValue: data.estimatedValue,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      clientId: data.clientId,
      services: data.services,
      sourceChannel,
    });

    const lead = await prisma.crmLead.create({
      data: {
        companyId: session.user.companyId,
        leadNo,
        title: data.title ?? undefined,
        clientId: data.clientId ?? undefined,
        contactName: data.contactName ?? undefined,
        contactEmail: data.contactEmail ?? undefined,
        contactPhone: data.contactPhone ?? undefined,
        stage,
        probability: defaultProbabilityForStage(stage),
        estimatedValue: data.estimatedValue ?? undefined,
        currency: data.currency ?? "USD",
        services: data.services ?? [],
        source: data.source ?? undefined,
        sourceChannel,
        utmSource: data.utmSource ?? undefined,
        utmMedium: data.utmMedium ?? undefined,
        utmCampaign: data.utmCampaign ?? undefined,
        assignedToId: data.assignedToId ?? assignment?.userId ?? undefined,
        createdById: session.user.id,
        score: score.total,
      },
    });

    // Rules run after the lead exists and never fail the request that made it.
    await runAutomations({
      companyId: session.user.companyId,
      trigger: "LEAD_CREATED",
      entity: "LEAD",
      recordId: lead.id,
      record: lead as unknown as Record<string, unknown>,
      stage: lead.stage,
      actorId: session.user.id,
    });

    return successResponse({ ...lead, scoreBreakdown: score, assignment }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/leads error:", error);
    return errorResponse("Failed to create lead");
  }
}
