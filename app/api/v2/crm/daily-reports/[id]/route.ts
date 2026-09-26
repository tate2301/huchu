/**
 * One stored daily report, for its own page — the link the close-the-day
 * notification carries.
 *
 * Read the way the list reads: a manager sees anybody's, anybody else their
 * own. Somebody else's report is not found rather than refused, so its
 * existence is not confirmed to someone who may not read it.
 */
import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { requireCrmCapability } from "../../_helpers";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const report = await prisma.crmDailyReport.findFirst({
      where: { id, companyId: session.user.companyId },
      include: { user: { select: { id: true, name: true } } },
    });
    const seesEveryone = await requireCrmCapability(session, "records.edit.any");
    if (!report || (!seesEveryone && report.userId !== session.user.id)) {
      return errorResponse("Daily report not found", 404);
    }

    return successResponse({ report });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/daily-reports/[id] error:", error);
    return errorResponse("Failed to load the daily report");
  }
}
