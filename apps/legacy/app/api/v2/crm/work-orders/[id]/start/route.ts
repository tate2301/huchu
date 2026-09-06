import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import {
  WORK_ORDER_STATUS_LABELS,
  allowedTransitions,
  startWorkOrderSchema,
  transitionOutcome,
} from "@/lib/crm/work-orders";
import { canWorkJob, jobRecordRefs, loadJobForAction, recordJobActivity } from "../../_shared";

/**
 * The crew is on site.
 *
 * Stamps `startedAt` once and only once: a job paused by a blocker and picked
 * up again started when it first started, and rewriting that would quietly
 * shorten every job that ever went wrong.
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

    const body = await request.json().catch(() => ({}));
    const data = startWorkOrderSchema.parse(body ?? {});

    const outcome = transitionOutcome(job.status, "IN_PROGRESS");
    if (outcome === "REFUSED") {
      return NextResponse.json(
        {
          error:
            job.status === "DRAFT"
              ? "Book the job in before starting it"
              : `A ${WORK_ORDER_STATUS_LABELS[job.status].toLowerCase()} job can't be started`,
          code: "INVALID_TRANSITION",
          allowed: allowedTransitions(job.status).map((status) => ({
            value: status,
            label: WORK_ORDER_STATUS_LABELS[status],
          })),
        },
        { status: 409 },
      );
    }

    // A second tap gets the job back exactly as it is, and leaves no second
    // line in the history saying the crew arrived twice.
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
        status: "IN_PROGRESS",
        startedAt: job.startedAt ?? now,
        blockedReason: null,
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
      subject: `Work order ${job.workOrderNo}: on site`,
      body: data.note ?? null,
      metadata: { status: "IN_PROGRESS", startedAt: updated.startedAt?.toISOString() ?? null },
      occurredAt: now,
    });

    return successResponse({
      ...updated,
      allowedTransitions: allowedTransitions(updated.status),
      transitioned: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/work-orders/[id]/start error:", error);
    return errorResponse("Failed to start the job");
  }
}
