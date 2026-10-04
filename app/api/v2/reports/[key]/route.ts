import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { isOrgAdminRole } from "@/lib/preferences/nav";
import { fetchReport, paramsFromSearch } from "@/lib/reports/request";
import { readTemplate } from "@/lib/reports/templates";

/**
 * A report's rows, narrowed by its params. The view is applied by whoever reads them.
 *
 * Opened as a template (`?template=`), the template's kept params sit under
 * whatever the URL says, and its view is the one the report starts from.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { key } = await params;
    const { session } = sessionResult;
    const preview = request.nextUrl.searchParams.get("preview") === "1" && isOrgAdminRole(session.user.role);
    const templateId = request.nextUrl.searchParams.get("template");
    const template = templateId ? await readTemplate(session, templateId) : null;
    if (templateId && (!template || template.reportKey !== key)) return errorResponse("Template not found", 404);
    const given = { ...template?.params, ...paramsFromSearch(request.nextUrl.searchParams) };
    const report = await fetchReport(session, key, given, { preview });
    if (!report) return errorResponse("Report not found", 404);
    return successResponse({
      report: template ? { ...report.meta, defaultView: template.view } : report.meta,
      template,
      params: report.params,
      rows: report.rows,
      truncated: report.truncated,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/reports/[key] error:", error);
    return errorResponse("Failed to load report");
  }
}
