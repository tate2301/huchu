import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { retryLeadEvent } from "@/lib/crm/facebook/webhook";

import { requireCrmCapability } from "../../../../../_helpers";

type RouteParams = { params: Promise<{ id: string; eventId: string }> };

/**
 * Run a failed delivery again.
 *
 * What fails here is almost always a token, and the fix is almost always in
 * the Meta dashboard — so the retry has to be a button somebody presses after
 * fixing it, not a schedule that gave up hours ago. Meta serves a lead's
 * answers for 90 days, which is the window this is useful in.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!(await requireCrmCapability(session, "settings.manage"))) {
      return errorResponse("Manager access required", 403);
    }

    const { eventId } = await params;
    const result = await retryLeadEvent(session.user.companyId, eventId);
    return successResponse(result);
  } catch (error) {
    console.error("[API] POST /api/v2/crm/integrations/facebook/[id]/events/[eventId] error:", error);
    return errorResponse("Failed to retry the delivery");
  }
}
