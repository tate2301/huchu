/**
 * One requisition, and every move it can make.
 *
 * All the moves go through one PATCH with a named action rather than a route
 * each, so the state machine is enforced in one place. A separate
 * `/disburse` route that forgot to check the current status is exactly the bug
 * that lets the same requisition be paid twice.
 *
 * Who may do what:
 *   submit, cancel   the requester, on their own request
 *   approve, reject  `money.approve`
 *   disburse         `money.disburse` — deliberately a separate permission,
 *                    because saying yes and handing over cash should be two
 *                    people wherever a business is big enough for it to be
 *   acquit           the requester, accounting for what they spent — at the
 *                    figure their reported spend lines come to, never a
 *                    typed one
 *
 * Reading one is the requester's business, the business of whoever approves
 * or pays out money, and the project owner's: somebody's float is in these
 * figures, and a colleague is not owed a look at it.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  RequisitionTransitionError,
  acquitSchema,
  assertTransition,
  decideAcquittal,
  decisionSchema,
  disburseSchema,
  payableAmount,
  type RequisitionStatus,
} from "@/lib/crm/requisitions";
import { emitCrmNotification } from "@/lib/notifications";
import {
  postRequisitionAcquittalVariance,
  postRequisitionDisbursement,
} from "@/lib/crm/money-posting";
import { requireCrmCapability } from "../../_helpers";
import { notifyApprovers } from "../_shared";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;
    const { id } = await params;

    const requisition = await prisma.crmRequisition.findFirst({
      where: { id, companyId },
      include: {
        project: { select: { id: true, name: true, projectNo: true, managerId: true } },
        requestedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        disbursedBy: { select: { id: true, name: true } },
        receiptsWaivedBy: { select: { id: true, name: true } },
        bankAccount: { select: { id: true, name: true } },
        costEntries: {
          orderBy: [{ log: { logDate: "asc" } }, { createdAt: "asc" }],
          include: {
            log: { select: { logDate: true, user: { select: { id: true, name: true } } } },
            project: { select: { id: true, name: true, projectNo: true } },
          },
        },
      },
    });
    if (!requisition) return errorResponse("Requisition not found", 404);

    const isRequester = requisition.requestedById === session.user.id;
    const [mayApprove, mayDisburse] = await Promise.all([
      requireCrmCapability(session, "money.approve"),
      requireCrmCapability(session, "money.disburse"),
    ]);
    const ownsProject = requisition.project?.managerId === session.user.id;
    if (!isRequester && !mayApprove && !mayDisburse && !ownsProject) {
      return errorResponse("Requisition not found", 404);
    }

    // What the page may offer is decided here, from the same rules the PATCH
    // enforces, so a button is never drawn for a move the server refuses.
    return successResponse({
      requisition,
      permissions: { isRequester, mayApprove, mayDisburse },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/requisitions/[id] error:", error);
    return errorResponse("Failed to load the requisition");
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit") }),
  z.object({ action: z.literal("cancel"), reason: z.string().trim().max(1000).optional() }),
  decisionSchema.extend({ action: z.literal("decide") }),
  disburseSchema.extend({ action: z.literal("disburse") }),
  acquitSchema.extend({ action: z.literal("acquit") }),
]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;
    const { id } = await params;

    const existing = await prisma.crmRequisition.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        status: true,
        requestedById: true,
        requisitionNo: true,
        purpose: true,
        currency: true,
        amount: true,
        approvedAmount: true,
      },
    });
    if (!existing) return errorResponse("Requisition not found", 404);

    const body = actionSchema.parse(await request.json());
    const from = existing.status as RequisitionStatus;
    const isRequester = existing.requestedById === session.user.id;
    const now = new Date();

    switch (body.action) {
      case "submit": {
        if (!isRequester) return errorResponse("Only the requester can submit this", 403);
        assertTransition(from, "SUBMITTED");
        const requisition = await prisma.crmRequisition.update({
          where: { id },
          data: { status: "SUBMITTED", submittedAt: now },
        });
        await notifyApprovers(companyId, session.user.id, requisition);
        return successResponse({ requisition });
      }

      case "cancel": {
        // An approver may cancel somebody else's request; a requester may
        // always withdraw their own.
        if (!isRequester && !(await requireCrmCapability(session, "money.approve"))) {
          return errorResponse("You cannot cancel this requisition", 403);
        }
        assertTransition(from, "CANCELLED");
        const requisition = await prisma.crmRequisition.update({
          where: { id },
          data: {
            status: "CANCELLED",
            ...(body.reason ? { decisionNote: body.reason } : {}),
          },
        });
        return successResponse({ requisition });
      }

      case "decide": {
        if (!(await requireCrmCapability(session, "money.approve"))) {
          return errorResponse("You cannot approve requisitions", 403);
        }
        // Approving your own request is the oldest hole in an expenses
        // system, and it is closed here rather than in the UI.
        if (isRequester) {
          return errorResponse("Somebody else has to approve your own request", 403);
        }
        const to = body.approve ? "APPROVED" : "REJECTED";
        assertTransition(from, to);
        const requisition = await prisma.crmRequisition.update({
          where: { id },
          data: {
            status: to,
            approvedById: session.user.id,
            approvedAt: now,
            approvedAmount: body.approve ? body.approvedAmount ?? null : null,
            decisionNote: body.decisionNote ?? null,
          },
        });
        await emitCrmNotification({
          companyId,
          recipientIds: [existing.requestedById],
          type: "CRM_REQUISITION_DECIDED",
          title: `${existing.requisitionNo} ${body.approve ? "approved" : "declined"}`,
          summary: body.approve
            ? `${requisition.currency} ${payableAmount(requisition).toFixed(2)} approved.`
            : body.decisionNote ?? existing.purpose,
          entityType: "CRM_REQUISITION",
          entityId: id,
          viewPath: `/crm/requisitions/${id}`,
          severity: body.approve ? "INFO" : "WARNING",
        });
        return successResponse({ requisition });
      }

      case "disburse": {
        if (!(await requireCrmCapability(session, "money.disburse"))) {
          return errorResponse("You cannot pay out requisitions", 403);
        }
        assertTransition(from, "DISBURSED");
        if (body.bankAccountId) {
          const account = await prisma.bankAccount.findFirst({
            where: { id: body.bankAccountId, companyId },
            select: { id: true },
          });
          if (!account) return errorResponse("Bank account not found", 404);
        }
        const requisition = await prisma.crmRequisition.update({
          where: { id },
          data: {
            status: "DISBURSED",
            disbursedById: session.user.id,
            disbursedAt: body.disbursedAt ?? now,
            bankAccountId: body.bankAccountId ?? null,
          },
        });
        // The money has left the business, so the ledger hears about it now.
        // Best-effort: a disbursement that refuses to record itself because
        // posting failed leaves the cash gone and the CRM saying it never went.
        try {
          await postRequisitionDisbursement(companyId, requisition, session.user.id);
        } catch (error) {
          console.error("[API] requisition disbursement posting failed:", error);
        }

        await emitCrmNotification({
          companyId,
          recipientIds: [existing.requestedById],
          type: "CRM_REQUISITION_DECIDED",
          title: `${existing.requisitionNo} paid out`,
          summary: `${requisition.currency} ${payableAmount(requisition).toFixed(2)}. Report what you spend on it, with the receipts.`,
          entityType: "CRM_REQUISITION",
          entityId: id,
          viewPath: `/crm/requisitions/${id}`,
        });
        return successResponse({ requisition });
      }

      case "acquit": {
        if (!isRequester && !(await requireCrmCapability(session, "money.disburse"))) {
          return errorResponse("Only the requester can account for this money", 403);
        }
        assertTransition(from, "ACQUITTED");

        // The figure is what the report adds up to, read now rather than sent
        // by the page — a total computed in a browser is a total somebody can
        // edit on the way to the server.
        const lines = await prisma.crmDailyCostEntry.findMany({
          where: { companyId, requisitionId: id },
          select: { direction: true, amount: true, receiptUrl: true },
        });
        const decision = decideAcquittal({
          lines,
          actor: {
            id: session.user.id,
            isRequester,
            mayWaive: body.waiveMissingReceipts
              ? await requireCrmCapability(session, "money.approve")
              : false,
          },
          waiveMissingReceipts: body.waiveMissingReceipts,
          waiverNote: body.waiverNote,
        });
        if (!decision.ok) {
          return NextResponse.json(
            { error: decision.message, code: decision.code },
            { status: decision.status },
          );
        }

        const requisition = await prisma.crmRequisition.update({
          where: { id },
          data: {
            status: "ACQUITTED",
            acquittedAt: now,
            acquittedAmount: decision.acquittedAmount,
            ...(decision.waiver ?? {}),
          },
        });

        // Only the difference: the whole amount was expensed when it was paid
        // out, so an acquittal that agrees with the disbursement has nothing
        // to say to the ledger.
        let variance: Awaited<ReturnType<typeof postRequisitionAcquittalVariance>> | null = null;
        try {
          variance = await postRequisitionAcquittalVariance(
            companyId,
            requisition,
            session.user.id,
          );
        } catch (error) {
          console.error("[API] requisition acquittal posting failed:", error);
        }

        return successResponse({ requisition, variance });
      }
    }
  } catch (error) {
    if (error instanceof RequisitionTransitionError) {
      return errorResponse(error.message, 409);
    }
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/crm/requisitions/[id] error:", error);
    return errorResponse("Failed to update the requisition");
  }
}
