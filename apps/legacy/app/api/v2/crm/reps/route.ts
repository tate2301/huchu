import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { getRepPerformance } from "@/lib/crm/insights";
import { CRM_ROLES, hasCrmFullAccess } from "@/lib/crm/scope";
import { rangeToDates, REPORT_RANGES, type ReportRange } from "@/lib/crm/reports";

/**
 * The sales team, as a directory rather than a bar chart.
 *
 * Rep performance already existed as a row in an insights report, which is
 * fine for ranking and useless for "who is this person and what are they
 * sitting on". This joins the roster to the numbers and to the live workload,
 * so a rep is a record you can open like any other.
 *
 * Performance follows the same rule as the rest of insights: a manager sees
 * everyone's numbers, a rep sees only their own. The roster itself is visible
 * to everybody, because you cannot hand a lead over to someone you cannot see.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const isManager = hasCrmFullAccess(session.user.role);

    const { searchParams } = new URL(request.url);
    const requested = searchParams.get("range");
    const range = (REPORT_RANGES as readonly string[]).includes(requested ?? "")
      ? (requested as ReportRange)
      : "90d";
    const { from, to } = rangeToDates(range);

    const reps = await prisma.user.findMany({
      where: { companyId, isActive: true, role: { in: CRM_ROLES } },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { name: "asc" },
    });

    const [performance, openLeads, openDeals, openTasks] = await Promise.all([
      getRepPerformance(companyId, { from, to, repId: isManager ? null : session.user.id }),
      prisma.crmLead.groupBy({
        by: ["assignedToId"],
        // What somebody is actually carrying. A converted lead is archived and
        // its deal is counted beside this figure, so leaving archived rows in
        // would credit one piece of business to a rep twice.
        where: { companyId, archivedAt: null, stage: { notIn: ["WON", "LOST"] } },
        _count: { _all: true },
        _sum: { estimatedValue: true },
      }),
      prisma.crmDeal.groupBy({
        by: ["assignedToId"],
        where: { companyId, status: "OPEN" },
        _count: { _all: true },
        _sum: { value: true },
      }),
      prisma.crmTask.groupBy({
        by: ["assignedToId"],
        where: { companyId, status: "OPEN" },
        _count: { _all: true },
      }),
    ]);

    const perfById = new Map(performance.map((row) => [row.repId, row]));
    const leadsById = new Map(openLeads.map((row) => [row.assignedToId, row]));
    const dealsById = new Map(openDeals.map((row) => [row.assignedToId, row]));
    const tasksById = new Map(openTasks.map((row) => [row.assignedToId, row]));

    const rows = reps.map((rep) => {
      const leads = leadsById.get(rep.id);
      const deals = dealsById.get(rep.id);
      return {
        id: rep.id,
        name: rep.name,
        email: rep.email,
        role: rep.role,
        joinedAt: rep.createdAt.toISOString(),
        openLeads: leads?._count._all ?? 0,
        openLeadValue: leads?._sum.estimatedValue ?? 0,
        openDeals: deals?._count._all ?? 0,
        openDealValue: deals?._sum.value ?? 0,
        openTasks: tasksById.get(rep.id)?._count._all ?? 0,
        // Null rather than zeroes when the viewer is not entitled to this
        // rep's numbers — zeroes would read as "sold nothing".
        performance: perfById.get(rep.id) ?? null,
      };
    });

    return successResponse({ data: rows, range, canSeeEveryone: isManager });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/reps error:", error);
    return errorResponse("Failed to fetch the sales team");
  }
}
