/**
 * The daily reports, as management reads them.
 *
 * Stored reports, not recomputed ones: the 14th read three weeks later is the
 * 14th as the person submitted it. A manager sees everybody's; anybody else
 * sees their own, which is worth keeping available — somebody should be able
 * to check what was said about their day.
 */
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { toLogDate } from "@/lib/crm/daily-log";
import { requireCrmCapability } from "../_helpers";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);
    const seesEveryone = await requireCrmCapability(session, "records.edit.any");

    const date = searchParams.get("date");
    const userId = searchParams.get("userId");

    const where: Prisma.CrmDailyReportWhereInput = {
      companyId,
      ...(seesEveryone
        ? userId
          ? { userId }
          : {}
        : { userId: session.user.id }),
      ...(date ? { reportDate: toLogDate(new Date(date)) } : {}),
    };

    const [reports, total] = await Promise.all([
      prisma.crmDailyReport.findMany({
        where,
        orderBy: [{ reportDate: "desc" }, { generatedAt: "desc" }],
        skip,
        take: limit,
        include: { user: { select: { id: true, name: true } } },
      }),
      prisma.crmDailyReport.count({ where }),
    ]);

    return successResponse({
      ...paginationResponse(reports, total, page, limit),
      seesEveryone,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/daily-reports error:", error);
    return errorResponse("Failed to load the daily reports");
  }
}
