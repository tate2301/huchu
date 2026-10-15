import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { loadReportsOverview } from "@/lib/reports/overview-server";
import { verticalOf } from "@/lib/reports/verticals";

/**
 * A vertical's Reports overview (PageSchoolReports, PageMineReports,
 * PagePayReports, PageShopReports, PageRetailReports): the workspace's own
 * profile decides which. A general workspace has none: its Overview is the
 * week's insights.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const vertical = verticalOf(session.user.workspaceProfile);
    if (!vertical) return errorResponse("This workspace has no Reports overview", 404);
    return successResponse(await loadReportsOverview(session, vertical));
  } catch (error) {
    console.error("[API] GET /api/v2/reports/overview error:", error);
    return errorResponse("Failed to load the overview");
  }
}
