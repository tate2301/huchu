import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { reportCatalog } from "@/lib/reports/catalog";
import { readableSources, readerOf } from "@/lib/reports/custom/sources";
import { listCustomReports } from "@/lib/reports/custom/store";
import { templateReads, templatesFor } from "@/lib/reports/custom/templates";
import { REPORT_DEFINITIONS } from "@/lib/reports/registry";
import { disabledReportKeys } from "@/lib/reports/settings";
import { sqlName } from "@/lib/reports/sql/schema";

/**
 * The reports this person can open, arranged for their workspace's industry;
 * the custom reports built in it; and the built-in custom reports they are
 * offered. Each custom one lists under the area of the first report it reads,
 * beside that report and the templates saved from it.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const sources = await readableSources(session);
    const areaOfTable = new Map(sources.map((source) => [sqlName(source.key), source.area]));
    const areaOfKey = new Map(sources.map((source) => [source.key, source.area]));
    const reads = templateReads();

    const custom = (await listCustomReports(readerOf(session))).map((report) => ({
      ...report,
      area: report.areaSources.map((table) => areaOfTable.get(table)).find(Boolean) ?? null,
    }));
    const builtCustom = templatesFor(sources, { id: session.user.id, role: session.user.role }, session.user.workspaceProfile).map((template) => ({
      key: template.key,
      title: template.title,
      description: template.description,
      audience: template.audience,
      area: (reads.get(template.key) ?? []).map((key) => areaOfKey.get(key)).find(Boolean) ?? null,
    }));

    return successResponse({
      areas: reportCatalog(
        REPORT_DEFINITIONS,
        { role: session.user.role, enabledFeatures: session.user.enabledFeatures },
        session.user.workspaceProfile,
        await disabledReportKeys(session.user.companyId),
      ),
      custom,
      builtCustom,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/reports error:", error);
    return errorResponse("Failed to list reports");
  }
}
