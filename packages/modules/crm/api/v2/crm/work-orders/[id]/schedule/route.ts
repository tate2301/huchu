import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import {
  WORK_ORDER_STATUS_LABELS,
  allowedTransitions,
  scheduleWorkOrderSchema,
  transitionOutcome,
} from "../../../../../../work-orders";
import { isCompanyUser } from "../../../_helpers";
import { canWorkJob, jobRecordRefs, loadJobForAction, recordJobActivity } from "../../_shared";

function whenLabel(start: Date): string {
  return start.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Book the job in: a slot, and somebody to turn up.
 *
 * Rescheduling an already-scheduled job goes through here too rather than
 * being refused as a non-transition — moving Tuesday's job to Thursday is the
 * commonest thing that happens to a diary.
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

    const data = scheduleWorkOrderSchema.parse((await request.json().catch(() => ({}))) ?? {});

    if (!(await isCompanyUser(companyId, data.assignedToId))) {
      return errorResponse("Invalid assignee", 400);
    }
    for (const crewId of data.crewIds ?? []) {
      if (!(await isCompanyUser(companyId, crewId))) {
        return errorResponse("A crew member isn't in this company", 400);
      }
    }

    const start = new Date(data.scheduledStart);
    const end = data.scheduledEnd ? new Date(data.scheduledEnd) : null;
    if (end && end.getTime() < start.getTime()) {
      return errorResponse("The job can't finish before it starts", 400);
    }

    const outcome = transitionOutcome(job.status, "SCHEDULED");
    if (outcome === "REFUSED") {
      return NextResponse.json(
        {
          error: `A ${WORK_ORDER_STATUS_LABELS[job.status].toLowerCase()} job can't be scheduled`,
          code: "INVALID_TRANSITION",
          allowed: allowedTransitions(job.status).map((status) => ({
            value: status,
            label: WORK_ORDER_STATUS_LABELS[status],
          })),
        },
        { status: 409 },
      );
    }

    const updated = await prisma.crmWorkOrder.update({
      where: { id },
      data: {
        status: "SCHEDULED",
        scheduledStart: start,
        scheduledEnd: end,
        // An explicit null means "take the name off it", which is different
        // from not mentioning the assignee at all.
        assignedToId: data.assignedToId,
        crewIds: data.crewIds,
        // Booking it in answers whatever it was stuck on, or else it would sit
        // there showing a stale reason next to a fresh appointment.
        blockedReason: null,
      },
      include: {
        items: { orderBy: { position: "asc" } },
        assignedTo: { select: { id: true, name: true } },
      },
    });

    const refs = jobRecordRefs(job);
    await recordJobActivity(prisma, {
      companyId,
      userId: session.user.id,
      job,
      refs,
      subject: `Work order ${job.workOrderNo} booked for ${whenLabel(start)}`,
      body: data.note ?? null,
      metadata: {
        status: "SCHEDULED",
        scheduledStart: start.toISOString(),
        scheduledEnd: end?.toISOString() ?? null,
      },
    });

    return successResponse({
      ...updated,
      allowedTransitions: allowedTransitions(updated.status),
      /** False when the job was already scheduled and only the slot moved. */
      transitioned: outcome === "ALLOWED",
    });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/work-orders/[id]/schedule error:", error);
    return errorResponse("Failed to schedule the job");
  }
}
