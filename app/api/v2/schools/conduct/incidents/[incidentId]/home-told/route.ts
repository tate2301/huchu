import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { ConductError, markHomeNotNeeded, tellHome } from "@/lib/schools/conduct";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * `Tell home`.
 *
 * It records that a guardian was told, and it is not a message send. A deputy
 * head who has just put the phone down is writing down what she did; the
 * product does not get to claim it rang somebody.
 *
 * `tell-home` is its own action rather than `edit`, because a teacher may log
 * what happened in her lesson and should not be the one telling a family — a
 * parent hears from the office, once.
 */

const schema = z.union([
  z.object({
    channel: z.string().trim().min(1).max(120),
    at: z.string().datetime().optional(),
  }),
  z.object({
    notNeeded: z.literal(true),
    reason: z.string().trim().max(200).optional(),
  }),
]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ incidentId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.conduct", "tell-home");
    if (denied) return errorResponse(denied, 403);

    const { incidentId } = await context.params;
    const body = schema.parse(await request.json());
    const base = {
      companyId: session.user.companyId,
      actorId: session.user.id,
      incidentId,
    };

    if ("notNeeded" in body) {
      const updated = await markHomeNotNeeded({ ...base, reason: body.reason });
      return successResponse(updated);
    }
    const updated = await tellHome({
      ...base,
      channel: body.channel,
      at: body.at ? new Date(body.at) : undefined,
    });
    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof ConductError) return errorResponse(error.message, 422);
    console.error("[API] POST /api/v2/schools/conduct/incidents/[id]/home-told error:", error);
    return errorResponse("Failed to record that home was told");
  }
}
