import type { RequisitionView } from "@/lib/retail/buying/requisition-view";
import type { AskContext } from "@/lib/retail/buying/requisitions";
import { firstName, limitNote, REJECT_REASONS } from "@/lib/retail/buying/requisition-words";
import { formatCount, formatMoney } from "@/lib/workspace/format";
import type { PickedOption, SheetCtx, SheetKind, SheetRequest, SheetValues } from "@/lib/workspace/sheet-kind";

/**
 * Buying's requisition sheets (40-buying 5.18–5.21, BUY-04): Ask for money
 * (an order or an expense, or again from a rejected one), Approve a different
 * amount, Reject (one, or the ticked ones), and Ask a question (or answer it).
 * All talk to `/api/v2/retail/buying/requisitions`.
 */

const API = "/api/v2/retail/buying/requisitions";
const SUB = "Buying › Requisitions";
const STEPS = ["Asked", "Approved", "Paid out", "Accounted for"];
const FOR = ["An order", "An expense"] as const;

const invalidateRequisitions = [
  ["list", "retail-requisitions"],
  ["list", "retail-requisition-approvals"],
  ["retail-requisition"],
  ["retail-order"],
  ["list", "retail-orders"],
  ["lookup", "order"],
  ["nav-badges"],
  ["record-activity"],
];

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  const payload = (await response.json().catch(() => null)) as { error?: string; data?: T } | T | null;
  if (!response.ok) throw new Error((payload as { error?: string } | null)?.error ?? "That could not be read. Close it and try again.");
  return ((payload as { data?: T })?.data ?? payload) as T;
}

const one = (values: SheetValues, key: string) => (values[key] as PickedOption | null) ?? null;
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const amount = (value: unknown) => {
  const n = Number(text(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const said = (payload: unknown, fallback: string) => {
  const message = (payload as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : fallback;
};
const isOrder = (values: SheetValues) => values.purpose !== "An expense";
const idOf = (ctx: SheetCtx) => ctx.id ?? ctx.params.get("id") ?? "";
const viewOf = (id: string) => readJson<RequisitionView>(`${API}/${id}`);

/* ── 5.18 Ask for money ─────────────────────────────────────────────────── */

const contextUrl = (params: { orderId?: string | null; from?: string | null }) => {
  const search = new URLSearchParams();
  if (params.orderId) search.set("orderId", params.orderId);
  if (params.from) search.set("from", params.from);
  return `${API}/new?${search.toString()}`;
};

const orderValues = (order: AskContext["order"]): SheetValues =>
  order ? { po: { id: order.id, label: order.label, sub: order.sub }, amt: order.total.toFixed(2), by: order.expected, _total: order.total } : {};

const reqNew: SheetKind = {
  title: "Ask for money",
  sub: SUB,
  cur: "US$",
  steps: STEPS,
  at: 0,
  load: async (ctx) => {
    const context = await readJson<AskContext>(contextUrl({ orderId: ctx.params.get("orderId"), from: ctx.params.get("from") }));
    const again = context.again;
    const asked = ctx.params.get("for") === "expense" || again?.for === "expense" ? "An expense" : "An order";
    return {
      _limit: context.limit,
      _approver: context.approver,
      purpose: asked,
      from: again?.payFrom ?? context.payFrom,
      ...orderValues(context.order),
      ...(again
        ? {
            cat: again.expenseType,
            what: again.whatFor ?? "",
            amt: again.amount.toFixed(2),
            cur: again.currency,
            to: again.payTo,
            by: again.neededBy,
            why: again.why ?? "",
          }
        : {}),
    };
  },
  sections: [
    {
      fields: [
        { id: "purpose", t: "seg", l: "For", o: [...FOR], v: (ctx: SheetCtx) => (ctx.params.get("for") === "expense" ? "An expense" : "An order") },
        {
          id: "po",
          t: "auto",
          l: "Order",
          noun: "order",
          needed: "Choose the order.",
          show: (values) => isOrder(values),
          follow: async (value) => {
            const picked = value as PickedOption | null;
            if (!picked) return { _total: null };
            const context = await readJson<AskContext>(contextUrl({ orderId: picked.id }));
            return { ...orderValues(context.order), po: picked };
          },
        },
        { id: "cat", t: "auto", l: "Expense", noun: "expense type", needed: "Choose what kind of expense it is.", show: (values) => !isOrder(values) },
        { id: "what", t: "text", l: "What for", max: 200, needed: "Say what the money is for.", show: (values) => !isOrder(values) },
        {
          id: "amt",
          t: "money",
          l: "Amount",
          half: true,
          cur: (values) => (values.cur === "ZiG" ? "ZiG" : "US$"),
          needed: "Write the amount.",
          h: (values) => (isOrder(values) && one(values, "po") ? "The order total. Lower it to pay part now." : ""),
        },
        { id: "cur", t: "seg", l: "Currency", half: true, o: ["US$", "ZiG"], v: "US$" },
        { id: "from", t: "auto", l: "Pay from", noun: "money account", half: true, needed: "Choose where the money comes from." },
        { id: "by", t: "date", l: "Needed by", half: true, opt: true, optQuiet: true, earliest: "today", show: (values) => isOrder(values) },
        { id: "to", t: "auto", l: "Pay to", noun: "payee", half: true, opt: true, optQuiet: true, show: (values) => !isOrder(values) },
        { id: "why", t: "area", l: "Why", rows: 2, max: 1000, opt: true, optQuiet: true, show: (values) => isOrder(values) },
        {
          id: "q",
          t: "photo",
          l: "Quote",
          opt: true,
          keepFile: true,
          prompt: "Add the quote",
          accept: "image/*,application/pdf",
          upload: "/api/v2/retail/buying/attachments",
          show: (values) => !isOrder(values),
        },
      ],
    },
  ],
  note: (values) => {
    const limit = Number(values._limit ?? 0);
    if (!limit) return "";
    return limitNote({ amount: amount(values.amt), limit, approver: (values._approver as string | null) ?? null });
  },
  primary: "Submit for approval",
  submit: (values): SheetRequest => {
    const order = isOrder(values);
    return {
      method: "POST",
      url: API,
      body: {
        for: order ? "order" : "expense",
        orderId: order ? (one(values, "po")?.id ?? null) : null,
        expenseTypeId: order ? null : (one(values, "cat")?.id ?? null),
        whatFor: order ? null : text(values.what) || null,
        amount: text(values.amt).replace(/,/g, ""),
        currency: values.cur === "ZiG" ? "ZiG" : "US$",
        payFromId: one(values, "from")?.id ?? null,
        payToId: order ? null : (one(values, "to")?.id ?? null),
        neededBy: order ? text(values.by) || null : null,
        why: order ? text(values.why) || null : null,
        quote: order ? null : ((values.q as object | null) ?? null),
      },
    };
  },
  done: (_result, _values, payload) => said(payload, "Sent for approval."),
  open: (result) => {
    const id = (result as { id?: string } | null)?.id;
    return id ? `/retail/buying/requisitions/${id}` : null;
  },
  invalidate: invalidateRequisitions,
  requires: [["retail.requisitions", "create"]],
};

/* ── 5.19 Approve a different amount ────────────────────────────────────── */

const reqApprove: SheetKind = {
  title: "Approve a different amount",
  sub: (_ctx, values) => (values._no ? `${String(values._no)} · asked ${formatMoney(Number(values._asked ?? 0), String(values._currency ?? "USD"))}` : SUB),
  cur: "US$",
  steps: STEPS,
  at: 1,
  load: async (ctx) => {
    const view = await viewOf(idOf(ctx));
    return {
      _no: view.requisitionNo,
      _asked: view.amount,
      _currency: view.currency,
      _asker: view.asker.name,
      _first: view.asker.firstName,
      _whatsapp: view.whatsapp,
      amt: view.amount.toFixed(2),
      asked: formatMoney(view.amount, view.currency),
    };
  },
  sections: [
    {
      fields: [
        { id: "amt", t: "money", l: "Approve", half: true, cur: (values) => (values._currency === "ZWG" ? "ZiG" : "US$"), needed: "Write the amount." },
        { id: "asked", t: "read", l: "Asked for", half: true, mono: true, right: true },
        { id: "why", t: "area", l: "Tell them why", lw: (values) => `Tell ${String(values._first ?? "them")} why`, rows: 3, max: 1000, needed: "Say why." },
      ],
    },
  ],
  note: (values) => (values._asker ? `${String(values._asker)} is told ${values._whatsapp ? "on WhatsApp and in the app" : "in the app"}.` : ""),
  primary: (values) => `Approve ${formatMoney(amount(values.amt), String(values._currency ?? "USD"))}`,
  submit: (values, ctx) => ({ method: "POST", url: `${API}/${idOf(ctx)}/approve`, body: { amount: text(values.amt).replace(/,/g, ""), note: text(values.why) || null } }),
  done: (_result, _values, payload) => said(payload, "Approved."),
  invalidate: invalidateRequisitions,
  requires: [["retail.requisitions", "approve"]],
};

/* ── 5.20 Reject (one, or the ticked ones) ──────────────────────────────── */

const idsOf = (ctx: SheetCtx) => (ctx.params.get("ids") ?? "").split(",").filter(Boolean);

const reqReject: SheetKind = {
  title: (ctx, values) => {
    const ids = idsOf(ctx);
    if (ids.length > 1) return `Reject ${formatCount(ids.length)} requisitions`;
    return values._no ? `Reject ${String(values._no)}` : "Reject";
  },
  sub: (_ctx, values) => String(values._sub ?? SUB),
  cur: "US$",
  load: async (ctx) => {
    const ids = idsOf(ctx);
    const views = await Promise.all((ids.length ? ids : [idOf(ctx)]).map((id) => viewOf(id)));
    const bulk = ids.length > 1;
    const total = views.reduce((sum, view) => sum + (view.currency === "USD" ? view.amount : 0), 0);
    const first = views[0];
    return {
      _bulk: bulk,
      _no: first?.requisitionNo ?? "",
      _first: bulk ? null : (first?.asker.firstName ?? null),
      _sub: bulk
        ? `${views.map((view) => view.requisitionNo).join(", ")} · ${formatMoney(total)}`
        : first
          ? `${first.purpose} · ${formatMoney(first.amount, first.currency)}`
          : SUB,
    };
  },
  sections: [
    {
      fields: [
        { id: "why", t: "seg", l: "Why", o: [...REJECT_REASONS], needed: "Choose why." },
        {
          id: "msg",
          t: "area",
          l: "Tell them",
          lw: (values) => (values._bulk ? "Tell them" : `Tell ${String(values._first ?? "them")}`),
          rows: 3,
          max: 1000,
          opt: true,
          optQuiet: true,
        },
      ],
    },
  ],
  note: (values) => (values._bulk ? "Each can change theirs and ask again." : `${String(values._first ?? "They")} can change it and ask again.`),
  primary: (values) => (values._bulk ? "Reject all" : "Reject"),
  submit: (values, ctx) => {
    const ids = idsOf(ctx);
    const body = { reason: text(values.why), message: text(values.msg) || null };
    return ids.length > 1 ? { method: "POST", url: `${API}/bulk/reject`, body: { ...body, ids } } : { method: "POST", url: `${API}/${ids[0] ?? idOf(ctx)}/reject`, body };
  },
  done: (_result, _values, payload) => said(payload, "Rejected."),
  doneWarn: (result) => Array.isArray((result as { skipped?: unknown[] } | null)?.skipped) && ((result as { skipped: unknown[] }).skipped.length > 0),
  invalidate: invalidateRequisitions,
  requires: [["retail.requisitions", "approve"]],
};

/* ── 5.21 Ask a question, or answer it ──────────────────────────────────── */

const reqQuestion: SheetKind = {
  title: (_ctx, values) => (values._answer ? `Answer ${String(values._to ?? "them")}` : `Ask ${String(values._to ?? "them")} a question`),
  sub: (_ctx, values) => (values._no ? `${String(values._no)} · ${String(values._purpose ?? "")}` : SUB),
  cur: "US$",
  load: async (ctx) => {
    const view = await viewOf(idOf(ctx));
    const answer = view.asker.id === ctx.user.id;
    return {
      _no: view.requisitionNo,
      _purpose: view.purpose,
      _answer: answer,
      _to: answer ? firstName(view.questionFrom ?? view.approver.name) : view.asker.firstName,
      _toFull: answer ? (view.questionFrom ?? view.approver.name) : view.asker.name,
      _whatsapp: view.whatsapp,
    };
  },
  sections: [{ fields: [{ id: "q", t: "area", l: "Question", lw: (values) => (values._answer ? "Answer" : "Question"), rows: 3, max: 500, needed: "Write it." }] }],
  note: (values) => `${String(values._toFull ?? "They")} ${values._whatsapp ? "gets it on WhatsApp and in the app" : "gets it in the app"}. It stays on the requisition.`,
  primary: "Send",
  submit: (values, ctx) => ({ method: "POST", url: `${API}/${idOf(ctx)}/question`, body: { message: text(values.q) } }),
  done: (_result, _values, payload) => said(payload, "Sent."),
  invalidate: invalidateRequisitions,
  requires: [
    ["retail.requisitions", "approve"],
    ["retail.requisitions", "create"],
  ],
};

export const REQUISITION_SHEETS: Record<string, SheetKind> = {
  "req-new": reqNew,
  "req-approve": reqApprove,
  "req-reject": reqReject,
  "req-question": reqQuestion,
};
