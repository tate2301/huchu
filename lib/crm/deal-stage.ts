import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { runAutomations } from "@/lib/crm/automation-runner";
import { fieldLabel } from "@/lib/crm/history";
import { canEditRecord } from "@/lib/crm/permissions";
import { missingRequiredFields } from "@/lib/crm/pipelines";
import { prisma } from "@/lib/prisma";

/** Why a deal did not move, with the status the route answers; `blockers` when the stage's gates stopped it. */
export class DealStageRefused extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
    readonly blockers: string[] | null = null,
  ) {
    super(message);
    this.name = "DealStageRefused";
  }
}

export type DealStageMove = {
  stageId: string;
  lostReason?: string;
  /** Move even though the stage's required fields aren't filled in. */
  force?: boolean;
};

/**
 * Moves a deal to another stage of its pipeline as the signed-in person:
 * `POST /api/v2/crm/deals/[id]/stage` and Vane's approved "move the deal"
 * both come here. Only someone who may edit the deal moves it; the stage's
 * gates stop it unless forced, saying what is missing; the move is kept in
 * the deal's history and runs the workspace's automations.
 */
export async function moveDealStage(session: AuthenticatedSession, dealId: string, move: DealStageMove) {
  const companyId = session.user.companyId;
  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, companyId },
    include: {
      stage: { select: { id: true, name: true, requiredFields: true } },
      _count: { select: { appointments: true, documents: true } },
    },
  });
  if (!deal) throw new DealStageRefused(404, "Deal not found");
  if (!(await canEditRecord(session, deal.assignedToId))) {
    throw new DealStageRefused(403, "You can only change stage on deals assigned to you");
  }
  if (move.stageId === deal.stageId) return { deal, moved: false as const, from: deal.stage.name, to: deal.stage.name };

  const stage = await prisma.crmPipelineStage.findFirst({
    where: { id: move.stageId, companyId, archivedAt: null },
    select: {
      id: true,
      name: true,
      pipelineId: true,
      status: true,
      probability: true,
      requiredFields: true,
      requiresSiteVisit: true,
      requiresQuotation: true,
    },
  });
  if (!stage) throw new DealStageRefused(404, "Stage not found");
  if (stage.pipelineId !== deal.pipelineId) throw new DealStageRefused(400, "That stage belongs to a different pipeline");

  // Stage gates say what a deal needs before it may move on. They are
  // advisory — `force` lets a user proceed — but the default is to stop and
  // say exactly what is missing.
  if (!move.force) {
    const blockers: string[] = [];
    const missing = missingRequiredFields(deal as unknown as Record<string, unknown>, stage.requiredFields);
    for (const field of missing) blockers.push(`${fieldLabel(field)} is required to reach ${stage.name}.`);
    if (stage.requiresSiteVisit && deal._count.appointments === 0) {
      blockers.push(`${stage.name} expects a site visit to have been booked.`);
    }
    if (stage.requiresQuotation && deal._count.documents === 0) {
      blockers.push(`${stage.name} expects a quotation to exist.`);
    }
    if (blockers.length > 0) throw new DealStageRefused(409, "Stage requirements not met", blockers);
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.crmDeal.update({
      where: { id: dealId },
      data: {
        stageId: stage.id,
        status: stage.status,
        probability: stage.probability,
        stageEnteredAt: now,
        // Terminal timestamps always reflect the current status: entering an
        // outcome stamps it and clears the opposing one; reopening clears both.
        wonAt: stage.status === "WON" ? now : null,
        lostAt: stage.status === "LOST" ? now : null,
        lostReason: stage.status === "LOST" ? move.lostReason ?? null : null,
        ...(stage.status === "WON" ? { forecastCategory: "CLOSED" as const } : {}),
      },
      include: {
        stage: { select: { id: true, name: true, status: true } },
        client: { select: { id: true, name: true } },
      },
    });

    await tx.crmActivity.create({
      data: {
        companyId,
        type: "STAGE_CHANGE",
        dealId,
        clientId: deal.clientId ?? undefined,
        subject: `Stage changed ${deal.stage.name} → ${stage.name}`,
        metadata: {
          fromStageId: deal.stageId,
          fromStage: deal.stage.name,
          toStageId: stage.id,
          toStage: stage.name,
          ...(move.lostReason ? { lostReason: move.lostReason } : {}),
        },
        createdById: session.user.id,
        occurredAt: now,
      },
    });

    return result;
  });

  await runAutomations({
    companyId,
    trigger: "DEAL_STAGE_CHANGED",
    entity: "DEAL",
    recordId: dealId,
    record: updated as unknown as Record<string, unknown>,
    stage: stage.name,
    actorId: session.user.id,
  });

  return { deal: updated, moved: true as const, from: deal.stage.name, to: stage.name };
}
