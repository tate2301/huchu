import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { booksActor } from "@/lib/books/core";
import { decideApproval, moneyLimits, otherOwners, othersWhoCan } from "@/lib/books/core/approvals";
import { recordRequisitionDecision } from "@/lib/books/core/requisitions";
import { canUser } from "@/lib/crm/permissions";
import { RequisitionTransitionError, assertTransition, payableAmount, type RequisitionStatus } from "@/lib/crm/requisitions";
import { emitCrmNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

/**
 * Approve or reject one of the CRM's requisitions (`siteId: null`), the one
 * way the CRM's route and Books' Requisitions both do it (books-final §4.11,
 * §2.4): `money.approve`, never on your own request, and over the limit it
 * was asked under only the owner; written to ApprovalAction, and the
 * requester told.
 */
export class RequisitionDecisionRefused extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404 | 409 = 403,
  ) {
    super(message);
    this.name = "RequisitionDecisionRefused";
  }
}

export async function decideCrmRequisition(
  session: AuthenticatedSession,
  id: string,
  input: { approve: boolean; approvedAmount?: number | null; decisionNote?: string | null },
  now = new Date(),
) {
  const { companyId } = session.user;
  const existing = await prisma.crmRequisition.findFirst({ where: { id, companyId, siteId: null } });
  if (!existing) throw new RequisitionDecisionRefused("Requisition not found", 404);
  const from = existing.status as RequisitionStatus;
  const to = input.approve ? "APPROVED" : "REJECTED";
  assertTransition(from, to);
  const actor = await booksActor(session);
  const limits = await moneyLimits(companyId);
  // Approving your own request is the oldest hole in an expenses system, and
  // it is closed here rather than in the UI. Over the limit asked under, only
  // the owner says yes.
  const decision = decideApproval(
    actor,
    {
      kind: "requisition",
      module: "crm",
      requestedById: existing.requestedById,
      amount: Number(payableAmount(existing)),
      limit: existing.approvalLimit != null ? Number(existing.approvalLimit) : limits.requisitionOwnerOver,
      currency: existing.currency,
    },
    {
      othersWhoCanApprove: await othersWhoCan(prisma, companyId, { module: "crm", except: [existing.requestedById] }),
      otherOwners: await otherOwners(prisma, companyId, [existing.requestedById]),
      ownerName: limits.ownerApprover?.name ?? null,
      roleAllowed: await canUser(session, "money.approve"),
    },
  );
  if (!decision.allowed) throw new RequisitionDecisionRefused(decision.reason, 403);
  const requisition = await prisma.$transaction(async (tx) => {
    const moved = await tx.crmRequisition.updateMany({
      where: { id, status: "SUBMITTED" },
      data: {
        status: to,
        approvedById: session.user.id,
        approvedAt: now,
        approvedAmount: input.approve ? (input.approvedAmount ?? null) : null,
        decisionNote: input.decisionNote ?? null,
      },
    });
    if (moved.count === 0) throw new RequisitionTransitionError(from, to);
    await recordRequisitionDecision(tx, { companyId, id, approve: input.approve, actorId: session.user.id, decision, note: input.decisionNote });
    return tx.crmRequisition.findUniqueOrThrow({ where: { id } });
  });
  await emitCrmNotification({
    actorId: session.user.id,
    companyId,
    recipientIds: [existing.requestedById],
    type: "CRM_REQUISITION_DECIDED",
    title: `${existing.requisitionNo ?? "Requisition"} ${input.approve ? "approved" : "declined"}`,
    summary: input.approve ? `${requisition.currency} ${payableAmount(requisition).toFixed(2)} approved.` : (input.decisionNote ?? existing.purpose),
    entityType: "CRM_REQUISITION",
    entityId: id,
    viewPath: `/crm/requisitions/${id}`,
    severity: input.approve ? "INFO" : "WARNING",
  });
  return requisition;
}
