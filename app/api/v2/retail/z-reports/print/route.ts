import { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { getDocumentBranding } from "@/lib/documents/branding-snapshot";
import { renderDocumentShell } from "@/lib/documents/html-renderer";
import { renderPdfFromHtml } from "@/lib/documents/pdf-renderer";
import { resolveTemplate } from "@/lib/documents/template-resolver";
import { prisma } from "@/lib/prisma";
import { auditExportDownloaded } from "@/lib/retail/audit";
import { requireRetailPermission } from "@/lib/retail/permissions";
import {
  NONE_CLOSED,
  Z_REPORT_CSS,
  findShiftZReports,
  zReportPrintSchema,
  zReportsFileName,
  zReportsHtml,
} from "@/lib/retail/z-report-bulk";
import { requireRetailSession } from "../../_helpers";

/**
 * Print Z-reports (00-foundations 4.8, the Shifts list's bulk action).
 *
 * `{ shiftIds }` → the stored Z-reports of the register-days those shifts were
 * opened on, one per page, as one PDF. Nothing is recalculated: a Z-report is
 * frozen when the day closes. When some of the days are not closed yet the
 * PDF still comes back with the ones that are, and `X-Not-Closed: <n>` says
 * how many are missing; when none is closed it answers 409.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.cash-control", "view");
  if (gate) return gate;

  const parsed = zReportPrintSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.issues);

  try {
    const companyId = session.user.companyId;
    const found = await findShiftZReports(prisma, companyId, parsed.data.shiftIds);
    if (found.reports.length === 0) return errorResponse(NONE_CLOSED, 409);

    const [template, branding] = await Promise.all([
      resolveTemplate({
        companyId,
        documentType: "REPORT_TABLE",
        targetType: "LIST",
        sourceKey: "ui.table.reports.retail-z-reports",
      }),
      getDocumentBranding(companyId),
    ]);
    const schema = {
      ...template.templateSchema,
      page: { ...template.templateSchema.page, orientation: "portrait" as const },
      labels: { ...template.templateSchema.labels, documentTitle: undefined },
    };
    const html = renderDocumentShell({
      branding,
      template: schema,
      title: found.reports.length === 1 ? "Z-report" : "Z-reports",
      subtitle:
        found.reports.length === 1
          ? found.reports[0]!.reportNo
          : `${found.reports.length} trading days, ${found.reports[0]!.businessDate} to ${found.reports[found.reports.length - 1]!.businessDate}`,
      content: zReportsHtml(found.reports),
      css: Z_REPORT_CSS,
    });
    const pdf = await renderPdfFromHtml({ html, template: schema });

    await auditExportDownloaded(prisma, {
      actor: { companyId, userId: session.user.id, userName: session.user.name, userRole: session.user.role },
      key: "retail-z-reports",
      format: "pdf",
      rows: found.reports.length,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${zReportsFileName(found.reports, "pdf")}"`,
    };
    if (found.notClosed > 0) {
      headers["X-Not-Closed"] = String(found.notClosed);
      headers["Access-Control-Expose-Headers"] = "X-Not-Closed";
    }
    return new NextResponse(new Uint8Array(pdf), { headers });
  } catch (error) {
    console.error("[API] POST /api/v2/retail/z-reports/print error:", error);
    return errorResponse("The Z-reports could not be printed");
  }
}
