import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { tickPlanStep, tickStepSchema } from "@/lib/vane/plans";

/** A person ticks their own plan step done, or not done. Vane's steps are refused: they tick as its jobs finish. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; stepId: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id, stepId } = await params;
    const body = tickStepSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return errorResponse("Say whether the step is done", 400);
    const outcome = await tickPlanStep(prisma, {
      companyId: session.user.companyId,
      userId: session.user.id,
      planId: id,
      stepId,
      done: body.data.done,
    });
    if (!outcome.ok) return errorResponse(outcome.message, outcome.status);
    return successResponse({ id: stepId, done: body.data.done, planDone: outcome.planDone });
  } catch (error) {
    console.error("[API] PATCH /api/vane/plans/[id]/steps/[stepId] error:", error);
    return errorResponse("Could not tick the step");
  }
}
