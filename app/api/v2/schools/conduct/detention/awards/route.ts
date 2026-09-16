import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { getCurrentTerm } from "@/lib/schools/calendar";
import { DetentionError, awardDetention } from "@/lib/schools/detention";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * Award detention, and name the pupil on the sessions they will serve.
 *
 * Both halves in one act: the award carries how many sessions are owed, and a
 * register row is written for each session named. A pupil who owes two Fridays
 * appears on two registers rather than on one with a number beside it — which
 * is what makes `1 of 2` a fact rather than a label.
 */

const schema = z.object({
  studentId: z.string().uuid(),
  incidentId: z.string().uuid().nullish(),
  reason: z.string().trim().max(200).nullish(),
  sessionsOwed: z.coerce.number().int().min(1).max(10),
  sessionIds: z.array(z.string().uuid()).min(1).max(10),
  termId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.conduct", "edit");
    if (denied) return errorResponse(denied, 403);

    const body = schema.parse(await request.json());
    const companyId = session.user.companyId;
    const termId = body.termId ?? (await getCurrentTerm(companyId))?.id;
    if (!termId) {
      return errorResponse("The school has no term running to award this in.", 400);
    }

    const award = await awardDetention({
      companyId,
      actorId: session.user.id,
      termId,
      studentId: body.studentId,
      incidentId: body.incidentId ?? null,
      reason: body.reason ?? null,
      sessionsOwed: body.sessionsOwed,
      sessionIds: body.sessionIds,
    });
    return successResponse(award, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof DetentionError) return errorResponse(error.message, 422);
    console.error("[API] POST /api/v2/schools/conduct/detention/awards error:", error);
    return errorResponse("Failed to award the detention");
  }
}
