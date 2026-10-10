/**
 * One Z-report, read back — as JSON for the screen, as CSV for the spreadsheet.
 *
 * S-7.2. This handler does no arithmetic at all, and that is the point: every
 * figure was frozen at generation, so reading is a `findFirst` and a shape change.
 * A reprint on any day, in either format, is identical to the first one because
 * there is nothing here that could make it otherwise.
 *
 * Gated on `retail.cash-control` / `view` or `retail.end-of-day` / `view` — a
 * document naming every cashier's variance is not a cashier's to read. `?format=pdf`
 * is the page End of day and Past days open.
 *
 * ── Export is here, email is not ───────────────────────────────────────────
 *
 * The prototype's footer offers three actions: save as a spreadsheet, email to
 * accounts, print. Two of them ship. The CSV is served from this route rather than
 * assembled in the browser so that the exported figures are the *stored* ones,
 * character for character, rather than a second rendering of them that could
 * disagree. Print is a stylesheet on the till screen.
 *
 * **Email is deliberately out of scope.** This repository has no outbound mail
 * pipeline for retail — nothing in `app/api/v2/retail/**` or `lib/retail/**` sends
 * a message, and the notification machinery that exists is in-app. Wiring a
 * transport, a from-address, a template and a delivery log is its own ticket with
 * its own failure modes, and a button that silently does nothing is worse than an
 * absent one. The report is exportable and printable; a manager who needs it in an
 * inbox attaches the CSV.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { parseRetailParams, parseRetailQuery, retailIdParams } from "@/lib/retail/request";
import { prisma } from "@/lib/prisma";
import { canRetailSessionDo, retailPermissionDenial } from "@/lib/retail/permission-matrix";
import { retailZReportToCsv, serializeRetailZReport } from "@/lib/retail/z-report";
import { zReportsPdf } from "@/lib/retail/z-report-pdf";
import { requireRetailSession } from "../../_helpers";

const zReportQuery = z.object({ format: z.enum(["csv", "pdf"]).optional() });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // Cash control reads it from a shift; End of day from the day it closed (FLR-07).
  if (!canRetailSessionDo(session, "retail.cash-control", "view") && !canRetailSessionDo(session, "retail.end-of-day", "view")) {
    return errorResponse(retailPermissionDenial(session, "retail.end-of-day", "view")!, 403);
  }

  /*
    R-3.1. The segment, through a schema.

    Prisma is not injectable, so this is not a security fix. It is the
    difference between a 400 naming the parameter and a 404 that reads, to a
    shopkeeper, as "the receipt you are holding is not in the system".
  */
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const { id } = path.data;
  const report = await prisma.retailZReport.findFirst({
    where: { id, companyId: session.user.companyId },
    include: { site: { select: { name: true } } },
  });
  if (!report) {
    return errorResponse("End-of-day report not found", 404);
  }

  const payload = serializeRetailZReport(report, report.site?.name ?? null);

  // Three renderings of one report: JSON for the till, CSV, and the PDF End of day opens.
  const query = parseRetailQuery(request, zReportQuery);
  if (query.response) return query.response;
  const format = query.data.format ?? null;

  if (format === "csv") {
    return new NextResponse(retailZReportToCsv(payload), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${payload.reportNo}.csv"`,
      },
    });
  }

  if (format === "pdf") {
    const pdf = await zReportsPdf(session.user.companyId, [payload]);
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${payload.reportNo}.pdf"` },
    });
  }

  return successResponse({ data: payload });
}
