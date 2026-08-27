import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { canEditRecord } from "@/lib/crm/permissions";
import {
  WORK_ORDER_STATUS_LABELS,
  allowedTransitions,
  canTransition,
  checklistEditRefusal,
  completionBlockers,
  completionPercent,
  isOverdueToStart,
  readInvoiceLink,
  updateWorkOrderSchema,
  workOrderInvoiceBlockers,
} from "@/lib/crm/work-orders";
import { isCompanyUser } from "../../_helpers";
import { jobRecordRefs, recordJobActivity } from "../_shared";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const order = await prisma.crmWorkOrder.findFirst({
      where: { id, companyId: session.user.companyId },
      include: {
        items: { orderBy: { position: "asc" } },
        assignedTo: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        site: { select: { id: true, name: true, addressLine: true, accessInstructions: true } },
        deal: { select: { id: true, dealNo: true, title: true } },
      },
    });
    if (!order) return errorResponse("Work order not found", 404);

    // Everything the job's page decides what to offer from: how far through it
    // is, whether it can be closed, whether it can be billed, and the invoice
    // it already produced. Working any of that out client-side would put the
    // rules in two places and let them disagree.
    return successResponse({
      ...order,
      allowedTransitions: allowedTransitions(order.status),
      completionPercent: completionPercent(order.items),
      completionBlockers: completionBlockers({
        items: order.items,
        signedByName: order.signedByName ?? order.signOffName,
      }),
      invoiceBlockers: workOrderInvoiceBlockers(order),
      invoice: readInvoiceLink(order.customFields),
      isOverdue: isOverdueToStart(order),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/work-orders/[id] error:", error);
    return errorResponse("Failed to fetch the work order");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    const existing = await prisma.crmWorkOrder.findFirst({
      where: { id, companyId },
      include: {
        items: true,
        // Read for their company, so the trail this leaves reaches the record
        // paying for the job even when the job itself names only a site.
        deal: { select: { clientId: true } },
        site: { select: { clientId: true } },
      },
    });
    if (!existing) return errorResponse("Work order not found", 404);

    // The crew on the job can update it; so can whoever it's assigned to.
    const onCrew = existing.crewIds.includes(session.user.id);
    if (!onCrew && !await canEditRecord(session, existing.assignedToId)) {
      return errorResponse("You're not on this job", 403);
    }

    const data = updateWorkOrderSchema.parse(await request.json());

    if (!(await isCompanyUser(companyId, data.assignedToId))) {
      return errorResponse("Invalid assignee", 400);
    }

    // The deal is what a finished job is billed against, so it can be attached
    // after the fact — a callout logged against a site alone was otherwise
    // unbillable forever. Checked for this tenant the way the create route
    // checks it, and its company is taken on where the job names none.
    let deal: { id: string; clientId: string | null } | null = null;
    if (data.dealId) {
      deal = await prisma.crmDeal.findFirst({
        where: { id: data.dealId, companyId },
        select: { id: true, clientId: true },
      });
      if (!deal) return errorResponse("Invalid deal", 400);

      // A job that already belongs to one customer cannot be moved onto
      // another customer's deal. The job would keep its own `clientId`, so
      // that customer's Jobs tab would go on claiming the work while the
      // invoice route billed the deal's customer instead — two records
      // disagreeing about who owes the money.
      //
      // Refused rather than quietly reassigned: moving the customer would
      // re-attribute a history somebody else filed, and if the job is already
      // invoiced it would move it away from the invoice. Whoever meant to do
      // this wants a new job on the right deal.
      if (
        existing.clientId &&
        deal.clientId &&
        deal.clientId !== existing.clientId
      ) {
        return NextResponse.json(
          {
            error: "That deal belongs to a different customer",
            code: "DEAL_CUSTOMER_MISMATCH",
          },
          { status: 409 },
        );
      }
    }

    // Replacing the lines mid-job would throw away the crew's ticks, so the
    // request is refused with the reason rather than accepted and ignored —
    // silently dropping half a request is how a page ends up showing a
    // checklist nobody can explain.
    if (data.items) {
      const refusal = checklistEditRefusal(existing.status);
      if (refusal) {
        return NextResponse.json(
          { error: refusal, code: "CHECKLIST_LOCKED" },
          { status: 409 },
        );
      }
    }

    if (data.status && data.status !== existing.status) {
      if (!canTransition(existing.status, data.status)) {
        return NextResponse.json(
          {
            error: `A ${WORK_ORDER_STATUS_LABELS[existing.status].toLowerCase()} job can't move to ${WORK_ORDER_STATUS_LABELS[data.status].toLowerCase()}`,
            code: "INVALID_TRANSITION",
            allowed: allowedTransitions(existing.status).map((status) => ({
              value: status,
              label: WORK_ORDER_STATUS_LABELS[status],
            })),
          },
          { status: 409 },
        );
      }

      if (data.status === "COMPLETED") {
        // Progress and signature may arrive in the same request as the
        // completion, so the check runs against what things will be.
        const progress = new Map(
          (data.itemProgress ?? []).map((item) => [item.id, item.completedQuantity]),
        );
        const blockers = completionBlockers({
          items: existing.items.map((item) => ({
            quantity: item.quantity,
            completedQuantity: progress.get(item.id) ?? item.completedQuantity,
          })),
          signedByName: data.signedByName ?? existing.signedByName,
        });
        if (blockers.length > 0) {
          return NextResponse.json(
            { error: "This job isn't ready to close", code: "NOT_COMPLETE", blockers },
            { status: 409 },
          );
        }
      }

      if (data.status === "BLOCKED" && !data.blockedReason?.trim()) {
        return errorResponse("Say why it's blocked — that's the useful part", 400);
      }
    }

    const now = new Date();
    const order = await prisma.$transaction(async (tx) => {
      if (data.itemProgress?.length) {
        for (const item of data.itemProgress) {
          await tx.crmWorkOrderItem.updateMany({
            where: { id: item.id, workOrderId: id },
            data: { completedQuantity: item.completedQuantity },
          });
        }
      }

      // Items are replaced wholesale when a new list is sent. Whether that is
      // allowed at all was settled above, by `checklistEditRefusal`.
      if (data.items) {
        await tx.crmWorkOrderItem.deleteMany({ where: { workOrderId: id } });
        if (data.items.length) {
          await tx.crmWorkOrderItem.createMany({
            data: data.items.map((item, index) => ({
              companyId,
              workOrderId: id,
              position: index,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit ?? undefined,
              productId: item.productId ?? undefined,
              notes: item.notes ?? undefined,
            })),
          });
        }
      }

      return tx.crmWorkOrder.update({
        where: { id },
        data: {
          title: data.title,
          description: data.description,
          status: data.status,
          priority: data.priority,
          dealId: data.dealId,
          // Naming the deal answers "who is paying" too, so a job that never
          // had a company takes the deal's rather than staying unattached. A
          // job that already names one keeps it, which is safe because the
          // check above has refused any deal that would disagree.
          clientId: existing.clientId ? undefined : deal?.clientId,
          scheduledStart: data.scheduledStart ? new Date(data.scheduledStart) : undefined,
          scheduledEnd: data.scheduledEnd ? new Date(data.scheduledEnd) : undefined,
          assignedToId: data.assignedToId,
          crewIds: data.crewIds,
          addressLine: data.addressLine,
          accessNotes: data.accessNotes,
          contactName: data.contactName,
          contactPhone: data.contactPhone,
          blockedReason:
            data.status && data.status !== "BLOCKED" ? null : data.blockedReason,
          completionNotes: data.completionNotes,
          signedByName: data.signedByName,
          signatureUrl: data.signatureUrl,
          signedAt: data.signedByName ? now : undefined,
          customerRating: data.customerRating,
          startedAt:
            data.status === "IN_PROGRESS" && !existing.startedAt ? now : undefined,
          completedAt: data.status === "COMPLETED" ? now : undefined,
        },
        include: {
          items: { orderBy: { position: "asc" } },
          assignedTo: { select: { id: true, name: true } },
        },
      });
    });

    // Against the deal it has just been attached to, not the one it had —
    // otherwise the news lands nowhere anybody would look for it.
    if (deal && deal.id !== existing.dealId) {
      await recordJobActivity(prisma, {
        companyId,
        userId: session.user.id,
        job: existing,
        refs: jobRecordRefs({ ...existing, dealId: deal.id, deal }),
        subject: `Work order ${existing.workOrderNo} attached to this deal`,
        metadata: { status: order.status },
        occurredAt: now,
      });
    }

    if (data.status && data.status !== existing.status) {
      await recordJobActivity(prisma, {
        companyId,
        userId: session.user.id,
        job: existing,
        refs: jobRecordRefs(existing),
        subject: `Work order ${existing.workOrderNo}: ${WORK_ORDER_STATUS_LABELS[data.status].toLowerCase()}`,
        body: data.status === "BLOCKED" ? data.blockedReason : data.completionNotes,
        metadata: { status: data.status },
        occurredAt: now,
      });
    }

    return successResponse({ ...order, allowedTransitions: allowedTransitions(order.status) });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/work-orders/[id] error:", error);
    return errorResponse("Failed to update the work order");
  }
}
