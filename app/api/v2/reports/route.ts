import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { offeredTemplates } from "@/lib/library/reports";
import { canReadReport } from "@/lib/reports/access";
import { reportCatalog } from "@/lib/reports/catalog";
import { readableSources, readerOf } from "@/lib/reports/custom/sources";
import { listCustomReports } from "@/lib/reports/custom/store";
import { listReportFolders } from "@/lib/reports/folders";
import { REPORT_DEFINITIONS } from "@/lib/reports/registry";
import { disabledReportKeys } from "@/lib/reports/settings";
import { sqlName } from "@/lib/reports/sql/schema";
import { listTemplates } from "@/lib/reports/templates";

/**
 * The reports this person can open, arranged for their workspace's industry;
 * the custom reports built in it; and the built-in custom reports they are
 * offered. Each custom one lists under the area of the first report it reads,
 * beside that report and the templates saved from it. With them, the
 * templates saved from reports and the workspace's folders: everything All
 * reports and Reports' panel draw, in one answer.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const sources = await readableSources(session);
    const areaOfTable = new Map(sources.map((source) => [sqlName(source.key), source.area]));
    const areaOfKey = new Map(sources.map((source) => [source.key, source.area]));

    const custom = (await listCustomReports(readerOf(session))).map((report) => ({
      ...report,
      area: report.areaSources.map((table) => areaOfTable.get(table)).find(Boolean) ?? null,
    }));
    // Corelith's: the ones in code, then the library's published ones that reach this workspace.
    const builtCustom = (await offeredTemplates(session, sources)).map((template) => ({
      key: template.key,
      title: template.title,
      description: template.description,
      audience: template.audience,
      area: template.reads.map((key) => areaOfKey.get(key)).find(Boolean) ?? null,
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
      templates: await listTemplates(session),
      folders: await listReportFolders(readerOf(session)),
      // Books' statements, listed under From Corelith for whoever can open them.
      financialReports: canReadReport(
        { href: "/books/financials" },
        { role: session.user.role, enabledFeatures: session.user.enabledFeatures },
      ),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/reports error:", error);
    return errorResponse("Failed to list reports");
  }
}
