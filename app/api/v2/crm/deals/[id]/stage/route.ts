import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { DealStageRefused, moveDealStage } from "@/lib/crm/deal-stage";

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
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const moved = await moveDealStage(session, id, body);
    return successResponse(moved.deal);
  } catch (error) {
    if (error instanceof DealStageRefused) {
      return error.blockers
        ? NextResponse.json({ error: error.message, code: "STAGE_REQUIREMENTS", blockers: error.blockers }, { status: error.status })
        : errorResponse(error.message, error.status);
    }
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/deals/[id]/stage error:", error);
    return errorResponse("Failed to change stage");
  }
}
