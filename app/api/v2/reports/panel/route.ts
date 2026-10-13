import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { reportCatalog } from "@/lib/reports/catalog";
import { readableSources } from "@/lib/reports/custom/sources";
import { templateReads, templatesFor } from "@/lib/reports/custom/templates";
import { getReportDefinition, REPORT_DEFINITIONS } from "@/lib/reports/registry";
import { disabledReportKeys } from "@/lib/reports/settings";
import type { PanelReport } from "@/lib/rail/reports";

/**
 * The reports a module's panel lists under "Reports from <module>": every
 * report this person can open, with the pages it is about, so the panel can
 * file each one under the module those pages belong to. A built-in report is
 * about its own page (`href`); a built-in custom report is about the pages of
 * the reports it reads.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { user } = session;

    const builtIn: PanelReport[] = reportCatalog(
      REPORT_DEFINITIONS,
      { role: user.role, enabledFeatures: user.enabledFeatures },
      user.workspaceProfile,
      await disabledReportKeys(user.companyId),
    ).flatMap((area) =>
      area.reports.map((report) => ({
        key: report.key,
        title: report.title,
        href: `/reports/${report.key}`,
        about: [getReportDefinition(report.key)?.href].filter((href): href is string => Boolean(href)),
      })),
    );

    const reads = templateReads();
    const built: PanelReport[] = templatesFor(
      await readableSources(session),
      { id: user.id, role: user.role },
      user.workspaceProfile,
    ).map((template) => ({
      key: `built-${template.key}`,
      title: template.title,
      href: `/reports/built/${template.key}`,
      about: (reads.get(template.key) ?? [])
        .map((key) => getReportDefinition(key)?.href)
        .filter((href): href is string => Boolean(href)),
    }));

    return successResponse({ reports: [...builtIn, ...built] });
  } catch (error) {
    console.error("[API] GET /api/v2/reports/panel error:", error);
    return errorResponse("Could not list the reports");
  }
}
