/**
 * What the CRM's cost tracker sends to the ledger on its own.
 *
 * A requisition's money posts through the Books core
 * (`lib/books/core/requisitions.ts`): paid out onto 1150 Cash advances,
 * accounted for by category out of the advance, the change back or the
 * overspend paid. A spend from somebody's own pocket becomes a line of the
 * claim their day turns into when it is submitted (`claimFromDailyLog`), and
 * posts when the claim is approved. What is left here is a cost-tracker line
 * posted on its own: cash received (deliberately unmapped, so it waits in
 * Needs posting for a person) and, for a caller that still asks, a spend.
 *
 * A cost entry that names a requisition posts nothing: it posts with the
 * requisition's acquittal, and posting it again would double the cost.
 */

import { Prisma } from "@prisma/client";

import { postMoney } from "@/lib/books/core";
import { prisma as db } from "@/lib/prisma";
import type { RequisitionCategory } from "@/lib/crm/requisitions";

/** The cost centre a project's spend belongs to, when it has one. */
async function costCentreForProject(
  companyId: string,
  projectId: string | null,
): Promise<string | null> {
  if (!projectId) return null;
  const project = await db.crmProject.findFirst({
    where: { id: projectId, companyId },
    select: { costCenterId: true },
  });
  return project?.costCenterId ?? null;
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
 * A receipt is deliberately unmapped: there is no credit side to infer, so it
 * fails with that reason and waits in Needs posting for a person.
 */
export async function postCostEntry(
  companyId: string,
  entry: PostableCostEntry,
  createdById: string,
  role?: string | null,
): Promise<{ posted: boolean; reason?: string }> {
  if (entry.requisitionId) {
    return { posted: false, reason: "posts with the requisition's acquittal" };
  }
  if (!entry.amount.greaterThan(0)) return { posted: false, reason: "zero" };

  const costCenterId = await costCentreForProject(companyId, entry.projectId);
  await postMoney(db, {
    companyId,
    sourceType: entry.direction === "SPENT" ? "CRM_COST_ENTRY_SPEND" : "CRM_COST_ENTRY_RECEIPT",
    sourceId: entry.id,
    sourceSubtype: entry.category,
    date: entry.createdAt,
    description: entry.description,
    amount: entry.amount,
    currency: entry.currency,
    costCenterId,
    actor: { userId: createdById, role },
    payload: {
      category: entry.category,
      projectId: entry.projectId,
      costCenterId,
    },
  });

  return { posted: true };
}
