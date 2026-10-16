import { z } from "zod";

import { runAutomations } from "@/lib/crm/automation-runner";
import { autoAssignLead } from "@/lib/crm/auto-assign";
import { scoreLead } from "@/lib/crm/lead-scoring";
import { crmLeadStageSchema, defaultProbabilityForStage } from "@/lib/crm/pipeline";
import { deriveLeadChannel } from "@/lib/crm/sources";
import { reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";

/**
 * A lead made by a person (the leads list's New lead, or an operation run as
 * them): numbered, its channel worked out, given to someone when nobody was
 * named, scored, and the workspace's lead rules run on it. Shared by
 * `POST /api/v2/crm/leads` and `crm.lead.create`.
 */

export const createLeadSchema = z.object({
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

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

/** Why a lead was not made, in a sentence. */
export class LeadRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadRefused";
  }
}

export async function createLead(actor: { companyId: string; userId: string }, data: CreateLeadInput) {
  const stage = data.stage ?? "NEW";
  if (data.clientId) {
    const client = await prisma.crmClient.findFirst({ where: { id: data.clientId, companyId: actor.companyId }, select: { id: true } });
    if (!client) throw new LeadRefused("That company is not in this workspace.");
  }
  if (data.assignedToId) {
    const assignee = await prisma.user.findFirst({ where: { id: data.assignedToId, companyId: actor.companyId }, select: { id: true } });
    if (!assignee) throw new LeadRefused("That person is not on this team.");
  }

  const leadNo = await reserveIdentifier(prisma, { companyId: actor.companyId, entity: "CRM_LEAD" });
  const sourceChannel = deriveLeadChannel({
    explicitChannel: data.sourceChannel,
    utmMedium: data.utmMedium,
    utmSource: data.utmSource,
    source: data.source,
    origin: "MANUAL",
  });
  // A lead with nobody on it is a lead nobody works, so one gets picked when
  // the caller didn't name anyone.
  const assignment = data.assignedToId ? null : await autoAssignLead(actor.companyId);
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
      companyId: actor.companyId,
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
      createdById: actor.userId,
      score: score.total,
    },
  });

  // Rules run after the lead exists and never fail what made it.
  await runAutomations({
    companyId: actor.companyId,
    trigger: "LEAD_CREATED",
    entity: "LEAD",
    recordId: lead.id,
    record: lead as unknown as Record<string, unknown>,
    stage: lead.stage,
    actorId: actor.userId,
  });

  return { lead, score, assignment };
}
