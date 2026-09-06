import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import {
  WORK_ORDER_STATUS_LABELS,
  allowedTransitions,
  blockWorkOrderSchema,
  transitionOutcome,
} from "@/lib/crm/work-orders";
import { canWorkJob, jobRecordRefs, loadJobForAction, recordJobActivity } from "../../_shared";

/**
 * The job has stalled, and why.
 *
 * The reason is the whole point — "blocked" on its own tells a coordinator
 * nothing they can act on, whereas "the meter cupboard is locked and the
 * caretaker is away until Thursday" tells them who to ring. So it is required,
 * and a re-block with a new reason overwrites the old one rather than being
 * refused: the reason a job is stuck changes while it is stuck.
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
    if (!(await canWorkJob(session, job))) {
      return errorResponse("You're not on this job", 403);
    }

    // An unparseable body should come back as "say why it's blocked", not as a
    // server error — the caller's mistake is a missing reason either way.
    const data = blockWorkOrderSchema.parse((await request.json().catch(() => ({}))) ?? {});

    const outcome = transitionOutcome(job.status, "BLOCKED");
    if (outcome === "REFUSED") {
      return NextResponse.json(
        {
          error: `A ${WORK_ORDER_STATUS_LABELS[job.status].toLowerCase()} job can't be blocked`,
          code: "INVALID_TRANSITION",
          allowed: allowedTransitions(job.status).map((status) => ({
            value: status,
            label: WORK_ORDER_STATUS_LABELS[status],
          })),
        },
        { status: 409 },
      );
    }

    const changed = outcome === "ALLOWED" || job.blockedReason !== data.reason;

    const updated = await prisma.crmWorkOrder.update({
      where: { id },
      data: { status: "BLOCKED", blockedReason: data.reason },
      include: {
        items: { orderBy: { position: "asc" } },
        assignedTo: { select: { id: true, name: true } },
      },
    });

    // Re-sending the same reason is a retry, not news.
    if (changed) {
      await recordJobActivity(prisma, {
        companyId,
        userId: session.user.id,
        job,
        refs: jobRecordRefs(job),
        subject: `Work order ${job.workOrderNo}: blocked`,
        body: data.reason,
        metadata: { status: "BLOCKED" },
      });
    }

    return successResponse({
      ...updated,
      allowedTransitions: allowedTransitions(updated.status),
      transitioned: outcome === "ALLOWED",
    });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/work-orders/[id]/block error:", error);
    return errorResponse("Failed to block the job");
  }
}
