/**
 * Money in and money out, one entry at a time.
 *
 * POST is idempotent when the device supplies a `clientEntryId`, which the
 * offline outbox always does. A replayed entry lands once; without that a bad
 * afternoon on the road doubles the day's spend.
 *
 * A submitted log is closed to new entries. A day somebody has declared
 * finished and then quietly added to is not a day anybody can check.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { addCostEntry, costEntrySchema, dayTotals } from "@/lib/crm/daily-log";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;
    const { id } = await params;

    const log = await prisma.crmDailyLog.findFirst({
      where: { id, companyId },
      select: { id: true, userId: true, submittedAt: true },
    });
    if (!log) return errorResponse("Daily log not found", 404);
    if (log.userId !== session.user.id) {
      return errorResponse("You can only add to your own daily log", 403);
    }
    if (log.submittedAt) {
      return errorResponse(
        "This day has been submitted. Ask a manager to reopen it if something is missing.",
        409,
      );
    }

    const data = costEntrySchema.parse(await request.json());

    if (data.projectId) {
      const project = await prisma.crmProject.findFirst({
        where: { id: data.projectId, companyId },
        select: { id: true },
      });
      if (!project) return errorResponse("Project not found", 404);
    }
    if (data.requisitionId) {
      const requisition = await prisma.crmRequisition.findFirst({
        where: { id: data.requisitionId, companyId, requestedById: session.user.id },
        select: { id: true },
      });
      if (!requisition) return errorResponse("Requisition not found", 404);
    }

    const entry = await prisma.$transaction((tx) => addCostEntry(tx, companyId, id, data));

    const entries = await prisma.crmDailyCostEntry.findMany({
      where: { companyId, logId: id },
      select: { direction: true, amount: true, projectId: true, receiptUrl: true },
    });

    return successResponse({ entry, totals: dayTotals(entries) }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/crm/daily-logs/[id]/entries error:", error);
    return errorResponse("Failed to record the entry");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;
    const { id } = await params;

    const { searchParams } = new URL(request.url);
    const entryId = searchParams.get("entryId");
    if (!entryId) return errorResponse("Which entry?", 400);

    const entry = await prisma.crmDailyCostEntry.findFirst({
      where: { id: entryId, companyId, logId: id },
      select: { id: true, log: { select: { userId: true, submittedAt: true } } },
    });
    if (!entry) return errorResponse("Entry not found", 404);
    if (entry.log.userId !== session.user.id) {
      return errorResponse("You can only change your own daily log", 403);
    }
    if (entry.log.submittedAt) {
      return errorResponse("This day has been submitted and cannot be changed.", 409);
    }

    await prisma.crmDailyCostEntry.delete({ where: { id: entryId } });
    return successResponse({ deleted: entryId });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/daily-logs/[id]/entries error:", error);
    return errorResponse("Failed to remove the entry");
  }
}
