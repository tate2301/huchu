import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { reportCatalog } from "@/lib/reports/catalog";
import { readerOf } from "@/lib/reports/custom/sources";
import { listCustomReports } from "@/lib/reports/custom/store";
import { REPORT_DEFINITIONS } from "@/lib/reports/registry";
import { disabledReportKeys } from "@/lib/reports/settings";

/** The reports this person can open, arranged for their workspace's industry, and the ones built in it. */
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
      custom: await listCustomReports(readerOf(session)),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/reports error:", error);
    return errorResponse("Failed to list reports");
  }
}
