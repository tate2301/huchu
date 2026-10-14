import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { ActivityRefused, createActivitySchema, logCrmActivity } from "@/lib/crm/log-activity";

/**
 * Log an interaction against any CRM record.
 *
 * The per-lead endpoint predates deals, people and companies; this one takes
 * whichever record the activity belongs to, so the same composer works on
 * every record page.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const data = createActivitySchema.parse(await request.json());
    const activity = await logCrmActivity({ companyId: session.user.companyId, userId: session.user.id }, data);
    return successResponse(activity, 201);
  } catch (error) {
    if (error instanceof ActivityRefused) return errorResponse(error.message, 404);
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/activities error:", error);
    return errorResponse("Failed to log the activity");
  }
}
