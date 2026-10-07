/**
 * The Z-reports already taken, newest first (S-7.2), for the till's end-of-day
 * panel. Taking them is Close the day's (FLR-07, `POST /api/v2/retail/end-of-day/close`):
 * a till's report is a by-product of closing its site's day, never asked for alone.
 *
 * `retail.cash-control` / `view`: a Z-report names every cashier's variance and
 * states the shop's takings, so a cashier does not read it.
 */

import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { tradingDayKey } from "@/lib/retail/z-report";
import { requireRetailSession } from "../_helpers";

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailPermission(session, "retail.cash-control", "view");
  if (gate) return gate;

  try {
    const reports = await prisma.retailZReport.findMany({
      where: { companyId: session.user.companyId },
      orderBy: [{ businessDate: "desc" }, { registerCode: "asc" }],
      take: 30,
      select: {
        id: true,
        reportNo: true,
        businessDate: true,
        registerCode: true,
        registerName: true,
        currency: true,
        generatedAt: true,
        generatedByName: true,
        grossTakings: true,
        cashVariance: true,
      },
    });

    return successResponse({
      // Today's trading day as the server keys it, so the till and the report agree on what "today" is.
      data: { businessDate: tradingDayKey(new Date()) },
      recent: reports.map((report) => ({ ...report, businessDate: tradingDayKey(report.businessDate) })),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/retail/z-reports error:", error);
    return errorResponse("Failed to load end-of-day reports");
  }
}
