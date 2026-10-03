import type { CrmRequisition, Prisma } from "@prisma/client";
import { z } from "zod";

import { postRequisitionDisbursement } from "@/lib/crm/money-posting";
import { assertTransition, payableAmount, RequisitionTransitionError, type RequisitionStatus } from "@/lib/crm/requisitions";
import { reserveIdentifier } from "@/lib/id-generator";
import { emitRetailNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { canRetailRoleDo } from "@/lib/retail/permissions";
import { RETAIL_REQUISITION_CATEGORIES, type RetailRequisitionCategory } from "@/lib/retail/requisition-words";

/**
 * Requisitions in a shop: somebody needs money to spend on the shop, a
 * manager says yes or no, and the money is paid out.
 *
 * The same `CrmRequisition` row, state machine and ledger posting the CRM
 * uses — one way of asking for money in the business, not two. What makes a
 * requisition a shop's is its `siteId`. Retail stops at paid: a shop's
 * requisition is a purchase with its receipt in hand, not a float a field
 * worker accounts for later, so there is no acquittal here.
 */

export { RETAIL_REQUISITION_CATEGORIES, type RetailRequisitionCategory } from "@/lib/retail/requisition-words";

const categories = Object.keys(RETAIL_REQUISITION_CATEGORIES) as [RetailRequisitionCategory, ...RetailRequisitionCategory[]];

export const retailRequisitionInput = z.object({
  siteId: z.string().uuid(),
  category: z.enum(categories),
  purpose: z.string().trim().min(1, "Say what the money is for").max(500),
  notes: z.string().trim().max(2000).nullable().optional(),
  amount: z.number().finite().positive().max(1_000_000),
  neededBy: z.coerce.date().nullable().optional(),
  /** Send it to a manager now rather than keeping it as a draft. */
  submit: z.boolean().optional(),
});

export const retailRequisitionAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit") }),
  z.object({ action: z.literal("cancel"), reason: z.string().trim().max(500).nullable().optional() }),
  z.object({
    action: z.literal("decide"),
    approve: z.boolean(),
    approvedAmount: z.number().finite().positive().nullable().optional(),
    decisionNote: z.string().trim().max(1000).nullable().optional(),
  }),
  z.object({ action: z.literal("pay"), bankAccountId: z.string().uuid().nullable().optional() }),
]);

export type RetailRequisitionAction = z.infer<typeof retailRequisitionAction>;

export type RequisitionActor = { companyId: string; userId: string; role: string | null | undefined };

/** A refusal with the status the route should answer with. */
export class RequisitionRefused extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404 | 409 = 409,
  ) {
    super(message);
  }
}

const MANAGER_ROLES = ["SUPERADMIN", "MANAGER", "SHOP_MANAGER"];

function mayDecide(actor: RequisitionActor) {
  return canRetailRoleDo(actor.role, "retail.requisitions", "approve");
}

function mayPay(actor: RequisitionActor) {
  return canRetailRoleDo(actor.role, "retail.requisitions", "update");
}

/** What this person may do with this requisition, for the page to draw. */
export function requisitionPermissions(actor: RequisitionActor, requisition: Pick<CrmRequisition, "status" | "requestedById">) {
  const own = requisition.requestedById === actor.userId;
  const status = requisition.status as RequisitionStatus;
  return {
    isRequester: own,
    maySubmit: own && status === "DRAFT",
    mayCancel: (own || mayDecide(actor)) && ["DRAFT", "SUBMITTED", "APPROVED"].includes(status),
    // The owner may approve their own: it is their money. Anybody else needs
    // somebody else to say yes.
    mayDecide: status === "SUBMITTED" && mayDecide(actor) && (!own || actor.role?.toUpperCase() === "SUPERADMIN"),
    mayPay: status === "APPROVED" && mayPay(actor),
  };
}

const detailInclude = {
  site: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  disbursedBy: { select: { id: true, name: true } },
} satisfies Prisma.CrmRequisitionInclude;

/** The shop's requisitions: all of them for a manager, one's own for anybody else. */
export async function listRetailRequisitions(actor: RequisitionActor, options: { status?: RequisitionStatus | null } = {}) {
  return prisma.crmRequisition.findMany({
    where: {
      companyId: actor.companyId,
      siteId: { not: null },
      ...(mayDecide(actor) || mayPay(actor) ? {} : { requestedById: actor.userId }),
      ...(options.status ? { status: options.status } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    include: detailInclude,
    take: 500,
  });
}

export async function loadRetailRequisition(actor: RequisitionActor, id: string) {
  const requisition = await prisma.crmRequisition.findFirst({
    where: { id, companyId: actor.companyId, siteId: { not: null } },
    include: detailInclude,
  });
  if (!requisition) return null;
  // Somebody who can neither decide nor pay sees only their own.
  if (requisition.requestedById !== actor.userId && !mayDecide(actor) && !mayPay(actor)) return null;
  return requisition;
}

async function managersOf(companyId: string, excludeId: string) {
  const managers = await prisma.user.findMany({
    where: { companyId, role: { in: MANAGER_ROLES as never }, isActive: true },
    select: { id: true },
  });
  return managers.map((user) => user.id).filter((id) => id !== excludeId);
}

function viewPath(id: string) {
  return `/retail/purchasing/requisitions/${id}`;
}

async function tellManagers(actor: RequisitionActor, requisition: CrmRequisition) {
  await emitRetailNotification({
    companyId: actor.companyId,
    recipientIds: await managersOf(actor.companyId, actor.userId),
    type: "CRM_REQUISITION_SUBMITTED",
    title: `${requisition.requisitionNo}: ${requisition.currency} ${requisition.amount.toFixed(2)}`,
    summary: requisition.purpose,
    entityType: "CRM_REQUISITION",
    entityId: requisition.id,
    viewPath: viewPath(requisition.id),
  });
}

export async function raiseRetailRequisition(actor: RequisitionActor, input: z.infer<typeof retailRequisitionInput>) {
  const site = await prisma.site.findFirst({
    where: { id: input.siteId, companyId: actor.companyId },
    select: { id: true },
  });
  if (!site) throw new RequisitionRefused("That shop is not this business's", 404);

  const requisition = await prisma.$transaction(async (tx) => {
    const requisitionNo = await reserveIdentifier(tx, { companyId: actor.companyId, entity: "CRM_REQUISITION" });
    return tx.crmRequisition.create({
      data: {
        companyId: actor.companyId,
        requisitionNo,
        siteId: site.id,
        category: input.category,
        purpose: input.purpose,
        notes: input.notes ?? null,
        amount: input.amount,
        requestedById: actor.userId,
        neededBy: input.neededBy ?? null,
        ...(input.submit ? { status: "SUBMITTED" as const, submittedAt: new Date() } : {}),
      },
    });
  });
  if (requisition.status === "SUBMITTED") await tellManagers(actor, requisition);
  return requisition;
}

/**
 * Move a requisition on: submit, cancel, approve or reject, pay.
 *
 * Every refusal is a `RequisitionRefused` carrying its status; a move the
 * state machine forbids is a 409 in its own words.
 */
export async function actOnRetailRequisition(actor: RequisitionActor, id: string, act: RetailRequisitionAction) {
  const existing = await loadRetailRequisition(actor, id);
  if (!existing) throw new RequisitionRefused("Requisition not found", 404);
  const can = requisitionPermissions(actor, existing);
  const from = existing.status as RequisitionStatus;
  const now = new Date();

  try {
    switch (act.action) {
      case "submit": {
        if (!can.isRequester) throw new RequisitionRefused("Only the person who asked can send it", 403);
        assertTransition(from, "SUBMITTED");
        const requisition = await prisma.crmRequisition.update({
          where: { id },
          data: { status: "SUBMITTED", submittedAt: now },
        });
        await tellManagers(actor, requisition);
        return requisition;
      }

      case "cancel": {
        if (!can.isRequester && !mayDecide(actor)) throw new RequisitionRefused("You cannot cancel this requisition", 403);
        assertTransition(from, "CANCELLED");
        return prisma.crmRequisition.update({
          where: { id },
          data: { status: "CANCELLED", ...(act.reason ? { decisionNote: act.reason } : {}) },
        });
      }

      case "decide": {
        if (!mayDecide(actor)) throw new RequisitionRefused("You cannot approve requisitions", 403);
        if (can.isRequester && actor.role?.toUpperCase() !== "SUPERADMIN") {
          throw new RequisitionRefused("Somebody else has to approve your own request", 403);
        }
        const to = act.approve ? "APPROVED" : "REJECTED";
        assertTransition(from, to);
        if (act.approve && act.approvedAmount && existing.amount.lessThan(act.approvedAmount)) {
          throw new RequisitionRefused("Approve the amount asked for, or less", 409);
        }
        const requisition = await prisma.crmRequisition.update({
          where: { id },
          data: {
            status: to,
            approvedById: actor.userId,
            approvedAt: now,
            approvedAmount: act.approve ? (act.approvedAmount ?? null) : null,
            decisionNote: act.decisionNote ?? null,
          },
        });
        await emitRetailNotification({
          companyId: actor.companyId,
          recipientIds: [existing.requestedById],
          type: "CRM_REQUISITION_DECIDED",
          title: `${existing.requisitionNo} ${act.approve ? "approved" : "declined"}`,
          summary: act.approve
            ? `${requisition.currency} ${payableAmount(requisition).toFixed(2)} approved.`
            : (act.decisionNote ?? existing.purpose),
          entityType: "CRM_REQUISITION",
          entityId: id,
          viewPath: viewPath(id),
          severity: act.approve ? "INFO" : "WARNING",
        });
        return requisition;
      }

      case "pay": {
        if (!mayPay(actor)) throw new RequisitionRefused("You cannot pay out requisitions", 403);
        assertTransition(from, "DISBURSED");
        if (act.bankAccountId) {
          const account = await prisma.bankAccount.findFirst({
            where: { id: act.bankAccountId, companyId: actor.companyId },
            select: { id: true },
          });
          if (!account) throw new RequisitionRefused("Bank account not found", 404);
        }
        const requisition = await prisma.crmRequisition.update({
          where: { id },
          data: {
            status: "DISBURSED",
            disbursedById: actor.userId,
            disbursedAt: now,
            bankAccountId: act.bankAccountId ?? null,
          },
        });
        // The money has left the business: hand the event to accounting the way
        // the CRM does, best-effort, because the cash is gone either way.
        try {
          await postRequisitionDisbursement(actor.companyId, requisition, actor.userId);
        } catch (error) {
          console.error("[retail] requisition disbursement posting failed:", error);
        }
        await emitRetailNotification({
          companyId: actor.companyId,
          recipientIds: [existing.requestedById].filter((userId) => userId !== actor.userId),
          type: "CRM_REQUISITION_DECIDED",
          title: `${existing.requisitionNo} paid`,
          summary: `${requisition.currency} ${payableAmount(requisition).toFixed(2)} paid out.`,
          entityType: "CRM_REQUISITION",
          entityId: id,
          viewPath: viewPath(id),
        });
        return requisition;
      }
    }
  } catch (error) {
    if (error instanceof RequisitionTransitionError) throw new RequisitionRefused(error.message, 409);
    throw error;
  }
}
