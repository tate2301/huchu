import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { canEditRecord } from "@/lib/crm/permissions";
import {
  WORK_ORDER_STATUS_LABELS,
  allowedTransitions,
  cancelWorkOrderSchema,
  transitionOutcome,
} from "@/lib/crm/work-orders";
import { jobRecordRefs, loadJobForAction, recordJobActivity } from "../../_shared";

/**
 * The job isn't happening.
 *
 * Raised against the wrong site, quoted twice, the customer changed their
 * mind — a job raised in error had no way out and sat in the register forever
 * counting as open work, which is the one number a coordinator's day is
 * planned against.
 *
 * Deliberately not on the stage rail: cancelling is not a step along the path,
 * it is leaving it, the same way Lost is on a deal. And deliberately not
 * `canWorkJob` — being on the crew is enough to move a job along and not
 * enough to write it off, which is the same line the invoice route draws.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    const job = await loadJobForAction(companyId, id);
    if (!job) return errorResponse("Job not found", 404);
    if (!(await canEditRecord(session, job.assignedToId))) {
      return errorResponse("You can only cancel jobs assigned to you", 403);
    }

    const data = cancelWorkOrderSchema.parse((await request.json().catch(() => ({}))) ?? {});

    const outcome = transitionOutcome(job.status, "CANCELLED");
    if (outcome === "REFUSED") {
      return NextResponse.json(
        {
          error:
            job.status === "COMPLETED"
              ? "This job is done and signed off — cancelling it would erase work that happened"
              : `A ${WORK_ORDER_STATUS_LABELS[job.status].toLowerCase()} job can't be cancelled`,
          code: "INVALID_TRANSITION",
          allowed: allowedTransitions(job.status).map((status) => ({
            value: status,
            label: WORK_ORDER_STATUS_LABELS[status],
          })),
        },
        { status: 409 },
      );
    }

    // Already cancelled: hand it back untouched rather than writing a second
    // reason over the first. The reason is the record of why, and the first
    // one is the true one.
    if (outcome === "SAME") {
      return successResponse({
        ...job,
        allowedTransitions: allowedTransitions(job.status),
        transitioned: false,
      });
    }

    const now = new Date();
    const updated = await prisma.crmWorkOrder.update({
      where: { id },
      data: {
        status: "CANCELLED",
        // The reason a job was written off is the same column as the reason it
        // stalled — both answer "why is nobody working on this?", and a
        // cancelled job's old blocker would otherwise stand as its epitaph.
        blockedReason: data.reason,
      },
      include: {
        items: { orderBy: { position: "asc" } },
        assignedTo: { select: { id: true, name: true } },
      },
    });

    await recordJobActivity(prisma, {
      companyId,
      userId: session.user.id,
      job,
      refs: jobRecordRefs(job),
      subject: `Work order ${job.workOrderNo}: cancelled`,
      body: data.reason,
      metadata: { status: "CANCELLED" },
      occurredAt: now,
    });

    return successResponse({
      ...updated,
      allowedTransitions: allowedTransitions(updated.status),
      transitioned: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/work-orders/[id]/cancel error:", error);
    return errorResponse("Failed to cancel the job");
  }
}
