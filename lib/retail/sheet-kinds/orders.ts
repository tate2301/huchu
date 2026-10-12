import type { OrderView } from "@/lib/retail/buying/order-view";
import type { Suggestion } from "@/lib/retail/buying/suggest";
import { firstWord, orderStateWords, PAYMENT_OF, PAYING, PAYING_WORD, SEND_LABEL, sentWords, tellNote, termsNote, type OrderChannel } from "@/lib/retail/buying/words";
import { formatMoney } from "@/lib/workspace/format";
import type { PickedOption, SheetCtx, SheetKind, SheetLine, SheetRequest, SheetValues } from "@/lib/workspace/sheet-kind";

/**
 * Buying's order sheets (40-buying 5.15, 5.16): New order — the supplier's
 * suggested lines, where and when, how it is paid, sent or saved as a draft;
 * stepping through ticked suppliers with `supplierIds` — and Edit an order,
 * telling the supplier or not. Both talk to `/api/v2/retail/buying/orders`.
 */

const API = "/api/v2/retail/buying";
const SUB = "Buying › Orders";

const invalidateOrders = [["list", "retail-orders"], ["retail-order"], ["list", "retail-order-lines"], ["list", "retail-order-messages"], ["nav-badges"], ["retail-supplier"], ["lookup", "order"], ["record-activity"]];

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  const payload = (await response.json().catch(() => null)) as { error?: string; data?: T } | T | null;
  if (!response.ok) throw new Error((payload as { error?: string } | null)?.error ?? "That could not be read. Close it and try again.");
  return ((payload as { data?: T })?.data ?? payload) as T;
}

const one = (values: SheetValues, key: string) => (values[key] as PickedOption | null) ?? null;
const linesOf = (values: SheetValues) => (Array.isArray(values.lines) ? (values.lines as SheetLine[]) : []);
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const amount = (value: string) => {
  const n = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

/** The lines' total with VAT, roughly as the server makes it (VAT a line at its product's rate). */
function totalWithVat(values: SheetValues): number {
  const rates = (values._vat as Record<string, number> | undefined) ?? {};
  return linesOf(values).reduce((sum, line) => {
    const net = Math.round(amount(line.quantity) * amount(line.cost) * 100) / 100;
    return sum + net + Math.round(net * (rates[line.productId] ?? 0)) / 100;
  }, 0);
}

/** The values a supplier's suggestions bring: when, where, the lines, the note's terms and the channel. */
function fromSuggestion(suggestion: Suggestion): SheetValues {
  return {
    sup: { id: suggestion.supplier.id, label: suggestion.supplier.name, sub: null },
    exp: suggestion.expected,
    site: { id: suggestion.site.id, label: suggestion.site.name, sub: null },
    lines: suggestion.lines.map(
      (line): SheetLine => ({
        productId: line.productId,
        name: line.name,
        sub: line.sub,
        warn: line.warn,
        quantity: String(line.quantity),
        cost: line.cost.toFixed(2),
      }),
    ),
    pay: suggestion.supplier.payTermsDays === null ? PAYING_WORD.CASH_ON_DELIVERY : PAYING_WORD.ON_ACCOUNT,
    _lead: suggestion.supplier.leadTimeDays,
    _terms: { name: suggestion.supplier.name, payTermsDays: suggestion.supplier.payTermsDays, minimum: suggestion.supplier.minimumOrder },
    _channel: suggestion.channel,
    _suggested: suggestion.lines.length,
    _vat: Object.fromEntries(suggestion.lines.map((line) => [line.productId, line.vatRate])),
  };
}

function suggestionUrl(
  supplierId: string,
  params: { siteId?: string | null; productIds?: string | null; lineIds?: string | null; quantity?: string | null },
): string {
  const search = new URLSearchParams();
  if (params.siteId) search.set("siteId", params.siteId);
  if (params.productIds) search.set("productIds", params.productIds);
  if (params.lineIds) search.set("lineIds", params.lineIds);
  if (params.quantity) search.set("quantity", params.quantity);
  return `${API}/suppliers/${supplierId}/suggestions?${search.toString()}`;
}

function raiseRequest(values: SheetValues, send: boolean): SheetRequest {
  return {
    method: "POST",
    url: `${API}/orders`,
    body: {
      supplierId: one(values, "sup")?.id ?? "",
      siteId: one(values, "site")?.id ?? "",
      expectedDate: text(values.exp) || null,
      lines: linesOf(values).map((line) => ({ productId: line.productId, quantity: line.quantity.trim(), unitCost: line.cost.trim() || "0" })),
      payment: PAYMENT_OF[(values.pay as (typeof PAYING)[number]) ?? "On account"] ?? "ON_ACCOUNT",
      noteToSupplier: text(values.msg) || null,
      send,
    },
  };
}

type Raised = { data: OrderView; message: string | null; sentVia: OrderChannel | null };

/* ── 5.15 New order ─────────────────────────────────────────────────────── */

const orderNew: SheetKind = {
  title: "New order",
  sub: SUB,
  wide: true,
  cur: "US$",
  stepping: { param: "supplierIds" },
  load: async (ctx: SheetCtx) => {
    const supplierId = ctx.step?.id ?? ctx.params.get("supplierId");
    const productIds = ctx.params.get("productIds");
    const lineIds = ctx.params.get("lineIds");
    if (!supplierId && !productIds && !lineIds) return {};
    try {
      const suggestion = await readJson<Suggestion>(suggestionUrl(supplierId ?? "auto", { productIds, lineIds, quantity: ctx.params.get("quantity") }));
      return fromSuggestion(suggestion);
    } catch {
      // None of the products names a supplier: the person picks one, and the products stay asked for.
      return {};
    }
  },
  sections: [
    {
      fields: [
        {
          id: "sup",
          t: "auto",
          l: "Supplier",
          noun: "supplier",
          needed: "Choose who you are ordering from.",
          follow: async (value, values) => {
            const picked = value as PickedOption | null;
            if (!picked) return { lines: [], _terms: null, _lead: null, _channel: null, _suggested: 0 };
            const suggestion = await readJson<Suggestion>(suggestionUrl(picked.id, { siteId: one(values, "site")?.id ?? null }));
            return { ...fromSuggestion(suggestion), sup: picked };
          },
        },
        {
          id: "exp",
          t: "date",
          l: "Expected",
          half: true,
          opt: true,
          optQuiet: true,
          earliest: "today",
          h: (values) => {
            const lead = values._lead as number | null | undefined;
            return lead === null || lead === undefined ? "" : `From their lead time: ${lead} ${lead === 1 ? "day" : "days"}.`;
          },
        },
        {
          id: "site",
          t: "auto",
          l: "Deliver to",
          noun: "site",
          half: true,
          needed: "Choose where it is delivered.",
          follow: async (value, values) => {
            const supplier = one(values, "sup");
            const site = value as PickedOption | null;
            if (!supplier || !site) return null;
            const suggestion = await readJson<Suggestion>(suggestionUrl(supplier.id, { siteId: site.id }));
            return { lines: fromSuggestion(suggestion).lines, _suggested: suggestion.lines.length };
          },
        },
      ],
    },
    {
      title: "Lines",
      fields: [
        {
          id: "lines",
          t: "lines",
          l: "Lines",
          noun: "product",
          ql: "Quantity",
          cl: "Cost",
          p: "Add a product: search, scan, or add a new one",
          opt: true,
          optQuiet: true,
          nolabel: true,
          h: (values) => {
            const supplier = one(values, "sup");
            if (!supplier) return "";
            const short = firstWord(supplier.label);
            return Number(values._suggested ?? 0) > 0
              ? `Suggested from what is low and what you usually buy from ${short}. Change any quantity.`
              : `Nothing is low. Add what you want from ${short}.`;
          },
        },
      ],
    },
    {
      title: "Paying and sending",
      fields: [
        { id: "pay", t: "seg", l: "Paying", o: [...PAYING], v: PAYING_WORD.ON_ACCOUNT },
        { id: "msg", t: "area", l: "Note to the supplier", opt: true, rows: 2, max: 500, p: "Deliveries at the back door before 10:00" },
      ],
    },
  ],
  note: (values) => {
    const terms = values._terms as { name: string; payTermsDays: number | null; minimum: number | null } | null | undefined;
    if (!terms) return "";
    return termsNote({ supplier: terms.name, payTermsDays: terms.payTermsDays, minimum: terms.minimum, totalWithVat: totalWithVat(values), money: formatMoney }).text;
  },
  primary: (values) => SEND_LABEL[(values._channel as OrderChannel | null | undefined) ?? "BY_HAND"],
  alt: {
    label: "Save as draft",
    submit: (values) => raiseRequest(values, false),
    done: (_result, _values, payload) => (payload as Raised).message ?? "Saved as a draft.",
  },
  submit: (values) => raiseRequest(values, true),
  done: (result, values) => {
    const order = result as OrderView;
    return sentWords(order.poNo, order.supplier.name, (values._channel as OrderChannel | null | undefined) ?? "BY_HAND");
  },
  // "Save and print": the order's PDF opens to print.
  newTab: {
    when: (values) => ((values._channel as OrderChannel | null | undefined) ?? "BY_HAND") === "BY_HAND",
    href: (result) => `/api/v2/retail/records/RetailPurchaseOrder/${(result as OrderView).id}/pdf?print=1`,
  },
  open: (result) => `/retail/buying/orders/${(result as OrderView).id}`,
  invalidate: invalidateOrders,
  requires: [["retail.purchasing", "create"]],
};

/* ── 5.16 Edit an order ─────────────────────────────────────────────────── */

const orderOf = async (ctx: SheetCtx) => readJson<OrderView>(`${API}/orders/${ctx.id ?? ctx.params.get("id") ?? ""}`);

function editRequest(ctx: SheetCtx, values: SheetValues, tell: boolean): SheetRequest {
  const site = one(values, "site");
  return {
    method: "PATCH",
    url: `${API}/orders/${ctx.id ?? ctx.params.get("id") ?? ""}`,
    body: {
      expectedDate: text(values.exp) || null,
      ...(site && values._siteOpen ? { siteId: site.id } : {}),
      lines: linesOf(values).map((line) => ({
        ...(line.lineId ? { id: line.lineId } : {}),
        productId: line.productId,
        quantity: line.quantity.trim(),
        unitCost: line.cost.trim() || "0",
      })),
      tell,
    },
  };
}

const orderEdit: SheetKind = {
  title: (_ctx, values) => (values._poNo ? `Edit ${String(values._poNo)}` : "Edit the order"),
  sub: (_ctx, values) => (values._supplier ? `${String(values._supplier)} · ${String(values._state)}` : SUB),
  wide: true,
  cur: "US$",
  load: async (ctx) => {
    const order = await orderOf(ctx);
    return {
      _poNo: order.poNo,
      _supplier: order.supplier.name,
      _state: orderStateWords(order.status, order.late?.days ?? null),
      _draft: order.status === "DRAFT",
      _channel: order.channel,
      _siteOpen: order.siteOpen,
      exp: order.expectedDate,
      site: { id: order.site.id, label: order.site.name, sub: null },
      lines: order.lines.map(
        (line): SheetLine => ({
          productId: line.productId ?? line.id,
          lineId: line.id,
          name: line.name,
          sub: line.received > 0 ? `${line.received} delivered` : line.category,
          quantity: String(line.quantity),
          cost: line.unitCost.toFixed(2),
          ...(line.received > 0 ? { keep: `${line.received} ${line.received === 1 ? "has" : "have"} come` } : {}),
        }),
      ),
    };
  },
  sections: [
    {
      fields: [
        { id: "exp", t: "date", l: "Expected", half: true, opt: true, optQuiet: true, earliest: "today" },
        { id: "site", t: "auto", l: "Deliver to", noun: "site", half: true, readWhen: (values) => !values._siteOpen },
      ],
    },
    {
      title: "Lines",
      fields: [
        {
          id: "lines",
          t: "lines",
          l: "Lines",
          noun: "product",
          ql: "Ordered",
          cl: "Cost",
          p: "Add a product: search, scan, or add a new one",
          nolabel: true,
          opt: true,
          optQuiet: true,
          h: "A line cannot go below what was delivered. To drop what is left, set it to what came.",
        },
      ],
    },
  ],
  note: (values) => (values._draft ? "" : tellNote(String(values._supplier ?? ""), (values._channel as OrderChannel | undefined) ?? "BY_HAND")),
  primary: (values) => (values._draft ? "Save" : `Save and tell ${firstWord(String(values._supplier ?? "them"))}`),
  alt: {
    label: "Save without telling them",
    show: (values) => !values._draft,
    submit: (values, ctx) => editRequest(ctx, values, false),
    done: (_result, _values, payload) => String((payload as { message?: string }).message ?? "Changed."),
  },
  submit: (values, ctx) => editRequest(ctx, values, !values._draft),
  done: (_result, _values, payload) => String((payload as { message?: string }).message ?? "Changed."),
  invalidate: invalidateOrders,
  requires: [["retail.purchasing", "update"]],
};

export const ORDER_SHEETS: Record<string, SheetKind> = {
  "order-new": orderNew,
  "order-edit": orderEdit,
};
