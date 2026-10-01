import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { isOrgAdminRole } from "@/lib/preferences/nav";
import { canReadReport } from "@/lib/reports/access";
import { reportCatalog } from "@/lib/reports/catalog";
import { REPORT_DEFINITIONS } from "@/lib/reports/registry";
import { readReportSettings } from "@/lib/reports/settings";
import type { ReportSettingSummary } from "@/lib/reports/types";


/**
 * Every report this workspace has, switched on or not, for the people who
 * decide which are offered: in the order the catalogue shows them, so the
 * list in management reads like the list everybody else sees.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!isOrgAdminRole(session.user.role)) return errorResponse("Only managers set up reports", 403);

    const access = { role: session.user.role, enabledFeatures: session.user.enabledFeatures };
    const settings = await readReportSettings(session.user.companyId);
    const byKey = new Map(REPORT_DEFINITIONS.map((definition) => [definition.key, definition]));
    const areas = reportCatalog(
      REPORT_DEFINITIONS.filter((definition) => canReadReport(definition, access)),
      access,
      session.user.workspaceProfile,
    ).map((area) => ({
      area: area.area,
      reports: area.reports.map((entry): ReportSettingSummary => {
        const saved = settings.get(entry.key);
        return {
          key: entry.key,
          settingId: saved?.id ?? null,
          title: byKey.get(entry.key)!.title,
          area: area.area,
          enabled: saved?.enabled ?? true,
          arranged: Boolean(saved?.layout),
          viewSaved: Boolean(saved?.view),
        };
      }),
    }));
    return successResponse({ areas });
  } catch (error) {
    console.error("[API] GET /api/v2/reports/settings error:", error);
    return errorResponse("Failed to load report settings");
  }
}
