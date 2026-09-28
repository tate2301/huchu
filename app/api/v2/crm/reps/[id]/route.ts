import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { mayOpenMember, memberAchievements, memberOutstanding } from "@/lib/crm/member-overview";
import { dayKey, periodFromQuery } from "@/lib/crm/period";

/** How much of somebody's book to put on one page before it stops being readable. */
const SAMPLE = 20;

/**
 * One member of the team: who they are, what they got done in a period, what
 * is outstanding against them, and what they are carrying.
 *
 * A member opens their own; a manager, or somebody who may see everybody's
 * money, opens anybody's (`mayOpenMember`). The team list itself stays open to
 * everybody, because you cannot hand a lead over to somebody you cannot see.
 *
 * The period is `from` and `to`, defaulting to this month so far.
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

    const rep = await prisma.user.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
    if (!rep) return errorResponse("Team member not found", 404);
    if (!(await mayOpenMember(session, id))) {
      return errorResponse("You can only open your own overview", 403);
    }

    const period = periodFromQuery(new URL(request.url).searchParams);
    if (!period) return errorResponse("The period ends before it starts", 400);
    const scope = { companyId, userId: id, ...period };

    const [leads, deals, openTasks, achieved, outstanding] = await Promise.all([
      prisma.crmLead.findMany({
        // Their live pipeline. A converted lead is archived and its deal is
        // listed right beside this, so an archived row here would show the
        // same opportunity twice on one person's page.
        where: {
          companyId,
          assignedToId: id,
          archivedAt: null,
          stage: { notIn: ["WON", "LOST"] },
        },
        select: {
          id: true,
          leadNo: true,
          title: true,
          stage: true,
          estimatedValue: true,
          currency: true,
          updatedAt: true,
          client: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: SAMPLE,
      }),
      prisma.crmDeal.findMany({
        where: { companyId, assignedToId: id, status: "OPEN" },
        select: {
          id: true,
          dealNo: true,
          title: true,
          value: true,
          currency: true,
          expectedCloseDate: true,
          updatedAt: true,
          stage: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: SAMPLE,
      }),
      prisma.crmTask.count({ where: { companyId, assignedToId: id, status: "OPEN" } }),
      memberAchievements(prisma, scope),
      memberOutstanding(prisma, scope),
    ]);

    return successResponse({
      rep,
      period: { from: dayKey(period.from), to: dayKey(period.to) },
      achieved,
      outstanding,
      openTasks,
      leads,
      deals,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/reps/[id] error:", error);
    return errorResponse("Failed to fetch the team member");
  }
}
