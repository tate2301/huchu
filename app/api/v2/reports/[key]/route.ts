import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { isOrgAdminRole } from "@/lib/preferences/nav";
import { parseListQuery } from "@/lib/reports/list-query";
import { fetchListIds, fetchListPage, fetchReport, paramsFromSearch } from "@/lib/reports/request";
import { readTemplate } from "@/lib/reports/templates";

/**
 * Two modes.
 *
 * **List mode** (`?page=`, 00-foundations 4.1): one page of a working list,
 * with totals over every filtered row, group subtotals, tab counts and the
 * query as resolved; `idsOnly=1` returns every matching id instead (at most
 * 5,000) for "Select all", and `pick=a,b` adds those columns' values beside
 * them. Refused with 403 "Your role cannot view <noun>" when the list's own
 * check says no. `face=report` reads the source's report face (404 "Report
 * not found" without one), `template=<ref>` lays a Reports template under the
 * address (404 "Template not found" when it is not the caller's to open or
 * reads another source), `rows=` rolls it up and `cols=` orders its columns.
 *
 * **Report mode** (no `page`): a report's rows, narrowed by its params, for
 * sources with no list and no report face; the others answer 404. The
 * view is applied by whoever reads them. Opened as a template (`?template=`),
 * the template's kept params sit under whatever the URL says, and its view is
 * the one the report starts from.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { key } = await params;
    const { session } = sessionResult;
    const search = request.nextUrl.searchParams;
    if (search.has("page")) {
      const query = parseListQuery(search);
      const answer =
        search.get("idsOnly") === "1"
          ? await fetchListIds(session, key, query, (search.get("pick") ?? "").split(",").filter(Boolean))
          : await fetchListPage(session, key, query);
      if ("error" in answer) return errorResponse(answer.error, answer.status);
      return successResponse(answer);
    }
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
