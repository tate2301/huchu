import { fetchJson } from "@/lib/api-client";
import { approvalWarn } from "@/lib/retail/approver-words";
import { sentWords } from "@/lib/retail/asks";
import type { SaleView } from "@/lib/retail/floor/sale-view";
import { OWN_DRAWER, SIGN_OFF_CARDS, signOffCounted, signOffDay, signOffDifference, signOffDone, signOffTitle } from "@/lib/retail/floor/sign-off-words";
import type { ShiftRecordView } from "@/lib/retail/shift-record";
import { floatAmount, shiftOpenedSentence } from "@/lib/retail/shift-open-rules";
import { formatMoney, formatTime, todayIn, dayKey, formatMediumDay } from "@/lib/workspace/format";
import type { PickedOption, SheetCtx, SheetKind, SheetValues } from "@/lib/workspace/sheet-kind";

/**
 * The floor's sheets. `shift-open` is the reference sheet (00-foundations
 * 5.7.8, `K.shiftopen`): a manager opening a drawer for a cashier.
 */

type OpenedShift = { id: string; shiftNo: string; registerName: string; cashierName: string };

type OpeningDefaults = { float: string; hint: string; takesZig: boolean; zigFloat: string };

const shiftOpen: SheetKind = {
  title: "Open a shift",
  sub: "The floor › Shifts",
  cur: "US$",
  sections: [
    {
      fields: [
        {
          id: "till",
          t: "auto",
          l: "Till",
          noun: "till",
          // FLR-03: the float the till's last close left, and whether the shop counts a ZiG float.
          follow: async (value) => {
            const picked = (value as PickedOption | null) ?? null;
            if (!picked) return { _hint: "Counted in.", _takesZig: false };
            const answer = (await fetchJson<{ data: OpeningDefaults }>(`/api/v2/retail/shifts/new?registerId=${picked.id}`)).data;
            return { float: answer.float, zig: answer.zigFloat, _hint: answer.hint, _takesZig: answer.takesZig };
          },
        },
        {
          id: "who",
          t: "auto",
          l: "Cashier",
          noun: "person",
          context: { sells: true },
          // The signed-in person when they may sell at a till.
          v: (ctx: SheetCtx) => (ctx.can("retail.sell", "open-shift") ? { id: ctx.user.id, label: ctx.user.name } : null),
          // Someone who may only open their own sees themselves, fixed.
          fixed: (ctx) =>
            ctx.can("retail.cash-control", "open-shift")
              ? null
              : { value: { id: ctx.user.id, label: ctx.user.name }, shown: ctx.user.name },
        },
        {
          id: "float",
          t: "money",
          l: "Opening float",
          half: true,
          h: (values) => String(values._hint ?? "Counted in."),
          schema: floatAmount,
        },
        {
          id: "zig",
          t: "money",
          l: "ZiG float",
          half: true,
          cur: "ZiG",
          opt: true,
          optQuiet: true,
          show: (values) => values._takesZig === true,
          schema: floatAmount,
        },
      ],
    },
  ],
  note: "Cashiers usually open from the till with their PIN. This is for when a manager opens it for them.",
  primary: "Open it",
  done: (result) => shiftOpenedSentence(result as OpenedShift),
  open: (result) => `/retail/shifts/${(result as OpenedShift).id}`,
  submit: (values) => ({
    method: "POST",
    url: "/api/v2/retail/shifts",
    body: {
      registerId: (values.till as PickedOption).id,
      cashierId: (values.who as PickedOption).id,
      openingFloat: String(values.float).trim(),
      ...(values._takesZig === true && String(values.zig ?? "").trim() ? { openingFloatZig: String(values.zig).trim() } : {}),
    },
  }),
  invalidate: [["list", "retail-shifts"], ["retail-current-shift"], ["nav-badges"], ["lookup", "till"]],
  requires: [["retail.sell", "open-shift"]],
};

/* ── Cash in or out (50-floor W-38, CashMove board) ─────────────────────── */

const OUT = "Out of the drawer";
const IN = "Into the drawer";
/** The cards, in the board's order, without "Pay a supplier" (98-decisions C-33). */
const WHYS: Array<[label: string, sub: string, why: "DROP" | "PETTY" | "TOP_UP"]> = [
  ["Drop to the safe", "Too much cash in the drawer.", "DROP"],
  ["Petty cash", "Small spend with a slip.", "PETTY"],
  ["Float top-up", "Change is running out.", "TOP_UP"],
];
const TOP_UP = "Float top-up";
const PETTY = "Petty cash";

const whyOf = (values: SheetValues) => WHYS.find(([label]) => label === values.why)?.[2] ?? "DROP";

/**
 * The approval section: for someone who cannot approve it themselves, or once
 * the server asked. Until the load answers, who may approve is not known
 * (`_canApprove` unset), so neither the warning nor the section shows.
 */
const asksManager = (values: SheetValues) => values._canApprove === false || values._needsApprover === true;

/** The Manager PIN line: the viewer's own approval, who to ask, or nothing while the load runs. */
function managerLine(values: SheetValues): string {
  if (values._canApprove === true) return `${String(values._me ?? "")}, ${formatTime(new Date())}`;
  if (values._canApprove === false) return approvalWarn((values._approvers as string[] | undefined) ?? []);
  return "";
}

type Moved = { id: string; type: string; amount: number; currency: string; delta: number };

/**
 * "US$200.00 dropped to the safe. Drawer should hold US$1.50 plus sales.":
 * what the drawer should hold now (the answer's `expectedCash`, as the
 * board's three sentences read), plus whatever is sold from here.
 */
export function cashMovedSentence(moved: Moved, expectedCash: number): string {
  const figure = formatMoney(moved.amount, moved.currency);
  const did =
    moved.type === "DROP_TO_SAFE" ? `${figure} dropped to the safe.` : moved.type === "FLOAT_TOP_UP" ? `${figure} put in for change.` : `${figure} paid out for petty cash.`;
  return `${did} Drawer should hold ${formatMoney(expectedCash)} plus sales.`;
}

const cashMove: SheetKind = {
  title: "Cash in or out",
  sub: (_ctx, values) => String(values._sub ?? ""),
  cur: "US$",
  sections: [
    {
      fields: [
        {
          id: "dir",
          t: "seg",
          l: "Which way",
          o: [OUT, IN],
          v: OUT,
          follow: async (value, values) =>
            value === IN ? { why: TOP_UP } : values.why === TOP_UP ? { why: WHYS[0]![0] } : null,
        },
        {
          id: "why",
          t: "cards",
          l: "Why",
          nolabel: true,
          cols: 2,
          o: WHYS.map(([label, sub]): [string, string] => [label, sub]),
          v: WHYS[0]![0],
          follow: async (value) => ({ dir: value === TOP_UP ? IN : OUT }),
        },
        {
          id: "note",
          t: "text",
          l: "What for",
          p: "Cleaning materials, for example",
          max: 200,
          show: (values) => values.why === PETTY,
          needed: "Say what it was for.",
        },
        { id: "amt", t: "money", l: "Amount", half: true, cur: (values) => (values.cur === "ZiG" ? "ZiG" : "US$"), needed: "Give the amount, like 200.00." },
        { id: "cur", t: "seg", l: "Currency", o: ["US$", "ZiG"], v: "US$", half: true, show: (values) => values._takesZig === true },
        {
          id: "manager",
          t: "read",
          l: "Manager PIN",
          h: "Every movement needs one.",
          derive: managerLine,
          tone: (values) => (values._canApprove === true ? "ok" : values._canApprove === false ? "warn" : undefined),
        },
      ],
    },
    {
      title: "Manager’s approval",
      show: (values) => asksManager(values),
      fields: [
        {
          id: "approver",
          t: "auto",
          l: "Manager",
          noun: "person",
          half: true,
          context: { can: "retail.cash-control:approve" },
          needed: "Pick a manager.",
        },
        { id: "pin", t: "text", l: "PIN", mono: true, half: true, masked: true, max: 4, needed: "Type the manager’s four-digit PIN." },
      ],
    },
  ],
  note: "It shows on the shift and changes what should be in the drawer.",
  primary: "Record it",
  load: async (ctx) => {
    if (!ctx.id) throw new Error("Open this from a shift.");
    const [shift, approvers] = await Promise.all([
      fetchJson<{ data: ShiftRecordView }>(`/api/v2/retail/shifts/${ctx.id}`).then((answer) => answer.data),
      fetchJson<{ data: Array<{ id: string; name: string }> }>("/api/v2/retail/approvers?can=retail.cash-control:approve").then((answer) => answer.data),
    ]);
    if (shift.status !== "OPEN") throw new Error(`${shift.shiftNo} is closed.`);
    return {
      _sub: `${shift.registerName} · ${shift.shiftNo} · ${shift.cashierName}`,
      _takesZig: shift.takesZig,
      _canApprove: ctx.can("retail.cash-control", "approve"),
      _me: ctx.user.name,
      _approvers: approvers.map((person) => person.name),
    };
  },
  onRefused: (payload) => ((payload as { needsApprover?: boolean } | null)?.needsApprover ? { _needsApprover: true } : null),
  done: (result, _values, payload) => cashMovedSentence(result as Moved, (payload as { shift?: { expectedCash: number } }).shift?.expectedCash ?? 0),
  submit: (values, ctx) => {
    const why = whyOf(values);
    const approver = (values.approver as PickedOption | null) ?? null;
    const pin = typeof values.pin === "string" ? values.pin.trim() : "";
    return {
      method: "POST",
      url: `/api/v2/retail/shifts/${ctx.id}/cash-movements`,
      body: {
        direction: why === "TOP_UP" ? "IN" : "OUT",
        why,
        amount: String(values.amt ?? "").trim().replace(/,/g, ""),
        currency: values.cur === "ZiG" && values._takesZig === true ? "ZWG" : "USD",
        ...(why === "PETTY" ? { note: String(values.note ?? "").trim() } : {}),
        ...(asksManager(values) && approver && pin ? { approver: { userId: approver.id, pin } } : {}),
      },
    };
  },
  invalidate: [["retail-shift"], ["list", "retail-shifts"], ["reports", "retail-shift-cash"], ["record-activity"]],
  requires: [["retail.sell", "create"]],
};

/** The sale a sale sheet is over (`?id=`), with what its title and sub say. */
async function loadSale(ctx: SheetCtx) {
  if (!ctx.id) return {};
  const sale = (await fetchJson<{ data: SaleView }>(`/api/v2/retail/sales/${ctx.id}`)).data;
  const day = dayKey(new Date(sale.postedAt)) === todayIn() ? "today" : formatMediumDay(sale.postedAt);
  return {
    _saleNo: sale.saleNo,
    _sub: `${sale.till.name} · ${sale.cashier.name} · ${day} ${formatTime(sale.postedAt)}`,
    _customer: sale.customer ? { id: sale.customer.id, label: sale.customer.name } : null,
    to: sale.customer?.phone ?? "",
    customer: sale.customer ? { id: sale.customer.id, label: sale.customer.name } : null,
  };
}

/** "Send on WhatsApp" when the sale has no customer number: the number to send it to (50-floor). */
const saleSend: SheetKind = {
  title: (_ctx, values) => `Send ${String(values._saleNo ?? "the sale")} on WhatsApp`,
  sub: (_ctx, values) => String(values._sub ?? ""),
  cur: "US$",
  sections: [{ fields: [{ id: "to", t: "text", l: "WhatsApp number", p: "+263 7", mono: true, max: 40 }] }],
  note: "",
  primary: "Send",
  load: loadSale,
  done: (_result, _values, payload) => sentWords(payload as { to?: string; waiting?: boolean }),
  submit: (values, ctx) => ({
    method: "POST",
    url: `/api/v2/retail/sales/${ctx.id}/send`,
    body: { to: String(values.to ?? "").trim() },
  }),
  invalidate: [["record-activity"]],
  requires: [["retail.sell", "view"]],
};

/**
 * Add or change the customer a sale was rung for (50-floor). Built, but no
 * menu item opens it until customers land (D-5; CUS-02 switches it on).
 */
const saleCustomer: SheetKind = {
  title: (_ctx, values) =>
    values._customer ? `Change the customer on ${String(values._saleNo ?? "")}` : `Add a customer to ${String(values._saleNo ?? "the sale")}`,
  sub: (_ctx, values) => String(values._sub ?? ""),
  cur: "US$",
  sections: [{ fields: [{ id: "customer", t: "auto", l: "Customer", noun: "customer" }] }],
  note: "Points and the receipt go to them. Nothing else on the sale changes.",
  primary: (values) => (values._customer ? "Save" : "Add them"),
  load: loadSale,
  done: (_result, values) => `${(values.customer as PickedOption | null)?.label ?? "The customer"} added to ${String(values._saleNo ?? "the sale")}.`,
  submit: (values, ctx) => ({
    method: "PATCH",
    url: `/api/v2/retail/sales/${ctx.id}`,
    body: { customerId: (values.customer as PickedOption | null)?.id ?? null },
  }),
  invalidate: [["retail-sale"], ["list", "retail-sales"], ["record-activity"]],
  requires: [["retail.sell", "update"]],
};

/* ── Sign off a short or over drawer (50-floor W-40, SignOff board, FLR-05) ── */

const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] || name;

const signOff: SheetKind = {
  title: (_ctx, values) => String(values._title ?? "Sign off a drawer"),
  sub: (_ctx, values) => String(values._sub ?? ""),
  cur: "US$",
  sections: [
    {
      fields: [
        { id: "diff", t: "read", l: "Difference", mono: true, tone: "warn" },
        { id: "detail", t: "read", l: "Counted" },
        {
          id: "do",
          t: "cards",
          l: "What happens to it",
          nolabel: true,
          cols: 1,
          o: (values) =>
            SIGN_OFF_CARDS.filter((card) => card.outcome !== "RECOVER" || values._short === true).map(
              (card): [string, string] => [card.label, card.sub(String(values._first ?? "the cashier"))],
            ),
          needed: "Choose what happens to it.",
        },
        { id: "note", t: "area", l: "Note", rows: 2, maxRows: 6, opt: true, optQuiet: true },
      ],
    },
  ],
  note: (values) => (values._own === true ? OWN_DRAWER : `${String(values._first ?? "The cashier")} sees the sign-off and the note in the app.`),
  primary: "Sign off",
  primaryDisabled: (values) => values._own === true,
  load: async (ctx) => {
    if (!ctx.id) throw new Error("Open this from a shift.");
    const shift = (await fetchJson<{ data: ShiftRecordView }>(`/api/v2/retail/shifts/${ctx.id}`)).data;
    if (!shift.needsSignOff) {
      throw new Error(shift.signOff ? `${shift.shiftNo} is signed off already.` : `${shift.shiftNo} has nothing to sign off.`);
    }
    return {
      _title: signOffTitle(shift),
      _sub: [shift.shiftNo, shift.registerName, shift.cashierName, shift.closedAt ? signOffDay(shift.closedAt) : null].filter(Boolean).join(" · "),
      _short: shift.countedCash !== null && (shift.variance ?? 0) < 0,
      _first: firstNameOf(shift.cashierName),
      _cashier: shift.cashierName,
      _own: shift.cashierId === ctx.user.id && ctx.user.role !== "SUPERADMIN",
      diff: signOffDifference(shift),
      detail: signOffCounted(shift),
    };
  },
  done: (result, values) => signOffDone(result as Parameters<typeof signOffDone>[0], String(values._cashier ?? "")),
  submit: (values, ctx) => {
    const outcome = SIGN_OFF_CARDS.find((card) => card.label === values.do)?.outcome;
    const note = typeof values.note === "string" ? values.note.trim() : "";
    return {
      method: "POST",
      url: `/api/v2/retail/shifts/${ctx.id}/sign-off`,
      body: { ...(outcome ? { outcome } : {}), ...(note ? { note } : {}) },
    };
  },
  invalidate: [["retail-shift"], ["list", "retail-shifts"], ["nav-badges"], ["retail-overview"], ["record-activity"], ["reports"], ["retail-end-of-day"], ["list", "retail-days"]],
  requires: [["retail.cash-control", "approve"]],
};

export const FLOOR_SHEETS: Record<string, SheetKind> = {
  "sign-off": signOff,
  "shift-open": shiftOpen,
  "cash-move": cashMove,
  "sale-send": saleSend,
  "sale-customer": saleCustomer,
};
