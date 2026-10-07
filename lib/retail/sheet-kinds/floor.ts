import { fetchJson } from "@/lib/api-client";
import { sentWords } from "@/lib/retail/asks";
import type { SaleView } from "@/lib/retail/floor/sale-view";
import { floatAmount, shiftOpenedSentence } from "@/lib/retail/shift-open-rules";
import { formatTime, todayIn, dayKey, formatMediumDay } from "@/lib/workspace/format";
import type { PickedOption, SheetCtx, SheetKind } from "@/lib/workspace/sheet-kind";

/**
 * The floor's sheets. `shift-open` is the reference sheet (00-foundations
 * 5.7.8, `K.shiftopen`): a manager opening a drawer for a cashier.
 */

type OpenedShift = { id: string; shiftNo: string; registerName: string; cashierName: string };

const shiftOpen: SheetKind = {
  title: "Open a shift",
  sub: "The floor › Shifts",
  cur: "US$",
  sections: [
    {
      fields: [
        { id: "till", t: "auto", l: "Till", noun: "till" },
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
            ctx.can("retail.cash-control", "update")
              ? null
              : { value: { id: ctx.user.id, label: ctx.user.name }, shown: ctx.user.name },
        },
        {
          id: "float",
          t: "money",
          l: "Opening float",
          half: true,
          // No close records the float it left yet (the floor spec adds it), so
          // the hint says only what the field is.
          h: "Counted in.",
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
    },
  }),
  invalidate: [["list", "retail-shifts"], ["retail-current-shift"], ["nav-badges"], ["lookup", "till"]],
  requires: [["retail.sell", "open-shift"]],
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

export const FLOOR_SHEETS: Record<string, SheetKind> = {
  "shift-open": shiftOpen,
  "sale-send": saleSend,
  "sale-customer": saleCustomer,
};
