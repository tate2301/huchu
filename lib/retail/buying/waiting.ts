import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { registerWaitingProvider, type WaitingProvider } from "@/lib/retail/approvals/waiting";
import { formatMoney } from "@/lib/workspace/format";

import { decideRefusal } from "./requisitions";
import { firstName } from "./requisition-words";

/**
 * Requisitions this person may decide now (BUY-04): waiting for approval, an
 * owner's all of them, a manager's those at or under the limit they were asked
 * under and not their own. "Waiting now" on Approvals and the Requisitions
 * badge both count these.
 */
export async function decidableRequisitions(ctx: { companyId: string; userId: string; role: string | null }) {
  const rows = await prisma.crmRequisition.findMany({
    where: { companyId: ctx.companyId, siteId: { not: null }, status: "SUBMITTED" },
    orderBy: [{ submittedAt: "asc" }, { requisitionNo: "asc" }],
    select: {
      id: true,
      requisitionNo: true,
      requestedById: true,
      amount: true,
      approvalLimit: true,
      currency: true,
      purpose: true,
      submittedAt: true,
      createdAt: true,
      payee: { select: { name: true } },
      purchaseOrderId: true,
    },
  });
  const actor = { companyId: ctx.companyId, userId: ctx.userId, userRole: ctx.role };
  return rows.filter((row) => decideRefusal(actor, row, null) === null);
}

/** "REQ-0014, US$1,940.00, for Afdis." */
export const requisitionsWaiting: WaitingProvider = {
  kind: "requisition",
  requires: ["retail.requisitions", "approve"],
  async list(ctx) {
    const rows = await decidableRequisitions({ companyId: ctx.companyId, userId: ctx.userId, role: ctx.session.user.role ?? null });
    return rows.map((row) => ({
      key: `req-${row.id}`,
      ref: row.requisitionNo,
      text: `, ${formatMoney(toNumberOrZero(row.amount), row.currency)}, for ${row.purchaseOrderId && row.payee ? firstName(row.payee.name) : row.purpose.replace(/[.]$/, "")}.`,
      href: `/retail/buying/requisitions/${row.id}`,
      since: row.submittedAt ?? row.createdAt,
    }));
  },
};

registerWaitingProvider(requisitionsWaiting);
