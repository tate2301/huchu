/**
 * Shared bits of the requisition routes.
 *
 * Here rather than exported from `route.ts` because a Next route module may
 * only export handlers — anything else fails the build's type check on the
 * route, and the failure names the file rather than the cause.
 */
import { emitCrmNotification, getCrmManagerRecipients } from "@/lib/notifications";

/** Tell whoever can say yes that somebody is waiting on them. */
export async function notifyApprovers(
  companyId: string,
  requesterId: string,
  requisition: {
    id: string;
    requisitionNo: string;
    amount: { toFixed: (places: number) => string };
    currency: string;
    purpose: string;
  },
) {
  const recipientIds = await getCrmManagerRecipients(companyId, requesterId);
  await emitCrmNotification({
    companyId,
    recipientIds,
    type: "CRM_REQUISITION_SUBMITTED",
    title: `${requisition.requisitionNo}: ${requisition.currency} ${requisition.amount.toFixed(2)}`,
    summary: requisition.purpose,
    entityType: "CRM_REQUISITION",
    entityId: requisition.id,
    viewPath: `/crm/requisitions/${requisition.id}`,
  });
}
