import { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { auditExportDownloaded } from "@/lib/retail/audit";
import { canRetailSessionDo, retailPermissionDenial } from "@/lib/retail/permission-matrix";
import { NONE_CLOSED, findDayZReports, findShiftZReports, zReportPrintSchema, zReportsFileName } from "@/lib/retail/z-report-bulk";
import { zReportsPdf } from "@/lib/retail/z-report-pdf";
import { requireRetailSession } from "../../_helpers";

/**
 * Print Z-reports (00-foundations 4.8; FLR-07).
 *
 * `{ shiftIds }` (the Shifts list) → the stored Z-reports of the register-days
 * those shifts were opened on; `{ days: [{ siteId, date }] }` (Past days) →
 * the Z-reports each site-day's close took. One per page, as one PDF. Nothing
 * is recalculated: a Z-report is frozen when the day closes. When some of the
 * days are not closed yet the PDF still comes back with the ones that are,
 * and `X-Not-Closed: <n>` says how many are missing; when none is closed it
 * answers 409.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  if (!canRetailSessionDo(session, "retail.cash-control", "view") && !canRetailSessionDo(session, "retail.end-of-day", "view")) {
    return errorResponse(retailPermissionDenial(session, "retail.end-of-day", "view")!, 403);
  }

  const parsed = zReportPrintSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.issues);

  try {
    const companyId = session.user.companyId;
    const found =
      "days" in parsed.data
        ? await findDayZReports(prisma, companyId, parsed.data.days)
        : await findShiftZReports(prisma, companyId, parsed.data.shiftIds);
    if (found.reports.length === 0) return errorResponse(NONE_CLOSED, 409);

    const pdf = await zReportsPdf(companyId, found.reports);

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
