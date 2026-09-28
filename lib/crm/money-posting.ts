/**
 * What the CRM's money-out flows send to the ledger.
 *
 * The UIs live in the CRM; the effect belongs in accounting. This module is
 * the seam — it decides *what* posts and *when*, and `captureAccountingEvent`
 * does the rest through the tenant's own posting rules.
 *
 * ## The model
 *
 * Money is expensed as it leaves the business, on disbursement. That is a
 * deliberate choice over the alternative (hold it as a staff advance and
 * expense it on acquittal): it keeps the ledger simple and needs no advances
 * account, at the cost of the balance sheet never showing what staff are
 * holding.
 *
 * It has one consequence that has to be handled rather than accepted. If the
 * acquittal disagrees with what was handed over, the expense already posted is
 * wrong — 400 expensed against 310.50 actually spent overstates the cost by
 * 89.50 and hides 89.50 of cash somebody is still carrying. So an acquittal
 * posts the **variance only**:
 *
 *   spent less   → change came back   → CRM_REQUISITION_REFUND
 *   spent more   → they are owed it   → CRM_REQUISITION_TOPUP
 *   spent exactly → nothing to say    → no event
 *
 * ## What does not post
 *
 * A cost entry that names a requisition posts nothing. The money was expensed
 * when it was disbursed, and posting the spend again would double the cost —
 * the same double-count the project rollup refuses to make by keeping
 * committed and spent apart. Only an entry with no requisition behind it is a
 * cost the ledger has not already seen.
 */

import { Prisma } from "@prisma/client";

import { captureAccountingEvent } from "@/lib/accounting/integration";
import { payableAmount, type RequisitionCategory } from "@/lib/crm/requisitions";

type PostableRequisition = {
  id: string;
  requisitionNo: string;
  category: RequisitionCategory;
  currency: string;
  purpose: string;
  amount: Prisma.Decimal;
  approvedAmount: Prisma.Decimal | null;
  acquittedAmount: Prisma.Decimal | null;
  projectId: string | null;
  disbursedAt: Date | null;
  acquittedAt: Date | null;
};

/** The cost centre a project's spend belongs to, when it has one. */
async function costCentreForProject(
  companyId: string,
  projectId: string | null,
): Promise<string | null> {
  if (!projectId) return null;
  const { prisma } = await import("@/lib/prisma");
  const project = await prisma.crmProject.findFirst({
    where: { id: projectId, companyId },
    select: { costCenterId: true },
  });
  return project?.costCenterId ?? null;
}

/**
 * The money left the business. Expense it.
 *
 * Best-effort by design: a ledger that is briefly behind is recoverable — the
 * integration log keeps the event and it can be replayed — whereas a
 * disbursement that refuses to record itself because posting failed leaves the
 * cash gone and the CRM saying it never went.
 */
export async function postRequisitionDisbursement(
  companyId: string,
  requisition: PostableRequisition,
  createdById: string,
): Promise<void> {
  const amount = payableAmount(requisition);
  if (!amount.greaterThan(0)) return;

  await captureAccountingEvent({
    companyId,
    sourceDomain: "crm-requisitions",
    sourceAction: "disbursed",
    sourceType: "CRM_REQUISITION_DISBURSEMENT",
    sourceId: requisition.id,
    // What the money was for. The seeded rules condition on this.
    sourceSubtype: requisition.category,
    entryDate: requisition.disbursedAt ?? new Date(),
    description: `${requisition.requisitionNo}: ${requisition.purpose}`,
    amount,
    currency: requisition.currency,
    createdById,
    payload: {
      requisitionNo: requisition.requisitionNo,
      category: requisition.category,
      projectId: requisition.projectId,
      costCenterId: await costCentreForProject(companyId, requisition.projectId),
    },
  });
}

/**
 * The acquittal disagreed with the disbursement. Post the difference.
 *
 * Returns what it posted, so a caller and a test can see the decision rather
 * than infer it from the ledger.
 */
export async function postRequisitionAcquittalVariance(
  companyId: string,
  requisition: PostableRequisition,
  createdById: string,
): Promise<{ posted: "REFUND" | "TOPUP" | null; amount: Prisma.Decimal }> {
  const paid = payableAmount(requisition);
  const spent = new Prisma.Decimal(requisition.acquittedAmount ?? 0);
  const variance = paid.minus(spent);

  if (variance.isZero()) return { posted: null, amount: variance };

  // Positive variance: they spent less and the change came back, so the
  // expense must come down. Negative: they spent their own money.
  const posted = variance.greaterThan(0) ? "REFUND" : "TOPUP";

  await captureAccountingEvent({
    companyId,
    sourceDomain: "crm-requisitions",
    sourceAction: posted === "REFUND" ? "acquitted-change-returned" : "acquitted-overspend",
    sourceType: posted === "REFUND" ? "CRM_REQUISITION_REFUND" : "CRM_REQUISITION_TOPUP",
    sourceId: requisition.id,
    sourceSubtype: requisition.category,
    entryDate: requisition.acquittedAt ?? new Date(),
    description:
      posted === "REFUND"
        ? `${requisition.requisitionNo}: change returned`
        : `${requisition.requisitionNo}: spent over the requisition`,
    amount: variance.abs(),
    currency: requisition.currency,
    createdById,
    payload: {
      requisitionNo: requisition.requisitionNo,
      category: requisition.category,
      paid: paid.toFixed(2),
      spent: spent.toFixed(2),
      projectId: requisition.projectId,
      costCenterId: await costCentreForProject(companyId, requisition.projectId),
    },
  });

  return { posted, amount: variance.abs() };
}

type PostableCostEntry = {
  id: string;
  direction: "RECEIVED" | "SPENT";
  category: RequisitionCategory;
  amount: Prisma.Decimal;
  currency: string;
  description: string;
  projectId: string | null;
  requisitionId: string | null;
  createdAt: Date;
};

/**
 * A line from somebody's daily log.
 *
 * An entry that names a requisition posts nothing — see the note at the top.
 * A receipt is captured and deliberately unmapped: there is no credit side to
 * infer, so it waits on the integration log for a person.
 */
export async function postCostEntry(
  companyId: string,
  entry: PostableCostEntry,
  createdById: string,
): Promise<{ posted: boolean; reason?: string }> {
  if (entry.requisitionId) {
    return { posted: false, reason: "already expensed when the requisition was paid out" };
  }
  if (!entry.amount.greaterThan(0)) return { posted: false, reason: "zero" };

  await captureAccountingEvent({
    companyId,
    sourceDomain: "crm-daily-costs",
    sourceAction: entry.direction === "SPENT" ? "spent" : "received",
    sourceType: entry.direction === "SPENT" ? "CRM_COST_ENTRY_SPEND" : "CRM_COST_ENTRY_RECEIPT",
    sourceId: entry.id,
    sourceSubtype: entry.category,
    entryDate: entry.createdAt,
    description: entry.description,
    amount: entry.amount,
    currency: entry.currency,
    createdById,
    payload: {
      category: entry.category,
      projectId: entry.projectId,
      costCenterId: await costCentreForProject(companyId, entry.projectId),
    },
  });

  return { posted: true };
}
