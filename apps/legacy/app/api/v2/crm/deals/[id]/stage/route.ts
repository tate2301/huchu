import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { runAutomations } from "@/lib/crm/automation-runner";
import { canEditRecord } from "@/lib/crm/permissions";
import { missingRequiredFields } from "@/lib/crm/pipelines";
import { fieldLabel } from "@/lib/crm/history";

const bodySchema = z.object({
  stageId: z.string().uuid(),
  lostReason: z.string().trim().max(500).optional(),
  /** Move even though the stage's required fields aren't filled in. */
  force: z.boolean().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    const deal = await prisma.crmDeal.findFirst({
      where: { id, companyId },
      include: {
        stage: { select: { id: true, name: true, requiredFields: true } },
        _count: { select: { appointments: true, documents: true } },
      },
    });
    if (!deal) return errorResponse("Deal not found", 404);
    if (!await canEditRecord(session, deal.assignedToId)) {
      return errorResponse("You can only change stage on deals assigned to you", 403);
    }

    const body = bodySchema.parse(await request.json());
    if (body.stageId === deal.stageId) return successResponse(deal);

    const stage = await prisma.crmPipelineStage.findFirst({
      where: { id: body.stageId, companyId, archivedAt: null },
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
    if (!stage) return errorResponse("Stage not found", 404);
    if (stage.pipelineId !== deal.pipelineId) {
      return errorResponse("That stage belongs to a different pipeline", 400);
    }

    // Stage gates say what a deal needs before it may move on. They are
    // advisory — `force` lets a user proceed — but the default is to stop and
    // say exactly what is missing.
    if (!body.force) {
      const blockers: string[] = [];
      const missing = missingRequiredFields(
        deal as unknown as Record<string, unknown>,
        stage.requiredFields,
      );
      for (const field of missing) blockers.push(`${fieldLabel(field)} is required to reach ${stage.name}.`);
      if (stage.requiresSiteVisit && deal._count.appointments === 0) {
        blockers.push(`${stage.name} expects a site visit to have been booked.`);
      }
      if (stage.requiresQuotation && deal._count.documents === 0) {
        blockers.push(`${stage.name} expects a quotation to exist.`);
      }
      if (blockers.length > 0) {
        return NextResponse.json(
          { error: "Stage requirements not met", code: "STAGE_REQUIREMENTS", blockers },
          { status: 409 },
        );
      }
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.crmDeal.update({
        where: { id },
        data: {
          stageId: stage.id,
          status: stage.status,
          probability: stage.probability,
          stageEnteredAt: now,
          // Terminal timestamps always reflect the current status: entering an
          // outcome stamps it and clears the opposing one; reopening clears both.
          wonAt: stage.status === "WON" ? now : null,
          lostAt: stage.status === "LOST" ? now : null,
          lostReason: stage.status === "LOST" ? body.lostReason ?? null : null,
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
          dealId: id,
          clientId: deal.clientId ?? undefined,
          subject: `Stage changed ${deal.stage.name} → ${stage.name}`,
          metadata: {
            fromStageId: deal.stageId,
            fromStage: deal.stage.name,
            toStageId: stage.id,
            toStage: stage.name,
            ...(body.lostReason ? { lostReason: body.lostReason } : {}),
          },
          createdById: session.user.id,
          occurredAt: now,
        },
      });

      return result;
    });

    await runAutomations({
      companyId: session.user.companyId,
      trigger: "DEAL_STAGE_CHANGED",
      entity: "DEAL",
      recordId: id,
      record: updated as unknown as Record<string, unknown>,
      stage: stage.name,
      actorId: session.user.id,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/deals/[id]/stage error:", error);
    return errorResponse("Failed to change stage");
  }
}
