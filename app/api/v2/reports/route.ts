import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { reportCatalog } from "@/lib/reports/catalog";
import { REPORT_DEFINITIONS } from "@/lib/reports/registry";
import { disabledReportKeys } from "@/lib/reports/settings";

/** The reports this person can open, arranged for their workspace's industry. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    return successResponse({
      areas: reportCatalog(
        REPORT_DEFINITIONS,
        { role: session.user.role, enabledFeatures: session.user.enabledFeatures },
        session.user.workspaceProfile,
        await disabledReportKeys(session.user.companyId),
      ),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/reports error:", error);
    return errorResponse("Failed to list reports");
  }
}
