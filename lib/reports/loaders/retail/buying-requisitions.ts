import { prisma } from "@/lib/prisma";
import { result } from "@/lib/reports/loaders/shared";
import type { ListOption, ReportContext, ReportLoader, ReportParams, ReportRow } from "@/lib/reports/types";
import { getApprovalLimits } from "@/lib/retail/approvals/limits";
import { requisitionApprovals } from "@/lib/retail/buying/requisition-view";
import { decideRefusal, mayCancel, requisitionScope } from "@/lib/retail/buying/requisitions";
import { expenseShort, requisitionStateBadge, type RequisitionState } from "@/lib/retail/buying/requisition-words";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { dayKey, formatMoney, formatShortDay, formatWhen } from "@/lib/workspace/format";

/**
 * Requisitions (40-buying 4.1, `retail-requisitions`), in memory (a shop asks
 * for money a few times a week): each with its state's words, the amount (the
 * approved one when cut), who asked, when it is needed and what it is against.
 * `decidable` and `cancellable` say what the reader may do to the row, so the
 * row menu offers only that. The record's Approvals and Receipts tabs are
 * `retail-requisition-approvals` and `retail-requisition-receipts`.
 */

const actorOf = (ctx: ReportContext) => ({ companyId: ctx.companyId, userId: ctx.userId, userRole: ctx.role });

async function loadRequisitions(ctx: ReportContext) {
  const actor = actorOf(ctx);
  const now = new Date();
  const pays = canRetailRoleDo(ctx.role, "retail.requisitions", "update");
  const [rows, limits] = await Promise.all([
    prisma.crmRequisition.findMany({
      where: requisitionScope(actor),
      orderBy: [{ requisitionNo: "desc" }],
      select: {
        id: true,
        requisitionNo: true,
        status: true,
        purpose: true,
        amount: true,
        approvedAmount: true,
        approvalLimit: true,
        currency: true,
        requestedById: true,
        neededBy: true,
        submittedAt: true,
        createdAt: true,
        receiptsDueAt: true,
        paidAmount: true,
        acquittedAmount: true,
        changeAmount: true,
        disbursedAt: true,
        requestedBy: { select: { name: true } },
        approver: { select: { name: true } },
        approvedBy: { select: { name: true } },
        purchaseOrder: { select: { id: true, poNo: true } },
        expenseType: { select: { name: true } },
      },
    }),
    getApprovalLimits(ctx.companyId),
  ]);
  return result(
    rows.map((row): ReportRow => {
      const state = row.status as RequisitionState;
      const badge = requisitionStateBadge(state, state === "DISBURSED" && row.receiptsDueAt !== null && row.receiptsDueAt < now);
      const shown = Number(row.approvedAmount ?? row.amount);
      const refusal = state === "SUBMITTED" ? decideRefusal(actor, row, row.approver?.name ?? limits.ownerApprover?.name ?? null) : "Not waiting.";
      const needed = row.neededBy ? dayKey(row.neededBy) : null;
      const order = row.purchaseOrder;
      return {
        id: row.id,
        requisitionNo: row.requisitionNo,
        purpose: row.purpose,
        status: state,
        state: badge.label,
        tone: badge.tone,
        amount: shown,
        currency: row.currency,
        usdAmount: row.currency === "USD" ? shown : 0,
        askedById: row.requestedById,
        askedBy: row.requestedBy.name,
        askedAt: (row.submittedAt ?? row.createdAt).toISOString(),
        neededBy: needed,
        orderId: order?.id ?? null,
        orderNo: order?.poNo ?? null,
        against: order ? order.poNo : row.expenseType ? expenseShort(row.expenseType.name) : null,
        againstTone: order ? null : "ink-3",
        purposeKind: order ? "order" : "expense",
        purposeWords: order ? "An order" : (row.expenseType?.name ?? "An expense"),
        approverName: row.approver?.name ?? null,
        mine: row.requestedById === ctx.userId ? "yes" : "no",
        decidable: refusal === null ? "yes" : "no",
        cannotWhy: refusal && refusal.startsWith("Over") ? `is over the limit: ${refusal}` : null,
        cancellable: (state === "SUBMITTED" || state === "APPROVED") && mayCancel(actor, row.requestedById) ? "yes" : "no",
        payable: state === "APPROVED" && pays ? "yes" : "no",
        acquittable: state === "DISBURSED" && (pays || row.requestedById === ctx.userId) ? "yes" : "no",
        // Reports' face (5.14): who approved it, what was paid, spent and brought back, and when.
        whatFor: order ? "Stock purchase" : (row.expenseType?.name ?? "An expense"),
        approvedBy: state === "REJECTED" ? null : (row.approvedBy?.name ?? null),
        approved: row.approvedBy && state !== "REJECTED" ? shown : null,
        paid: row.paidAmount === null ? null : Number(row.paidAmount),
        spent: row.acquittedAmount === null ? null : Number(row.acquittedAmount),
        back: row.changeAmount === null ? null : Number(row.changeAmount),
        paidOn: row.disbursedAt ? dayKey(row.disbursedAt) : null,
        month: dayKey(row.submittedAt ?? row.createdAt).slice(0, 7),
        requisitions: 1,
        cardMeta: [row.requisitionNo, row.requestedBy.name, needed ? `needed ${formatShortDay(`${needed}T12:00:00Z`)}` : null].filter(Boolean).join(" · "),
      };
    }),
  );
}

async function requisitionOptions(ctx: ReportContext): Promise<Record<string, ListOption[]>> {
  const askers = await prisma.user.findMany({
    where: { companyId: ctx.companyId, crmRequisitionsRequested: { some: { siteId: { not: null } } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const types = await prisma.retailExpenseType.findMany({ where: { companyId: ctx.companyId, archivedAt: null }, orderBy: { name: "asc" }, select: { name: true } });
  const people = askers.map((person) => ({ value: person.id, label: person.name }));
  return {
    asked: people,
    askedBy: people,
    whatFor: [{ value: "Stock purchase", label: "Stock purchase" }, ...types.map((type) => ({ value: type.name, label: type.name }))],
  };
}

/** The requisition the tab is for, when the reader may read it; else nothing. */
async function readable(ctx: ReportContext, params: ReportParams) {
  if (!params.requisitionId) return null;
  return prisma.crmRequisition.findFirst({
    where: { id: params.requisitionId, ...requisitionScope(actorOf(ctx)) },
    select: { id: true, acquittedAmount: true, currency: true },
  });
}

async function loadApprovals(ctx: ReportContext, params: ReportParams) {
  const requisition = await readable(ctx, params);
  if (!requisition) return result([]);
  const rows = await requisitionApprovals(ctx.companyId, requisition.id);
  return result(
    rows.map((row) => ({
      id: row.id === "waiting" ? `${requisition.id}-waiting` : row.id,
      requisitionId: requisition.id,
      when: row.when,
      whenText: formatWhen(row.when),
      what: row.what,
      tone: row.tone,
      by: row.by,
    })),
  );
}

async function loadReceipts(ctx: ReportContext, params: ReportParams) {
  const requisition = await readable(ctx, params);
  if (!requisition) return result([]);
  const files = await prisma.retailAttachment.findMany({
    where: { companyId: ctx.companyId, entityType: "CrmRequisition", entityId: requisition.id, kind: "RECEIPT" },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, url: true, contentType: true, createdAt: true, addedBy: { select: { name: true } } },
  });
  const spent = requisition.acquittedAmount ? `Spent ${formatMoney(Number(requisition.acquittedAmount), requisition.currency)}` : null;
  return result(
    files.map((file, index) => ({
      id: file.id,
      requisitionId: requisition.id,
      name: file.name,
      url: file.url,
      thumb: file.contentType.startsWith("image/") ? file.url : null,
      under: index === 0 ? spent : null,
      added: file.createdAt.toISOString(),
      addedText: formatWhen(file.createdAt),
      by: file.addedBy?.name ?? null,
    })),
  );
}

export const BUYING_REQUISITION_LOADERS: Record<string, ReportLoader> = {
  "retail-requisitions": { load: (ctx) => loadRequisitions(ctx), options: requisitionOptions },
  "retail-requisition-approvals": { load: loadApprovals },
  "retail-requisition-receipts": { load: loadReceipts },
};
