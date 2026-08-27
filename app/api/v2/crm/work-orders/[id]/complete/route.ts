import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  WORK_ORDER_STATUS_LABELS,
  allowedTransitions,
  completeWorkOrderSchema,
  completionBlockers,
  completionPercent,
  transitionOutcome,
  workOrderInvoiceBlockers,
} from "@/lib/crm/work-orders";
import { canWorkJob, jobRecordRefs, loadJobForAction, recordJobActivity } from "../../_shared";

/**
 * Close the job out.
 *
 * Progress and the signature can arrive in the same request, because on site
 * they happen in the same minute: the last item gets ticked and the customer
 * signs. So the readiness check runs against what the job is about to be,
 * not what it is.
 *
 * Completing does NOT raise an invoice. Billing a customer is a decision
 * somebody makes, not a consequence of a crew tapping Done — see the
 * `/invoice` route beside this one.
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
    const data = completeWorkOrderSchema.parse(body ?? {});

    const outcome = transitionOutcome(job.status, "COMPLETED");
    if (outcome === "REFUSED") {
      return NextResponse.json(
        {
          error:
            job.status === "SCHEDULED" || job.status === "DRAFT"
              ? "Start the job before completing it — a job nobody went to isn't done"
              : `A ${WORK_ORDER_STATUS_LABELS[job.status].toLowerCase()} job can't be completed`,
          code: "INVALID_TRANSITION",
          allowed: allowedTransitions(job.status).map((status) => ({
            value: status,
            label: WORK_ORDER_STATUS_LABELS[status],
          })),
        },
        { status: 409 },
      );
    }

    if (outcome === "SAME") {
      return successResponse({
        ...job,
        allowedTransitions: allowedTransitions(job.status),
        transitioned: false,
        completionPercent: completionPercent(job.items),
        invoiceBlockers: workOrderInvoiceBlockers(job),
      });
    }

    // A client who signed through the /s/<token> link has already said the work
    // is done, and their word beats the crew's — so it counts as the signature
    // the checklist is asking for.
    const progress = new Map(
      (data.itemProgress ?? []).map((item) => [item.id, item.completedQuantity]),
    );
    const signedBy = data.signedByName ?? job.signedByName ?? job.signOffName;
    const blockers = completionBlockers({
      items: job.items.map((item) => ({
        quantity: item.quantity,
        completedQuantity: progress.get(item.id) ?? item.completedQuantity,
      })),
      signedByName: signedBy,
    });
    if (blockers.length > 0) {
      return NextResponse.json(
        { error: "This job isn't ready to close", code: "NOT_COMPLETE", blockers },
        { status: 409 },
      );
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      for (const item of data.itemProgress ?? []) {
        await tx.crmWorkOrderItem.updateMany({
          where: { id: item.id, workOrderId: id },
          data: { completedQuantity: item.completedQuantity },
        });
      }

      return tx.crmWorkOrder.update({
        where: { id },
        data: {
          status: "COMPLETED",
          completedAt: now,
          // A job that ran straight through without anyone tapping Start still
          // took time; recording the close as the start is less wrong than null.
          startedAt: job.startedAt ?? now,
          blockedReason: null,
          completionNotes: data.completionNotes,
          // Whichever name the check above accepted, not only the one typed in
          // this request: a job closed on the strength of a client's own
          // sign-off was recording no signature at all, so the page that says
          // "Signed off by" had nothing to show and the dispute it exists to
          // settle had no record after all.
          signedByName: signedBy,
          signatureUrl: data.signatureUrl,
          // When they signed, not when the office got round to closing it.
          signedAt: signedBy ? (job.signedAt ?? job.signOffAt ?? now) : undefined,
          customerRating: data.customerRating,
        },
        include: {
          items: { orderBy: { position: "asc" } },
          assignedTo: { select: { id: true, name: true } },
        },
      });
    });

    const refs = jobRecordRefs(job);
    await recordJobActivity(prisma, {
      companyId,
      userId: session.user.id,
      job,
      refs,
      subject: `Work order ${job.workOrderNo}: completed`,
      body: data.completionNotes ?? null,
      metadata: {
        status: "COMPLETED",
        signedByName: signedBy ?? null,
        customerRating: data.customerRating ?? job.customerRating ?? null,
      },
      occurredAt: now,
    });

    // Handed back so the record page can offer "Raise the invoice" — or say why
    // it can't — without a second round trip.
    return successResponse({
      ...updated,
      allowedTransitions: allowedTransitions(updated.status),
      transitioned: true,
      completionPercent: completionPercent(updated.items),
      invoiceBlockers: workOrderInvoiceBlockers({ ...updated, dealId: job.dealId }),
    });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/work-orders/[id]/complete error:", error);
    return errorResponse("Failed to complete the job");
  }
}
