import { NextRequest, NextResponse } from "next/server";

import { errorResponse, hasRole, successResponse, validateSession } from "../../../../api-utils";
import { deliverDueWebhooks } from "../../../../outbox";

/**
 * One delivery pass for this workspace, run by hand. The webhook worker
 * (`pnpm enterprise worker:webhooks`) is what runs it continuously; this is
 * for an operator who wants a stuck queue moved now, and for a deployment
 * without a worker yet.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) return errorResponse("Manager access required", 403);

    const { outcomes, ...summary } = await deliverDueWebhooks({ companyId: session.user.companyId });
    return successResponse({ data: { ...summary, outcomes: outcomes.slice(0, 50) } });
  } catch (error) {
    console.error("[API] POST /api/v2/webhooks/deliver error:", error);
    return errorResponse("Failed to deliver webhooks");
  }
}
