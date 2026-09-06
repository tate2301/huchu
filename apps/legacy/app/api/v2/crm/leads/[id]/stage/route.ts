import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { canEditRecord } from "@/lib/crm/permissions";
import { changeLeadStage, crmLeadStageSchema } from "@/lib/crm/pipeline";
import { runAutomations } from "@/lib/crm/automation-runner";

const bodySchema = z.object({
  stage: crmLeadStageSchema,
  lostReason: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await prisma.crmLead.findFirst({
      where: { id, companyId: session.user.companyId },
      select: {
        id: true,
        stage: true,
        assignedToId: true,
        clientId: true,
        // The promotion to a deal reads these to fill the deal in without
        // stopping to ask; `convertedDealId` is how it knows not to do it twice.
        convertedDealId: true,
        leadNo: true,
        title: true,
        estimatedValue: true,
        currency: true,
      },
    });
    if (!existing) return errorResponse("Lead not found", 404);
    if (!await canEditRecord(session, existing.assignedToId)) {
      return errorResponse("You can only change stage on leads assigned to you", 403);
    }

    const { stage, lostReason } = bodySchema.parse(await request.json());
    if (stage === existing.stage) return successResponse({ id, stage });

    const updated = await prisma.$transaction((tx) =>
      changeLeadStage(tx, {
        companyId: session.user.companyId,
        userId: session.user.id,
        lead: existing,
        stage,
        lostReason,
      }),
    );

    await runAutomations({
      companyId: session.user.companyId,
      trigger: "LEAD_STAGE_CHANGED",
      entity: "LEAD",
      recordId: id,
      record: updated as unknown as Record<string, unknown>,
      stage,
      actorId: session.user.id,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/leads/[id]/stage error:", error);
    return errorResponse("Failed to change stage");
  }
}
