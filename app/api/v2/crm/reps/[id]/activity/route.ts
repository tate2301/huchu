import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { ACTIVITY_DAYS, mayOpenMember, memberActivity } from "@/lib/crm/member-overview";
import { periodFromQuery } from "@/lib/crm/period";

/**
 * A member's days in a period, newest first — each one the daily report for
 * that day: the one management got if the day was closed, built fresh if it
 * is still open.
 *
 * Its own route rather than part of the member's page, because building days
 * is the expensive part of that page and only the Activity section needs it.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await context.params;

    const member = await prisma.user.findFirst({ where: { id, companyId }, select: { id: true } });
    if (!member) return errorResponse("Team member not found", 404);
    if (!(await mayOpenMember(session, id))) {
      return errorResponse("You can only open your own overview", 403);
    }

    const period = periodFromQuery(new URL(request.url).searchParams);
    if (!period) return errorResponse("The period ends before it starts", 400);

    const days = await memberActivity(prisma, { companyId, userId: id, ...period });
    return successResponse({ data: days, limit: ACTIVITY_DAYS });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/reps/[id]/activity error:", error);
    return errorResponse("Failed to load their days");
  }
}
