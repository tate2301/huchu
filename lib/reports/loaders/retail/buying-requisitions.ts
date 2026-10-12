import { prisma } from "@/lib/prisma";
import { result } from "@/lib/reports/loaders/shared";
import type { ListOption, ReportContext, ReportLoader, ReportParams, ReportRow } from "@/lib/reports/types";
import { getApprovalLimits } from "@/lib/retail/approvals/limits";
import { requisitionApprovals } from "@/lib/retail/buying/requisition-view";
import { decideRefusal, mayCancel, requisitionScope } from "@/lib/retail/buying/requisitions";
import { expenseShort, requisitionStateBadge, type RequisitionState } from "@/lib/retail/buying/requisition-words";
import { dayKey, formatShortDay, formatWhen } from "@/lib/workspace/format";

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
        requestedBy: { select: { name: true } },
        approver: { select: { name: true } },
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
  return { asked: askers.map((person) => ({ value: person.id, label: person.name })) };
}

/** The requisition the tab is for, when the reader may read it; else nothing. */
async function readable(ctx: ReportContext, params: ReportParams) {
  if (!params.requisitionId) return null;
  return prisma.crmRequisition.findFirst({ where: { id: params.requisitionId, ...requisitionScope(actorOf(ctx)) }, select: { id: true } });
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
    select: { id: true, name: true, url: true, createdAt: true, addedBy: { select: { name: true } } },
  });
  return result(
    files.map((file) => ({
      id: file.id,
      requisitionId: requisition.id,
      name: file.name,
      url: file.url,
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
