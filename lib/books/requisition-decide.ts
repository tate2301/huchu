import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { decideCrmRequisition, RequisitionDecisionRefused } from "@/lib/crm/requisition-decide";
import { RequisitionTransitionError } from "@/lib/crm/requisitions";
import { prisma } from "@/lib/prisma";
import { approveRequisition, rejectRequisition, RequisitionRefusal } from "@/lib/retail/buying/requisitions";
import { buyingActor } from "@/lib/retail/buying/routes";

import type { BulkOutcome } from "./bulk";

/**
 * Approve or reject requisitions from Books, the CRM's and the shop's alike:
 * each the way its own module does it (`decideCrmRequisition`, retail's
 * `approveRequisition` and `rejectRequisition`), both through the core's
 * maker-checker and limits. One at a time; what one cannot be is skipped with
 * why, and the rest carry on (books-final §5.13).
 */
export async function decideRequisitions(session: AuthenticatedSession, ids: string[], input: { approve: boolean; note?: string | null }): Promise<BulkOutcome> {
  const rows = await prisma.crmRequisition.findMany({ where: { companyId: session.user.companyId, id: { in: [...new Set(ids)] } }, select: { id: true, requisitionNo: true, siteId: true } });
  const outcome: BulkOutcome = { done: [], skipped: [] };
  for (const row of rows) {
    const label = row.requisitionNo ?? "A draft";
    try {
      if (row.siteId) {
        const actor = buyingActor(session);
        if (input.approve) await approveRequisition(actor, row.id, { note: input.note ?? null });
        else await rejectRequisition(actor, row.id, { reason: "Other", message: input.note?.trim() || "Not approved in Books." });
      } else {
        await decideCrmRequisition(session, row.id, { approve: input.approve, decisionNote: input.note ?? null });
      }
      outcome.done.push(label);
    } catch (error) {
      if (error instanceof RequisitionDecisionRefused || error instanceof RequisitionTransitionError || error instanceof RequisitionRefusal) {
        outcome.skipped.push({ label, why: error instanceof RequisitionRefusal && error.fieldErrors ? Object.values(error.fieldErrors)[0] ?? error.message : error.message });
        continue;
      }
      throw error;
    }
  }
  return outcome;
}
