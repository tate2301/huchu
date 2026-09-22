/**
 * The day's cost log.
 *
 * GET opens the caller's log for a day — creating it if this is the first
 * time anyone has asked — and returns it with its entries and totals. It is a
 * GET that writes, which is usually wrong and is right here: the log is an
 * empty container keyed on (person, day), the upsert is idempotent, and making
 * the phone POST before it can show today's page would mean a rep with no
 * signal cannot see what they already recorded.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { dayTotals, openDailyLog, openLogSchema, toLogDate } from "@/lib/crm/daily-log";
import { requireCrmCapability } from "../_helpers";

async function loadLog(companyId: string, logId: string) {
  return prisma.crmDailyLog.findFirst({
    where: { id: logId, companyId },
    include: {
      entries: {
        orderBy: { createdAt: "asc" },
        include: {
          project: { select: { id: true, name: true, projectNo: true } },
          requisition: { select: { id: true, requisitionNo: true } },
        },
      },
      user: { select: { id: true, name: true } },
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    const when = dateParam ? new Date(dateParam) : new Date();
    if (Number.isNaN(when.getTime())) return errorResponse("That is not a date", 400);

    // Reading somebody else's day is a manager's business, not a colleague's.
    const requestedUserId = searchParams.get("userId");
    let userId = session.user.id;
    if (requestedUserId && requestedUserId !== session.user.id) {
      if (!(await requireCrmCapability(session, "records.edit.any"))) {
        return errorResponse("You can only see your own daily log", 403);
      }
      userId = requestedUserId;
    }

    const opened = await prisma.$transaction((tx) =>
      openDailyLog(tx, companyId, userId, when),
    );
    const log = await loadLog(companyId, opened.id);
    if (!log) return errorResponse("Daily log not found", 404);

    return successResponse({ log, totals: dayTotals(log.entries) });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/daily-logs error:", error);
    return errorResponse("Failed to open the daily log");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;

    const data = openLogSchema.parse(await request.json());
    const logDate = toLogDate(data.logDate ?? new Date());

    const log = await prisma.crmDailyLog.update({
      where: {
        companyId_userId_logDate: { companyId, userId: session.user.id, logDate },
      },
      data: { notes: data.notes ?? null },
    });

    return successResponse({ log });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/crm/daily-logs error:", error);
    return errorResponse("Failed to save the note");
  }
}
