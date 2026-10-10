import { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { auditExportDownloaded } from "@/lib/retail/audit";
import { requireRetailPermission } from "@/lib/retail/permissions";
import {
  NONE_CLOSED,
  findShiftZReports,
  zReportExportSchema,
  zReportsCsv,
  zReportsFileName,
} from "@/lib/retail/z-report-bulk";
import { requireRetailSession } from "../../_helpers";

/**
 * Download Z-reports as CSV (00-foundations 4.8).
 *
 * `{ shiftIds, format: "csv" }` → one row per stored Z-report of the days
 * those shifts belong to: date, till, sales, takings, cash expected, counted,
 * variance, and what each tender took. `X-Not-Closed` as for print.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.cash-control", "view");
  if (gate) return gate;

  const parsed = zReportExportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.issues);

  try {
    const companyId = session.user.companyId;
    const found = await findShiftZReports(prisma, companyId, parsed.data.shiftIds);
    if (found.reports.length === 0) return errorResponse(NONE_CLOSED, 409);

    await auditExportDownloaded(prisma, {
      actor: { companyId, userId: session.user.id, userName: session.user.name, userRole: session.user.role },
      key: "retail-z-reports",
      format: "csv",
      rows: found.reports.length,
    });

    const headers: Record<string, string> = {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${zReportsFileName(found.reports, "csv")}"`,
    };
    if (found.notClosed > 0) {
      headers["X-Not-Closed"] = String(found.notClosed);
      headers["Access-Control-Expose-Headers"] = "X-Not-Closed";
    }
    return new NextResponse(zReportsCsv(found.reports), { headers });
  } catch (error) {
    console.error("[API] POST /api/v2/retail/z-reports/export error:", error);
    return errorResponse("The Z-reports could not be downloaded");
  }
}
