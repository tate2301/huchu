import { fetchJson } from "@/lib/api-client";
import { cancelRequisitionAsk } from "@/lib/retail/asks/buying";
import type { RequisitionView } from "@/lib/retail/buying/requisition-view";
import { approvedWords, currencyRailWords, firstName } from "@/lib/retail/buying/requisition-words";
import { dayKey, formatDay, formatMoney, formatShortDay, formatShortMonth, formatTime } from "@/lib/workspace/format";

import type { Grant, RailGroup, RecordAction, RecordChart, RecordChip, RecordFigure, RecordKind, RecordKpi } from "./types";

/**
 * The requisition record kind (40-buying 5.9, RequisitionRecord board):
 * what the money is for, its steps from asked to accounted for, who it waits
 * for and what the approver can do now — approve it (or a different amount),
 * reject it, ask a question — the asker's "Change and ask again" once
 * rejected, "Pay out" once approved and "Account for it" once paid out.
 */

const API = "/api/v2/retail/buying/requisitions";
const CREATE: Grant = ["retail.requisitions", "create"];
const APPROVE: Grant = ["retail.requisitions", "approve"];
const UPDATE: Grant = ["retail.requisitions", "update"];
const ORDER_VIEW: Grant = ["retail.purchasing", "view"];
const DAY_MS = 86_400_000;

const pdfOf = (r: RequisitionView) => `/api/v2/retail/records/CrmRequisition/${r.id}/pdf`;
const money = (r: RequisitionView, value: number) => formatMoney(value, r.currency);
const noYear = (day: string) => formatDay(`${day}T12:00:00Z`).replace(/ \d{4}$/, "");

/** Whole days from today (Harare) to a shop day: 0 today, 1 tomorrow, negative past. */
function daysFromToday(day: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${dayKey(new Date())}T00:00:00Z`)) / DAY_MS);
}

const unpaid = (r: RequisitionView) => r.status === "SUBMITTED" || r.status === "APPROVED";

/** "Needed by Tuesday" (warn within three days), "Needed today", "Needed by 6 Oct"; none once paid out. */
function neededChip(r: RequisitionView): RecordChip | null {
  if (!r.neededBy || !unpaid(r)) return null;
  const days = daysFromToday(r.neededBy);
  if (days <= 0) return { label: days === 0 ? "Needed today" : `Needed by ${formatShortDay(`${r.neededBy}T12:00:00Z`)}`, tone: "warn" };
  if (days <= 3) {
    const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(`${r.neededBy}T12:00:00Z`));
    return { label: `Needed by ${weekday}`, tone: "warn" };
  }
  return { label: `Needed by ${formatShortDay(`${r.neededBy}T12:00:00Z`)}`, tone: "plain" };
}

function figure(r: RequisitionView): RecordFigure | null {
  switch (r.status) {
    case "SUBMITTED":
      return r.can.approve ? { label: "Asked for", value: money(r, r.amount) } : { label: "Waiting for", value: r.approver.over ? r.approver.name : "a manager" };
    case "APPROVED":
      return { label: "Approved", value: money(r, r.shown) };
    case "DISBURSED":
      return { label: "Paid out", value: money(r, r.paidAmount ?? r.shown) };
    case "ACQUITTED":
      return { label: "Spent", value: money(r, r.spent ?? r.paidAmount ?? r.shown) };
    default:
      return { label: "Asked for", value: money(r, r.amount) };
  }
}

function neededKpi(r: RequisitionView): RecordKpi {
  if (!r.neededBy) return { label: "Needed by", value: "—", note: "No day set" };
  const value = formatShortDay(`${r.neededBy}T12:00:00Z`);
  if (!unpaid(r)) return { label: "Needed by", value, note: "" };
  const days = daysFromToday(r.neededBy);
  if (days === 0) return { label: "Needed by", value, lead: "Today", leadTone: "warn", note: "" };
  if (days < 0) return { label: "Needed by", value, lead: String(-days), leadTone: "bad", note: -days === 1 ? "day ago" : "days ago" };
  return { label: "Needed by", value, lead: String(days), leadTone: days <= 3 ? "warn" : "plain", note: days === 1 ? "day" : "days" };
}

function cashKpi(r: RequisitionView): RecordKpi {
  if (!r.payFrom) return { label: "Cash at hand", value: "—", note: "No account chosen" };
  const left = r.payFrom.balance - (unpaid(r) ? r.shown : 0);
  return {
    label: "Cash at hand",
    value: formatMoney(r.payFrom.balance, r.currency),
    lead: formatMoney(left, r.currency),
    leadTone: left < 0 ? "bad" : "plain",
    note: unpaid(r) ? "left after this" : "left now",
  };
}

function kpis(r: RequisitionView): RecordKpi[] {
  if (r.order) {
    return [
      { label: "Asked for", value: money(r, r.amount), lead: r.order.poNo, leadTone: "plain", note: r.order.supplier },
      { label: "In the order", value: formatMoney(r.order.total), lead: String(r.order.units), leadTone: "plain", note: "units, with VAT" },
      cashKpi(r),
      { label: "Spent on stock", value: formatMoney(r.figures.spentThisMonth), note: "this month" },
      neededKpi(r),
    ];
  }
  const type = r.expenseType?.name ?? "expenses";
  return [
    { label: "Asked for", value: money(r, r.amount), note: r.expenseType?.name ?? "" },
    { label: "Pay to", value: r.payee?.name ?? "—", note: r.quote ? "Quote" : "No quote" },
    cashKpi(r),
    { label: `Spent on ${type.toLowerCase()}`, value: formatMoney(r.figures.spentThisMonth), note: "this month" },
    neededKpi(r),
  ];
}

export const REQUISITION_RANGES = [
  { key: "3m", label: "3 months" },
  { key: "12m", label: "12 months" },
  { key: "all", label: "All time" },
];

function chart(r: RequisitionView, range: string | null): RecordChart {
  const all = r.chart;
  const months = range === "3m" ? all.slice(-3) : range === "all" ? all : all.slice(-12);
  const newestYear = months.at(-1)?.month.slice(0, 4) ?? "";
  return {
    title: "Money asked for, by month",
    unit: r.order ? "stock purchases" : (r.expenseType?.name ?? "expenses").toLowerCase(),
    bars: months.map((month) => {
      const name = formatShortMonth(month.month);
      const label = month.month.slice(0, 4) === newestYear ? name : `${name} ${month.month.slice(0, 4)}`;
      return { label, tick: name, value: month.value, text: formatMoney(month.value) };
    }),
    tick: (value) => (value === 0 ? "0" : formatMoney(value).replace(/\.00$/, "")),
  };
}

function primary(r: RequisitionView): RecordAction | null {
  if (r.status === "SUBMITTED" && r.can.approve) {
    return {
      key: "approve",
      label: `Approve ${money(r, r.amount)}`,
      requires: [APPROVE],
      do: { post: { url: `${API}/${r.id}/approve`, body: {}, done: approvedWords(r.amount, r.currency, r.asker.firstName, r.asker.pays) } },
    };
  }
  if (r.status === "APPROVED" && r.can.payOut) {
    return { key: "payout", label: "Pay out", requires: [UPDATE], do: { sheet: "req-payout", id: r.id } };
  }
  if (r.status === "DISBURSED" && r.can.acquit) {
    return { key: "acquit", label: "Account for it", requires: [CREATE, UPDATE], do: { sheet: "req-acquit", id: r.id } };
  }
  if (r.status === "REJECTED" && r.can.askAgain) {
    return { key: "again", label: "Change and ask again", requires: [CREATE], do: { sheet: "req-new", params: { from: r.id, for: r.for } } };
  }
  return null;
}

function rail(r: RequisitionView): RailGroup[] {
  const asked = new Date(r.askedAt);
  const forRow = r.order
    ? { key: "for", label: "For", value: `Order ${r.order.poNo}`, links: [{ label: `Order ${r.order.poNo}`, href: `/retail/buying/orders/${r.order.id}` }] }
    : { key: "for", label: "For", value: r.expenseType?.name ?? "—" };
  const payee = r.order
    ? { key: "to", label: "Pay to", value: `${r.order.supplier}, on delivery` }
    : {
        key: "to",
        label: "Pay to",
        value: r.payee?.name ?? "Add",
        muted: !r.payee,
        ...(r.can.update
          ? {
              edit: {
                field: "payToId",
                type: "auto" as const,
                initial: r.payee?.id ?? "",
                lookup: { noun: "payee", picked: r.payee ? { id: r.payee.id, label: r.payee.name } : null },
                parse: (value: string) => value || null,
                requires: CREATE,
              },
            }
          : {}),
      };
  const receiptDue =
    r.status === "ACQUITTED" && r.payout.acquittedAt
      ? `Came ${noYear(dayKey(new Date(r.payout.acquittedAt)))}`
      : r.receiptsDueAt
        ? noYear(dayKey(new Date(r.receiptsDueAt)))
        : "3 days after paying";
  const paid = r.status === "DISBURSED" || r.status === "ACQUITTED";
  return [
    {
      title: "Request",
      rows: [
        { key: "asker", label: "Asked by", value: r.asker.name },
        { key: "asked", label: "Asked", value: `${formatDay(asked)}, ${formatTime(asked)}`, mono: true },
        forRow,
        { key: "purpose", label: "Purpose", value: r.order ? "Stock purchase" : (r.expenseType?.name ?? "—") },
        ...(r.why ? [{ key: "why", label: "Why", value: r.why }] : []),
        ...(r.quote ? [{ key: "quote", label: "Quote", value: r.quote.name, links: [{ label: r.quote.name, href: r.quote.url }] }] : []),
      ],
    },
    {
      title: "Money",
      rows: [
        {
          key: "amount",
          label: "Amount",
          value: money(r, r.shown),
          mono: true,
          ...(r.can.update
            ? { edit: { field: "amount", type: "money" as const, initial: r.amount.toFixed(2), parse: (value: string) => value.replace(/,/g, "").trim(), requires: CREATE } }
            : {}),
        },
        { key: "currency", label: "Currency", value: currencyRailWords(r.currency, r.payout.method) },
        {
          key: "from",
          label: paid ? "Paid from" : "Pay from",
          value: r.payFrom?.name ?? "Add",
          muted: !r.payFrom,
          ...(r.can.updatePayFrom
            ? {
                edit: {
                  field: "payFromId",
                  type: "auto" as const,
                  initial: r.payFrom?.id ?? "",
                  lookup: { noun: "money account", picked: r.payFrom ? { id: r.payFrom.id, label: r.payFrom.name } : null },
                  parse: (value: string) => value || undefined,
                  requires: CREATE,
                },
              }
            : {}),
        },
        payee,
        ...(paid && r.payout.to ? [{ key: "paidTo", label: "Paid to", value: r.payout.to.name }] : []),
        ...(r.payout.reference ? [{ key: "ref", label: "Reference", value: r.payout.reference, mono: true }] : []),
        ...(r.status === "ACQUITTED" && r.payout.change
          ? [{ key: "change", label: "Change back", value: `${money(r, r.payout.change)}${r.payout.changeInto ? `, in ${r.payout.changeInto}` : ""}` }]
          : []),
      ],
    },
    {
      title: "Approval",
      hint: false,
      rows: [
        { key: "approver", label: "Approver", value: r.approver.over ? `${r.approver.name}, owner` : "Any manager" },
        { key: "needs", label: "Needs approval", value: `${r.approver.over ? "Over" : "Under"} ${formatMoney(r.limit)}` },
        ...(r.decidedBy && (r.status === "APPROVED" || r.status === "REJECTED" || r.status === "DISBURSED" || r.status === "ACQUITTED")
          ? [{ key: "decided", label: r.status === "REJECTED" ? "Rejected by" : "Approved by", value: r.decidedBy }]
          : []),
        ...(r.rejectReason ? [{ key: "reason", label: "Why not", value: r.decisionNote ? `${r.rejectReason}: ${r.decisionNote}` : r.rejectReason }] : []),
        { key: "receipt", label: "Receipt due", value: receiptDue },
      ],
    },
  ];
}

export const requisitionKind: RecordKind<RequisitionView> = {
  type: "CrmRequisition",
  back: { label: "Requisitions", href: "/retail/buying/requisitions" },
  queryKey: (id) => ["retail-requisition", id],
  load: async (id) => (await fetchJson<{ data: RequisitionView }>(`${API}/${id}`)).data,
  endpoint: (id) => `${API}/${id}`,
  title: (r) => r.purpose,
  reference: (r) => r.requisitionNo,
  actions: (r) => [
    ...(r.can.approveLess ? [{ key: "less", label: "Approve a different amount", requires: [APPROVE], do: { sheet: "req-approve", id: r.id } }] : []),
    ...(r.can.reject ? [{ key: "reject", label: "Reject", requires: [APPROVE], do: { sheet: "req-reject", id: r.id } }] : []),
    ...(r.can.ask ? [{ key: "ask", label: "Ask a question", requires: [APPROVE], do: { sheet: "req-question", id: r.id } }] : []),
    ...(r.can.answer ? [{ key: "answer", label: `Answer ${firstName(r.questionFrom)}`, requires: [CREATE], do: { sheet: "req-question", id: r.id } }] : []),
  ],
  more: (r) => [
    { key: "pdf", label: "Export as PDF", requires: [], do: { download: pdfOf(r) } },
    ...(r.status !== "ACQUITTED" && r.status !== "CANCELLED" && r.status !== "REJECTED"
      ? [{ key: "sign", label: "Print for signing", requires: [], do: { open: `${pdfOf(r)}?sign=1` } }]
      : []),
    ...(r.can.payOut ? [{ key: "payout", label: "Pay out", requires: [UPDATE], do: { sheet: "req-payout", id: r.id } }] : []),
    ...(r.can.acquit ? [{ key: "acquit", label: "Account for it", requires: [CREATE, UPDATE], do: { sheet: "req-acquit", id: r.id } }] : []),
    ...(r.can.cancel
      ? [
          {
            key: "cancel",
            label: "Cancel the requisition",
            tone: "bad" as const,
            requires: [CREATE, UPDATE],
            do: {
              post: {
                url: `${API}/${r.id}/cancel`,
                ask: cancelRequisitionAsk({
                  ref: r.requisitionNo,
                  amount: r.shown,
                  currency: r.currency,
                  orderRef: r.order?.poNo ?? null,
                  whatFor: r.order ? null : r.purpose.charAt(0).toLowerCase() + r.purpose.slice(1),
                  asker: r.asker.name,
                  byAsker: r.mine,
                  approver: r.status === "APPROVED" ? r.decidedBy : r.approver.over ? r.approver.name : null,
                }),
                done: `${r.requisitionNo} cancelled.`,
              },
            },
          },
        ]
      : []),
  ],
  primary,
  steps: (r) => r.steps,
  chips: (r) => {
    const chips: RecordChip[] = [{ label: r.order ? "Stock purchase" : (r.expenseType?.name ?? "Expense"), tone: "plain" }];
    const needed = neededChip(r);
    if (needed) chips.push(needed);
    if (r.receiptsOverdue) chips.push({ label: "Receipt overdue", tone: "bad" });
    if (r.status === "REJECTED") chips.push({ label: "Rejected", tone: "plain" });
    if (r.status === "CANCELLED") chips.push({ label: "Cancelled", tone: "plain" });
    return chips;
  },
  figure,
  kpis,
  chartRanges: { options: REQUISITION_RANGES, initial: "12m" },
  chart,
  tabs: [
    {
      key: "lines",
      label: "What it pays for",
      source: "retail-order-lines",
      parent: "orderId",
      parentId: (r) => r.order?.id ?? null,
      requires: ORDER_VIEW,
      when: (r) => r.order !== null,
      columns: ["product", { key: "ordered", label: "Quantity" }, "cost", "value"],
      allLink: { label: (r) => `Open order ${r.order?.poNo ?? ""}`, href: (r) => (r.order ? `/retail/buying/orders/${r.order.id}` : null) },
    },
    { key: "approvals", label: "Approvals", source: "retail-requisition-approvals", parent: "requisitionId" },
    { key: "receipts", label: "Receipts", source: "retail-requisition-receipts", parent: "requisitionId" },
    { key: "activity", label: "Activity" },
  ],
  rail,
  invalidates: [["list", "retail-requisitions"], ["list", "retail-requisition-approvals"], ["list", "retail-requisition-receipts"], ["retail-order"], ["list", "retail-orders"], ["nav-badges"], ["lookup", "order"]],
};
