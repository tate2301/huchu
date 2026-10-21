/**
 * One requisition, and every move it can make.
 *
 * All the moves go through one PATCH with a named action rather than a route
 * each, so the state machine is enforced in one place. A separate
 * `/disburse` route that forgot to check the current status is exactly the bug
 * that lets the same requisition be paid twice.
 *
 * The CRM's requisitions only (`siteId: null`): a shop's requisitions belong to
 * retail's buying, and these routes never act on one. Both move through the
 * same Books core (`lib/books/core/requisitions.ts`, books-final §4.11):
 *
 *   submit           the requester: Send for approval, numbered then, with the
 *                    owner limit and who it waits for as they are now
 *   cancel           the requester, or an approver
 *   decide           `money.approve`, never on your own request, and over the
 *                    limit only the owner (§2.4); written to ApprovalAction
 *   disburse         `money.disburse`, never your own request, and not the
 *                    approver where somebody else may pay. Dr 1150 Cash
 *                    advances, Cr the money account chosen
 *   acquit           the requester (or a disburser), at the figure the spend
 *                    lines come to, never a typed one: each category's expense
 *                    out of 1150, the change back, or the overspend paid
 *   reverse-payout   the owner, or someone the owner let void: the payout's
 *                    mirror, back to Approved
 *   reopen           the same: the acquittal's mirror, back to Paid out
 *
 * Reading one is the requester's business, the business of whoever approves,
 * pays out or oversees money, and the project owner's: somebody's float is in
 * these figures, and a colleague is not owed a look at it.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
import { booksActor, canDo, VoidRefused } from "@/lib/books/core";
import { approvalNote, approvedByOwner, decidePayment, moneyLimits, othersWhoCan, recordApproval } from "@/lib/books/core/approvals";
import {
  postRequisitionAcquittal,
  postRequisitionDisbursement,
  sendRequisitionForApproval,
  voidRequisitionAcquittal,
  voidRequisitionDisbursement,
} from "@/lib/books/core/requisitions";
import { decideCrmRequisition, RequisitionDecisionRefused } from "@/lib/crm/requisition-decide";
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
      where: { id, companyId, siteId: null },
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
    const [mayApprove, mayDisburse, mayViewAll] = await Promise.all([
      requireCrmCapability(session, "money.approve"),
      requireCrmCapability(session, "money.disburse"),
      requireCrmCapability(session, "money.view_all"),
    ]);
    const ownsProject = requisition.project?.managerId === session.user.id;
    if (!isRequester && !mayApprove && !mayDisburse && !mayViewAll && !ownsProject) {
      return errorResponse("Requisition not found", 404);
    }

    // What the page may offer is decided here, from the same rules the PATCH
    // enforces, so a button is never drawn for a move the server refuses.
    return successResponse({
      requisition,
      permissions: { isRequester, mayApprove: mayApprove && !isRequester, mayDisburse: mayDisburse && !isRequester },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/requisitions/[id] error:", error);
    return errorResponse("Failed to load the requisition");
  }
}

const undoSchema = z.object({ reason: z.string().trim().min(3).max(300) });

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit") }),
  z.object({ action: z.literal("cancel"), reason: z.string().trim().max(1000).optional() }),
  decisionSchema.extend({ action: z.literal("decide") }),
  disburseSchema.extend({ action: z.literal("disburse") }),
  acquitSchema.extend({ action: z.literal("acquit"), changeAccountId: z.string().uuid().nullable().optional() }),
  undoSchema.extend({ action: z.literal("reverse-payout") }),
  undoSchema.extend({ action: z.literal("reopen") }),
]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;
    const { id } = await params;

    // The CRM's own requisitions only: a shop's are retail's to move.
    const existing = await prisma.crmRequisition.findFirst({ where: { id, companyId, siteId: null } });
    if (!existing) return errorResponse("Requisition not found", 404);

    const body = actionSchema.parse(await request.json());
    const from = existing.status as RequisitionStatus;
    const isRequester = existing.requestedById === session.user.id;
    const actor = await booksActor(session);
    const by = { userId: session.user.id, role: session.user.role };
    const now = new Date();

    switch (body.action) {
      case "submit": {
        if (!isRequester) return errorResponse("Only the requester can submit this", 403);
        assertTransition(from, "SUBMITTED");
        const requisition = await prisma.$transaction(async (tx) => {
          const sent = await sendRequisitionForApproval(tx, {
            companyId,
            id,
            requisitionNo: existing.requisitionNo,
            amount: existing.amount,
            actorId: session.user.id,
            at: now,
          });
          const moved = await tx.crmRequisition.updateMany({
            where: { id, status: "DRAFT" },
            data: { status: "SUBMITTED", submittedAt: now, requisitionNo: sent.requisitionNo, approvalLimit: sent.approvalLimit, approverId: sent.approverId },
          });
          if (moved.count === 0) throw new RequisitionTransitionError(from, "SUBMITTED");
          return tx.crmRequisition.findUniqueOrThrow({ where: { id } });
        });
        await notifyApprovers(companyId, session.user.id, { ...requisition, requisitionNo: requisition.requisitionNo ?? "Requisition" });
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
            cancelledAt: now,
            cancelledById: session.user.id,
            ...(body.reason ? { decisionNote: body.reason } : {}),
          },
        });
        return successResponse({ requisition });
      }

      case "decide": {
        try {
          const requisition = await decideCrmRequisition(session, id, { approve: body.approve, approvedAmount: body.approvedAmount, decisionNote: body.decisionNote }, now);
          return successResponse({ requisition });
        } catch (error) {
          if (error instanceof RequisitionDecisionRefused) return errorResponse(error.message, error.status);
          throw error;
        }
      }

      case "disburse": {
        assertTransition(from, "DISBURSED");
        const limits = await moneyLimits(companyId);
        // Saying yes and handing over cash are two people wherever there are
        // two people who may pay; nobody pays out their own request.
        const decision = decidePayment(
          actor,
          {
            kind: "requisition",
            module: "crm",
            requestedById: existing.requestedById,
            approvedById: existing.approvedById,
            ownerApproved: await approvedByOwner(prisma, companyId, existing.approvedById),
            amount: Number(payableAmount(existing)),
            limit: existing.approvalLimit != null ? Number(existing.approvalLimit) : limits.requisitionOwnerOver,
            currency: existing.currency,
          },
          {
            othersWhoCanPay: await othersWhoCan(prisma, companyId, { module: "crm", except: [session.user.id, existing.requestedById] }),
            roleAllowed: await requireCrmCapability(session, "money.disburse"),
          },
        );
        if (!decision.allowed) return errorResponse(decision.reason, 403);
        if (body.bankAccountId) {
          const account = await prisma.bankAccount.findFirst({
            where: { id: body.bankAccountId, companyId },
            select: { id: true },
          });
          if (!account) return errorResponse("Bank account not found", 404);
        }
        const requisition = await prisma.$transaction(async (tx) => {
          const moved = await tx.crmRequisition.updateMany({
            where: { id, status: "APPROVED" },
            data: {
              status: "DISBURSED",
              disbursedById: session.user.id,
              disbursedAt: body.disbursedAt ?? now,
              bankAccountId: body.bankAccountId ?? null,
              paidAmount: payableAmount(existing),
            },
          });
          if (moved.count === 0) throw new RequisitionTransitionError(from, "DISBURSED");
          const note = approvalNote(decision);
          if (note) await recordApproval(tx, { companyId, kind: "requisition", entityId: id, action: "ADJUST", from: "APPROVED", to: "DISBURSED", actedById: session.user.id, note });
          return tx.crmRequisition.findUniqueOrThrow({ where: { id } });
        });
        // The money has left the business, so the ledger hears about it now.
        // Best-effort: what cannot post waits for the drain and Needs posting.
        try {
          await postRequisitionDisbursement(prisma, requisition, by);
        } catch (error) {
          console.error("[API] requisition disbursement posting failed:", error);
        }

        await emitCrmNotification({
          actorId: session.user.id,
          companyId,
          recipientIds: [existing.requestedById],
          type: "CRM_REQUISITION_DECIDED",
          title: `${existing.requisitionNo ?? "Requisition"} paid out`,
          summary: `${requisition.currency} ${payableAmount(requisition).toFixed(2)}. Report what you spend on it, with the receipts.`,
          entityType: "CRM_REQUISITION",
          entityId: id,
          viewPath: `/books/requisitions/${id}`,
        });
        return successResponse({ requisition });
      }

      case "acquit": {
        if (!isRequester && !(await requireCrmCapability(session, "money.disburse"))) {
          return errorResponse("Only the requester can account for this money", 403);
        }
        assertTransition(from, "ACQUITTED");
        if (body.changeAccountId) {
          const account = await prisma.bankAccount.findFirst({ where: { id: body.changeAccountId, companyId }, select: { id: true } });
          if (!account) return errorResponse("Bank account not found", 404);
        }

        // The figure is what the report adds up to, read now rather than sent
        // by the page — a total computed in a browser is a total somebody can
        // edit on the way to the server.
        const lines = await prisma.crmDailyCostEntry.findMany({
          where: { companyId, requisitionId: id },
          select: { direction: true, amount: true, receiptUrl: true, category: true, project: { select: { costCenterId: true } } },
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

        const paid = new Prisma.Decimal(existing.paidAmount ?? payableAmount(existing));
        const change = Prisma.Decimal.max(paid.minus(decision.acquittedAmount), 0);
        const topUp = Prisma.Decimal.max(decision.acquittedAmount.minus(paid), 0);
        const requisition = await prisma.$transaction(async (tx) => {
          const moved = await tx.crmRequisition.updateMany({
            where: { id, status: "DISBURSED" },
            data: {
              status: "ACQUITTED",
              acquittedAt: now,
              acquittedById: session.user.id,
              acquittedAmount: decision.acquittedAmount,
              changeAmount: change,
              changeAccountId: change.greaterThan(0) ? (body.changeAccountId ?? existing.bankAccountId) : null,
              ...(decision.waiver ?? {}),
            },
          });
          if (moved.count === 0) throw new RequisitionTransitionError(from, "ACQUITTED");
          return tx.crmRequisition.findUniqueOrThrow({ where: { id } });
        });

        // Each category's spend out of the advance; the change back, or the overspend paid.
        let posting: Awaited<ReturnType<typeof postRequisitionAcquittal>> | null = null;
        try {
          posting = await postRequisitionAcquittal(prisma, requisition, {
            spend: lines
              .filter((line) => line.direction === "SPENT")
              .map((line) => ({ category: line.category, amount: line.amount, costCenterId: line.project?.costCenterId ?? null })),
            change,
            topUp,
            changeAccountId: body.changeAccountId ?? null,
            actor: by,
          });
        } catch (error) {
          console.error("[API] requisition acquittal posting failed:", error);
        }

        return successResponse({
          requisition,
          variance: change.greaterThan(0) ? { posted: "REFUND", amount: change } : topUp.greaterThan(0) ? { posted: "TOPUP", amount: topUp } : { posted: null, amount: new Prisma.Decimal(0) },
          posting: posting ? { spend: posting.spend, change: posting.change, topUp: posting.topUp } : null,
        });
      }

      case "reverse-payout": {
        if (from !== "DISBURSED") return errorResponse(`Only a requisition that is paid out and not yet accounted for can have its payout reversed.`, 409);
        const allowed = canDo(actor, "void", { kind: "requisition", module: "crm" });
        if (!allowed.allowed) return errorResponse(allowed.reason, 403);
        await voidRequisitionDisbursement({ companyId, requisition: existing, reason: body.reason, actor });
        const requisition = await prisma.crmRequisition.update({
          where: { id },
          data: { status: "APPROVED", disbursedAt: null, disbursedById: null, bankAccountId: null, paidAmount: null },
        });
        return successResponse({ requisition });
      }

      case "reopen": {
        if (from !== "ACQUITTED") return errorResponse("Only a requisition that has been accounted for can be reopened.", 409);
        const allowed = canDo(actor, "void", { kind: "requisition", module: "crm" });
        if (!allowed.allowed) return errorResponse(allowed.reason, 403);
        await voidRequisitionAcquittal({ companyId, requisitionId: id, reason: body.reason, actor });
        const requisition = await prisma.crmRequisition.update({
          where: { id },
          data: { status: "DISBURSED", acquittedAt: null, acquittedById: null, acquittedAmount: null, changeAmount: null, changeAccountId: null },
        });
        return successResponse({ requisition });
      }
    }
  } catch (error) {
    if (error instanceof RequisitionTransitionError) {
      return errorResponse(error.message, 409);
    }
    if (error instanceof VoidRefused) return errorResponse(error.message, error.status);
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/crm/requisitions/[id] error:", error);
    return errorResponse("Failed to update the requisition");
  }
}
