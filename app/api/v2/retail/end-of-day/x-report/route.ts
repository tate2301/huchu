import { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { DayRefused, checkDay, dayRefusalResponse } from "@/lib/retail/floor/day-close";
import { retailPermissionDenial } from "@/lib/retail/permission-matrix";
import { serializeRetailZReport } from "@/lib/retail/z-report";
import { tillDayReport } from "@/lib/retail/z-report-generate";
import { zReportsPdf } from "@/lib/retail/z-report-pdf";
import { requireRetailSession } from "../../_helpers";

/**
 * One till's day so far as a PDF (FLR-07, Defined here): the Z-report's own
 * figures (`buildRetailZReportFigures`) from the rows as they stand, marked
 * "Not final until the day closes". Nothing is stored; End of day links it
 * for each till while the day is open.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const denied = retailPermissionDenial(session, "retail.end-of-day", "view");
  if (denied) return errorResponse(denied, 403);

  const params = new URL(request.url).searchParams;
  const companyId = session.user.companyId;
  try {
    const date = checkDay(params.get("date"));
    const register = await prisma.retailRegister.findFirst({
      where: { id: params.get("registerId") ?? "", companyId, siteId: params.get("siteId") ?? "" },
      select: { code: true, site: { select: { name: true } } },
    });
    if (!register) return errorResponse("Till not found", 404);
    const { data } = await tillDayReport(
      { actor: { companyId, userId: session.user.id, userName: session.user.name, userEmail: session.user.email }, registerCode: register.code, businessDate: date },
      prisma,
    );
    const payload = serializeRetailZReport({ ...data, id: "x-report", generatedAt: new Date() }, register.site.name);
    const pdf = await zReportsPdf(companyId, [payload], { title: "X-report", subtitle: `${payload.registerName} · Not final until the day closes` });
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="X-${payload.reportNo.replace(/^Z-/, "")}.pdf"` },
    });
  } catch (error) {
    if (error instanceof DayRefused) return dayRefusalResponse(error);
    if (error instanceof Error && /^No till was opened/.test(error.message)) return errorResponse("This till did not trade that day.", 404);
    throw error;
  }
}
