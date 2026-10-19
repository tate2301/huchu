import { Prisma } from "@prisma/client";

import { otherOwners, othersWhoCan } from "@/lib/books/core/approvals";
import { money, sumMoney, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getApprovalLimits } from "@/lib/retail/approvals/limits";
import { RETAIL_AUDIT_EVENTS, type RetailAuditActor } from "@/lib/retail/audit";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { dayKey, formatMoney } from "@/lib/workspace/format";

import { orderTotals } from "./figures";
import { findMoneyAccount, moneyAccountSub } from "./money-accounts";
import { decideRefusal, mayCancel, requisitionScope } from "./requisitions";
import { firstName, REJECT_REASON_WORD, requisitionStateBadge, requisitionSteps, type RequisitionState, type RequisitionStep } from "./requisition-words";

/**
 * A requisition as its record reads it (40-buying 4.5 `RequisitionView`,
 * 5.9): the state and steps, who asked and who it waits for, the order or the
 * expense, the money account and its balance, the figures behind the KPIs and
 * the chart, and what this viewer may do now. Words that depend only on the
 * figures are the record kind's.
 */

export type RequisitionView = {
  id: string;
  requisitionNo: string;
  status: RequisitionState;
  badge: { label: string; tone: string };
  steps: RequisitionStep[];
  purpose: string;
  why: string | null;
  for: "order" | "expense";
  amount: number;
  /** The approved amount when it was cut, else the amount asked. */
  shown: number;
  approvedAmount: number | null;
  paidAmount: number | null;
  spent: number | null;
  currency: string;
  asker: { id: string; name: string; firstName: string; /** May pay it out: "Tafara can pay it out." */ pays: boolean };
  askedAt: string;
  /** The viewer asked for it. */
  mine: boolean;
  neededBy: string | null;
  order: { id: string; poNo: string; supplier: string; total: number; units: number; lines: number } | null;
  expenseType: { id: string; name: string } | null;
  payFrom: { id: string; name: string; kind: string; balance: number; sub: string } | null;
  payee: { id: string; name: string } | null;
  /** Who decides: the owner approver over the limit, else "Any manager". */
  approver: { id: string | null; name: string; over: boolean };
  /** The owner limit it was asked under. */
  limit: number;
  decidedBy: string | null;
  decisionNote: string | null;
  rejectReason: string | null;
  receiptsDueAt: string | null;
  receiptsOverdue: boolean;
  /** Paid out (BUY-05): to whom, how, when; accounted for: when, the change and where it went. */
  payout: {
    to: { id: string; name: string } | null;
    method: "CASH" | "BANK_TRANSFER" | "ECOCASH" | null;
    reference: string | null;
    at: string | null;
    acquittedAt: string | null;
    change: number | null;
    changeInto: string | null;
  };
  quote: { url: string; name: string; contentType: string } | null;
  /** The asker is told on WhatsApp too ("WhatsApp and the app"). */
  whatsapp: boolean;
  /** Who asked the last question, for the asker's "Answer Tendai". */
  questionFrom: string | null;
  figures: {
    /** Spent on stock (order) or on this expense type, this calendar month. */
    spentThisMonth: number;
  };
  chart: Array<{ month: string; value: number }>;
  counts: { lines: number; approvals: number; receipts: number };
  can: {
    approve: boolean;
    approveLess: boolean;
    reject: boolean;
    ask: boolean;
    answer: boolean;
    payOut: boolean;
    acquit: boolean;
    cancel: boolean;
    askAgain: boolean;
    update: boolean;
    /** The rail's Pay from: also while approved. */
    updatePayFrom: boolean;
  };
};

/** One row of the Approvals tab. */
export type ApprovalRow = { id: string; when: string; what: string; tone: "pending" | "ok" | "bad" | "info"; by: string };

type Payload = Record<string, unknown>;
const parse = (json: string | null): Payload => {
  try {
    return json ? (JSON.parse(json) as Payload) : {};
  } catch {
    return {};
  }
};
const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/**
 * The Approvals tab: who it waits for while it waits ("Waiting for Tendai
 * Mhlanga, owner, over US$500.00"), each decision ("Approved US$1,500.00 —
 * Pay Afdis …", "Rejected: Pay another way — …") and each question and answer.
 */
export async function requisitionApprovals(companyId: string, id: string): Promise<ApprovalRow[]> {
  const requisition = await prisma.crmRequisition.findFirst({
    where: { id, companyId },
    select: { status: true, submittedAt: true, createdAt: true, approvalLimit: true, currency: true, approver: { select: { name: true } } },
  });
  if (!requisition) return [];
  const events = await prisma.platformAuditEvent.findMany({
    where: {
      companyId,
      entityType: "CrmRequisition",
      entityId: id,
      eventType: { in: [RETAIL_AUDIT_EVENTS.requisitionApproved, RETAIL_AUDIT_EVENTS.requisitionRejected, RETAIL_AUDIT_EVENTS.requisitionQuestion] },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, eventType: true, payloadJson: true, createdAt: true },
  });
  const rows: ApprovalRow[] = events.map((event) => {
    const payload = parse(event.payloadJson);
    const by = str(payload.actorName) ?? "Someone";
    const when = event.createdAt.toISOString();
    if (event.eventType === RETAIL_AUDIT_EVENTS.requisitionApproved) {
      const note = str(payload.note);
      const figure = formatMoney(Number(payload.amount ?? 0), str(payload.currency) ?? requisition.currency);
      return { id: event.id, when, what: `Approved ${figure}${note ? ` — ${note}` : ""}`, tone: "ok", by };
    }
    if (event.eventType === RETAIL_AUDIT_EVENTS.requisitionRejected) {
      const message = str(payload.message);
      return { id: event.id, when, what: `Rejected: ${str(payload.reason) ?? "no reason"}${message ? ` — ${message}` : ""}`, tone: "bad", by };
    }
    return { id: event.id, when, what: `${payload.answer === true ? "Answered" : "Asked"}: ${str(payload.message) ?? ""}`, tone: "info", by };
  });
  if (requisition.status === "SUBMITTED") {
    const limit = formatMoney(toNumberOrZero(requisition.approvalLimit ?? 0));
    const what = requisition.approver ? `Waiting for ${requisition.approver.name}, owner, over ${limit}` : `Waiting for a manager, ${limit} or under`;
    rows.push({ id: "waiting", when: (requisition.submittedAt ?? requisition.createdAt).toISOString(), what, tone: "pending", by: "—" });
  }
  return rows;
}

function monthStart(now: Date): Date {
  const key = dayKey(now).slice(0, 7);
  return new Date(`${key}-01T00:00:00+02:00`);
}

/** Σ approved amounts per month (Harare months), of stock purchases or of one expense type. */
async function askedByMonth(companyId: string, filter: Prisma.CrmRequisitionWhereInput): Promise<Array<{ month: string; value: number }>> {
  const rows = await prisma.crmRequisition.findMany({
    where: { companyId, siteId: { not: null }, status: { in: ["APPROVED", "DISBURSED", "ACQUITTED"] }, approvedAt: { not: null }, ...filter },
    select: { approvedAt: true, amount: true, approvedAmount: true },
  });
  const by = new Map<string, Prisma.Decimal>();
  for (const row of rows) {
    const key = dayKey(row.approvedAt!).slice(0, 7);
    by.set(key, (by.get(key) ?? money(0)).plus(row.approvedAmount ?? row.amount));
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, value: toNumberOrZero(value) }));
}

/** Every month from the first with anything to this one, empty months at nought. */
export function fillMonths(points: Array<{ month: string; value: number }>, now: Date): Array<{ month: string; value: number }> {
  const current = dayKey(now).slice(0, 7);
  const first = points[0]?.month ?? current;
  const values = new Map(points.map((point) => [point.month, point.value]));
  const months: Array<{ month: string; value: number }> = [];
  let [year, month] = first.split("-").map(Number) as [number, number];
  for (let guard = 0; guard < 600; guard += 1) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    months.push({ month: key, value: values.get(key) ?? 0 });
    if (key >= current) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/** The requisition as `actor` reads it, or null when it is not theirs to read (404). */
export async function loadRequisitionView(actor: RetailAuditActor, id: string, now = new Date()): Promise<RequisitionView | null> {
  const row = await prisma.crmRequisition.findFirst({
    where: { id, ...requisitionScope(actor) },
    include: {
      requestedBy: { select: { id: true, name: true, role: true } },
      approver: { select: { id: true, name: true } },
      approvedBy: { select: { name: true } },
      payee: { select: { id: true, name: true } },
      paidTo: { select: { id: true, name: true } },
      changeAccount: { select: { name: true } },
      expenseType: { select: { id: true, name: true } },
      purchaseOrder: { select: { id: true, poNo: true, vendor: { select: { name: true } }, lines: { select: { quantity: true, unitCost: true, vatRate: true } } } },
    },
  });
  if (!row) return null;
  const status = row.status as RequisitionState;
  const limits = await getApprovalLimits(actor.companyId);
  const limit = row.approvalLimit ?? limits.requisitionOwnerOver;
  const over = row.amount.greaterThan(limit);
  const ownerName = row.approver?.name ?? limits.ownerApprover?.name ?? null;
  const shown = row.approvedAmount ?? row.amount;

  const [payFrom, quote, receipts, approvals] = await Promise.all([
    row.bankAccountId ? findMoneyAccount(actor.companyId, row.bankAccountId) : Promise.resolve(null),
    prisma.retailAttachment.findFirst({
      where: { companyId: actor.companyId, entityType: "CrmRequisition", entityId: row.id, kind: "QUOTE" },
      orderBy: { createdAt: "desc" },
      select: { url: true, name: true, contentType: true },
    }),
    prisma.retailAttachment.count({ where: { companyId: actor.companyId, entityType: "CrmRequisition", entityId: row.id, kind: "RECEIPT" } }),
    requisitionApprovals(actor.companyId, row.id),
  ]);

  // Spent this calendar month: stock — order requisitions paid out and supplier payments; an expense — this type paid out.
  const from = monthStart(now);
  let spentThisMonth: Prisma.Decimal;
  if (row.purchaseOrderId) {
    const [paidOut, payments] = await Promise.all([
      prisma.crmRequisition.findMany({
        where: { companyId: actor.companyId, purchaseOrderId: { not: null }, status: { in: ["DISBURSED", "ACQUITTED"] }, disbursedAt: { gte: from } },
        select: { paidAmount: true, approvedAmount: true, amount: true },
      }),
      // A requisition's cash is its own row on the supplier's account: counted once, as the payout.
      prisma.purchasePayment.findMany({ where: { companyId: actor.companyId, paidAt: { gte: from }, requisitionId: null }, select: { amount: true } }),
    ]);
    spentThisMonth = sumMoney([...paidOut.map((r) => r.paidAmount ?? r.approvedAmount ?? r.amount), ...payments.map((p) => money(p.amount))]);
  } else {
    const paidOut = await prisma.crmRequisition.findMany({
      where: { companyId: actor.companyId, expenseTypeId: row.expenseTypeId, status: { in: ["DISBURSED", "ACQUITTED"] }, disbursedAt: { gte: from } },
      select: { paidAmount: true, acquittedAmount: true, approvedAmount: true, amount: true },
    });
    spentThisMonth = sumMoney(paidOut.map((r) => r.acquittedAmount ?? r.paidAmount ?? r.approvedAmount ?? r.amount));
  }
  const chart = fillMonths(
    await askedByMonth(actor.companyId, row.purchaseOrderId ? { purchaseOrderId: { not: null } } : { expenseTypeId: row.expenseTypeId }),
    now,
  );

  const mine = row.requestedById === actor.userId;
  const [others, owners] = mine
    ? await Promise.all([othersWhoCan(prisma, actor.companyId, { module: "retail", except: [actor.userId] }), otherOwners(prisma, actor.companyId, [actor.userId])])
    : [1, 1];
  const decide = status === "SUBMITTED" && decideRefusal(actor, row, ownerName, others, owners) === null;
  const role = actor.userRole;
  const updates = canRetailRoleDo(role, "retail.requisitions", "update");
  const receiptsOverdue = status === "DISBURSED" && row.receiptsDueAt !== null && row.receiptsDueAt < now;
  const order = row.purchaseOrder
    ? {
        id: row.purchaseOrder.id,
        poNo: row.purchaseOrder.poNo,
        supplier: row.purchaseOrder.vendor.name,
        total: toNumberOrZero(orderTotals(row.purchaseOrder.lines).total),
        units: row.purchaseOrder.lines.reduce((sum, line) => sum + toNumberOrZero(line.quantity), 0),
        lines: row.purchaseOrder.lines.length,
      }
    : null;

  return {
    id: row.id,
    requisitionNo: row.requisitionNo ?? "Requisition",
    status,
    badge: requisitionStateBadge(status, receiptsOverdue),
    steps: requisitionSteps(status),
    purpose: row.purpose,
    why: row.notes,
    for: row.purchaseOrderId ? "order" : "expense",
    amount: toNumberOrZero(row.amount),
    shown: toNumberOrZero(shown),
    approvedAmount: row.approvedAmount ? toNumberOrZero(row.approvedAmount) : null,
    paidAmount: row.paidAmount ? toNumberOrZero(row.paidAmount) : null,
    spent: row.acquittedAmount ? toNumberOrZero(row.acquittedAmount) : null,
    currency: row.currency,
    asker: {
      id: row.requestedBy.id,
      name: row.requestedBy.name,
      firstName: firstName(row.requestedBy.name),
      pays: canRetailRoleDo(row.requestedBy.role, "retail.requisitions", "update"),
    },
    askedAt: (row.submittedAt ?? row.createdAt).toISOString(),
    mine,
    neededBy: row.neededBy ? dayKey(row.neededBy) : null,
    order,
    expenseType: row.expenseType,
    payFrom: payFrom
      ? { id: payFrom.id, name: payFrom.name, kind: payFrom.kind, balance: toNumberOrZero(payFrom.balance), sub: moneyAccountSub(payFrom) }
      : null,
    payee: row.payee,
    approver: over ? { id: row.approver?.id ?? limits.ownerApprover?.id ?? null, name: ownerName ?? "The owner", over } : { id: null, name: "Any manager", over },
    limit: toNumberOrZero(limit),
    decidedBy: row.approvedBy?.name ?? null,
    decisionNote: row.decisionNote,
    rejectReason: row.rejectReason ? REJECT_REASON_WORD[row.rejectReason] : null,
    receiptsDueAt: row.receiptsDueAt?.toISOString() ?? null,
    receiptsOverdue,
    payout: {
      to: row.paidTo,
      method: row.payoutMethod,
      reference: row.payoutReference,
      at: row.disbursedAt?.toISOString() ?? null,
      acquittedAt: row.acquittedAt?.toISOString() ?? null,
      change: row.changeAmount ? toNumberOrZero(row.changeAmount) : null,
      changeInto: row.changeAccount?.name ?? null,
    },
    quote,
    whatsapp: limits.askBy === "WHATSAPP_AND_APP",
    questionFrom: [...approvals].reverse().find((approval) => approval.what.startsWith("Asked:"))?.by ?? null,
    figures: { spentThisMonth: toNumberOrZero(spentThisMonth) },
    chart,
    counts: { lines: order?.lines ?? 0, approvals: approvals.length, receipts },
    can: {
      approve: decide,
      approveLess: decide,
      reject: decide,
      ask: decide && !mine,
      answer: status === "SUBMITTED" && mine && approvals.some((approval) => approval.what.startsWith("Asked:")),
      payOut: status === "APPROVED" && updates,
      acquit: status === "DISBURSED" && (mine || updates),
      cancel: (status === "SUBMITTED" || status === "APPROVED") && mayCancel(actor, row.requestedById),
      askAgain: status === "REJECTED" && mine,
      update: status === "SUBMITTED" && (mine || updates),
      updatePayFrom: (status === "SUBMITTED" || status === "APPROVED") && (mine || updates),
    },
  };
}
