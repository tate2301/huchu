/**
 * Money in and money out, one line at a time — the one door every spend or
 * income line comes through.
 *
 * The daily tracker, a requisition's report and a project's "Add spend" all
 * post here, and all of it goes through `addCostEntry`, so there is one ledger
 * of field money rather than three that add up slightly differently. A line
 * lands on its author's log for the day it names, which is what makes the
 * receipt photographed on a requisition's page show on that person's day too.
 *
 * POST is idempotent when the device supplies a `clientEntryId`, which the
 * offline outbox always does. A replayed entry lands once; without that a bad
 * afternoon on the road doubles the day's spend.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { CostEntryError, addCostEntry, costEntrySchema, dayTotals } from "@/lib/crm/daily-log";
import { postCostEntry } from "@/lib/crm/money-posting";
import { canReport, type RequisitionStatus } from "@/lib/crm/requisitions";

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;

    const data = costEntrySchema.parse(await request.json());

    if (data.projectId) {
      const project = await prisma.crmProject.findFirst({
        where: { id: data.projectId, companyId },
        select: { id: true },
      });
      if (!project) return errorResponse("Project not found", 404);
    }

    // A line against a requisition is somebody reporting what they did with
    // money handed to them — so it has to be their own requisition, and one
    // still open to a report. An acquitted requisition's figure is settled;
    // a line added afterwards would make it disagree with its own lines.
    let projectId = data.projectId;
    if (data.requisitionId) {
      const requisition = await prisma.crmRequisition.findFirst({
        where: { id: data.requisitionId, companyId, requestedById: session.user.id },
        select: { id: true, status: true, projectId: true },
      });
      if (!requisition) return errorResponse("Requisition not found", 404);
      if (!canReport(requisition.status as RequisitionStatus)) {
        return errorResponse(
          requisition.status === "ACQUITTED"
            ? "This requisition has been accounted for. Its report is closed."
            : "Spend can be reported once the requisition is approved.",
          409,
        );
      }
      // The money was asked for against a project, so what it bought is that
      // project's cost unless the line says otherwise.
      if (projectId === undefined) projectId = requisition.projectId;
    }

    const entry = await prisma.$transaction((tx) =>
      addCostEntry(tx, { ...data, projectId, companyId, userId: session.user.id }),
    );

    // An entry that names a requisition posts nothing: that money was
    // expensed when it was disbursed, and posting it again would double the
    // cost. Best-effort, like every other posting call — the line is the thing
    // the person needs saved.
    try {
      await postCostEntry(companyId, entry, session.user.id);
    } catch (error) {
      console.error("[API] cost entry posting failed:", error);
    }

    const entries = await prisma.crmDailyCostEntry.findMany({
      where: { companyId, logId: entry.logId },
      select: { direction: true, amount: true, projectId: true, receiptUrl: true },
    });

    return successResponse({ entry, totals: dayTotals(entries) }, 201);
  } catch (error) {
    if (error instanceof CostEntryError) return errorResponse(error.message, 409);
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/crm/cost-entries error:", error);
    return errorResponse("Failed to record the entry");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;

    const id = new URL(request.url).searchParams.get("id");
    if (!id) return errorResponse("Which entry?", 400);

    const entry = await prisma.crmDailyCostEntry.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        log: { select: { userId: true, submittedAt: true } },
        requisition: { select: { status: true } },
      },
    });
    if (!entry) return errorResponse("Entry not found", 404);
    if (entry.log.userId !== session.user.id) {
      return errorResponse("You can only change your own money", 403);
    }
    if (entry.log.submittedAt) {
      return errorResponse("This day has been submitted and cannot be changed.", 409);
    }
    if (entry.requisition?.status === "ACQUITTED") {
      return errorResponse(
        "This line is part of a requisition that has been accounted for, so it stays.",
        409,
      );
    }

    await prisma.crmDailyCostEntry.delete({ where: { id } });
    return successResponse({ deleted: id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/cost-entries error:", error);
    return errorResponse("Failed to remove the entry");
  }
}
