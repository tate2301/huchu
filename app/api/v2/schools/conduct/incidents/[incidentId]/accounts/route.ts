import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { ConductError, addAccount, markIncidentSeen } from "@/lib/schools/conduct";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * `Add an update` — an account of what happened, appended.
 *
 * It never overwrites. An account, once given, is what somebody said at the
 * time; a school asked about an incident a year later needs the first version
 * as well as the second. There is deliberately no DELETE here.
 */

const schema = z.object({
  authorKind: z.enum(["STAFF", "STUDENT"]),
  authorStudentId: z.string().uuid().nullish(),
  body: z.string().trim().min(1).max(4000),
  takenAt: z.string().datetime().optional(),
  /** Stamp the head-of-year step at the same time, where this is that review. */
  markSeen: z.boolean().optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ incidentId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.conduct", "create");
    if (denied) return errorResponse(denied, 403);

    const { incidentId } = await context.params;
    const body = schema.parse(await request.json());
    const base = {
      companyId: session.user.companyId,
      actorId: session.user.id,
      incidentId,
    };

    const account = await addAccount({
      ...base,
      authorKind: body.authorKind,
      authorStudentId: body.authorStudentId ?? null,
      body: body.body,
      takenAt: body.takenAt ? new Date(body.takenAt) : undefined,
    });
    if (body.markSeen) await markIncidentSeen(base);
    return successResponse(account, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof ConductError) return errorResponse(error.message, 422);
    console.error("[API] POST /api/v2/schools/conduct/incidents/[id]/accounts error:", error);
    return errorResponse("Failed to add the update");
  }
}
