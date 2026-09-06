import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { insightsRepFilter } from "@corelithzw/module-crm/scope";
import { getFunnel, getPipelineValue } from "@corelithzw/module-crm/insights";

function parseDateParam(value: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseRange(request: NextRequest): { from?: Date; to?: Date } {
  const { searchParams } = new URL(request.url);
  return {
    from: parseDateParam(searchParams.get("from")),
    to: parseDateParam(searchParams.get("to")),
  };
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const repId = insightsRepFilter(session);
    const range = parseRange(request);
    const companyId = session.user.companyId;

    const [funnel, pipeline, followUps] = await Promise.all([
      getFunnel(companyId, { ...range, repId }),
      getPipelineValue(companyId, { repId }),
      prisma.crmFollowUp.groupBy({
        by: ["status"],
        where: {
          companyId,
          ...(repId ? { assignedToId: repId } : {}),
        },
        _count: { _all: true },
      }),
    ]);

    const now = new Date();
    const overdue = await prisma.crmFollowUp.count({
      where: {
        companyId,
        status: "PENDING",
        dueAt: { lt: now },
        ...(repId ? { assignedToId: repId } : {}),
      },
    });

    return successResponse({
      funnel,
      pipeline,
      followUps: {
        overdue,
        byStatus: Object.fromEntries(followUps.map((f) => [f.status, f._count._all])),
      },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/insights/summary error:", error);
    return errorResponse("Failed to fetch insights");
  }
}
