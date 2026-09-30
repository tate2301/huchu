import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { isOrgAdminRole } from "@/lib/preferences/nav";
import { fetchReport, paramsFromSearch } from "@/lib/reports/request";

/** A report's rows, narrowed by its params. The view is applied by whoever reads them. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { key } = await params;
    const { session } = sessionResult;
    const preview = request.nextUrl.searchParams.get("preview") === "1" && isOrgAdminRole(session.user.role);
    const report = await fetchReport(session, key, paramsFromSearch(request.nextUrl.searchParams), { preview });
    if (!report) return errorResponse("Report not found", 404);
    return successResponse({
      report: report.meta,
      params: report.params,
      rows: report.rows,
      truncated: report.truncated,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/reports/[key] error:", error);
    return errorResponse("Failed to load report");
  }
}
