import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { tickPlanStep } from "@/lib/vane/lists";

const bodySchema = z.object({ done: z.boolean() });

/** A person ticks one of their own steps in a plan, or unticks it. Vane's steps are Vane's. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; stepId: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id, stepId } = await params;
    const body = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return errorResponse("Say whether the step is done", 400);
    const outcome = await tickPlanStep(
      prisma,
      { companyId: session.user.companyId, userId: session.user.id },
      { planId: id, stepId, done: body.data.done },
    );
    if (outcome === "not-found") return errorResponse("That step is not in this plan", 404);
    if (outcome === "vane-owns-it") return errorResponse("Vane ticks its own steps as its jobs finish", 403);
    if (outcome === "not-started") return errorResponse("Press Start first: nothing in the plan moves before then", 409);
    return successResponse({ id: stepId, done: body.data.done });
  } catch (error) {
    console.error("[API] PATCH /api/vane/plans/[id]/steps/[stepId] error:", error);
    return errorResponse("Could not tick the step");
  }
}
