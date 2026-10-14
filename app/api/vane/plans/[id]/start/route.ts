import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { startPlan, startPlanSchema } from "@/lib/vane/plans";

/**
 * Start: a plan Vane laid out begins, with the steps as the person left them
 * (Change the steps). Nothing in a plan runs before a person presses this.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const body = startPlanSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return errorResponse("Each step needs a few words", 400);
    const outcome = await startPlan(prisma, {
      companyId: session.user.companyId,
      userId: session.user.id,
      planId: id,
      steps: body.data.steps,
    });
    if (!outcome.ok) return errorResponse(outcome.message, outcome.status);
    return successResponse({ id, status: "open" });
  } catch (error) {
    console.error("[API] POST /api/vane/plans/[id]/start error:", error);
    return errorResponse("Could not start the plan");
  }
}
