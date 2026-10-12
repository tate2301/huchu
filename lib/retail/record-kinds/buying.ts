import { fetchJson } from "@/lib/api-client";
import { cancelRestAsk, closeShortAsk, stopBuyingAsk } from "@/lib/retail/asks/buying";
import type { DeliveryView } from "@/lib/retail/buying/delivery-view";
import type { OrderView } from "@/lib/retail/buying/order-view";
import type { SupplierView } from "@/lib/retail/buying/supplier-view";
import { firstWord, lateWords, PAYING, PAYING_WORD, PAYMENT_OF, paysRailWords, sentWords } from "@/lib/retail/buying/words";
import { dayKey, formatCount, formatDay, formatMoney, formatShortDay, formatShortMonth, formatTime } from "@/lib/workspace/format";

import type { Grant, RailGroup, RailRow, RecordAction, RecordChart, RecordKind, RecordKpi } from "./types";

/**
 * The supplier record kind (40-buying 5.2, SupplierRecord board): who the
 * shop buys from, what it spends and owes there, and its people. Every rail
 * value changes in place for roles with `retail.suppliers:update`; empty ones
 * read "Add". A supplier is never binned: it is stopped, and says so under
 * the header with "Buy from them again". Orders, Deliveries, Bills, Payments
 * and Returns tabs, "New order", "Record a payment", "Record a bill", "Return
 * goods" and "Export statement as PDF" arrive with the units that build them.
 */

const VIEW: Grant = ["retail.suppliers", "view"];
const UPDATE: Grant = ["retail.suppliers", "update"];
const STOP: Grant = ["retail.suppliers", "delete"];

const API = "/api/v2/retail/buying/suppliers";
const ORDER_VIEW_GRANT: Grant = ["retail.purchasing", "view"];
const ORDER_CREATE_GRANT: Grant = ["retail.purchasing", "create"];
const base = (supplier: SupplierView) => `/retail/buying/suppliers/${supplier.id}`;

const PAYS = ["On delivery", "7 days", "14 days", "30 days"];

/** "3 October" — the banner leaves the year to the reader. */
const dayMonth = (iso: string) => formatDay(iso).replace(/ \d{4}$/, "");

function monthLabel(key: string, newestYear: string): string {
  const name = formatShortMonth(key);
  const year = key.slice(0, 4);
  return year === newestYear ? name : `${name} ${year}`;
}

export const SUPPLIER_RANGES = [
  { key: "3m", label: "3 months" },
  { key: "12m", label: "12 months" },
  { key: "all", label: "All time" },
];

function chart(supplier: SupplierView, range: string | null): RecordChart {
  const all = supplier.chart.months;
  const months = range === "3m" ? all.slice(-3) : range === "all" ? all : all.slice(-12);
  const newestYear = months[months.length - 1]?.month.slice(0, 4) ?? "";
  return {
    title: "Bought per month",
    unit: "US$",
    bars: months.map((month) => {
      const label = monthLabel(month.month, newestYear);
      return { label, tick: label.split(" ")[0], value: month.value, text: formatMoney(month.value) };
    }),
    tick: (value) => (value === 0 ? "0" : formatMoney(value).replace(/\.00$/, "")),
  };
}

function kpis(supplier: SupplierView): RecordKpi[] {
  const k = supplier.kpis;
  const spendDelta = k.spendDelta.text === "New this year";
  return [
    {
      label: "Spend, 12 months",
      value: formatMoney(k.spend12),
      ...(k.spend12 > 0 ? { lead: k.spendDelta.text, leadTone: k.spendDelta.tone } : {}),
      note: k.spend12 === 0 ? "Nothing delivered yet" : spendDelta ? "" : "on the 12 before",
    },
    { label: "Orders", value: formatCount(k.orders), lead: formatCount(k.openOrders), leadTone: "plain", note: "open" },
    k.onTimePct === null
      ? { label: "On time", value: "—", note: "No orders done yet" }
      : {
          label: "On time",
          value: `${k.onTimePct}%`,
          ...(k.onTimeDelta ? { lead: k.onTimeDelta.text, leadTone: k.onTimeDelta.tone } : {}),
          note: k.onTimeDelta ? "on last year" : "this year",
        },
    k.fillRatePct === null
      ? { label: "Fill rate", value: "—", note: "No deliveries yet" }
      : {
          label: "Fill rate",
          value: `${k.fillRatePct}%`,
          lead: formatCount(k.unitsShortThisYear),
          leadTone: k.unitsShortThisYear > 0 ? "warn" : "plain",
          note: `${k.unitsShortThisYear === 1 ? "unit" : "units"} short this year`,
        },
    k.nextDue === "Nothing due"
      ? { label: "Owed", value: formatMoney(k.owed), note: "Nothing due" }
      : { label: "Owed", value: formatMoney(k.owed), lead: k.nextDue.replace(/ due$/, ""), leadTone: "plain", note: "due" },
  ];
}

/** A rail row: its value, "Add" in faint ink when there is none, edited as text. */
function textRow(key: string, label: string, value: string | null, field: string, opts: { mono?: boolean; initial?: string } = {}): RailRow {
  return {
    key,
    label,
    value: value ?? "Add",
    muted: value === null,
    mono: Boolean(opts.mono && value !== null),
    edit: {
      field,
      type: "text",
      initial: opts.initial ?? value ?? "",
      mono: opts.mono,
      parse: (typed: string) => typed.trim() || null,
      requires: UPDATE,
    },
  };
}

export const supplierKind: RecordKind<SupplierView> = {
  type: "Vendor",
  back: { label: "Suppliers", href: "/retail/buying/suppliers" },
  queryKey: (id) => ["retail-supplier", id],
  load: async (id) => (await fetchJson<{ data: SupplierView }>(`${API}/${id}`)).data,
  endpoint: (id) => `${API}/${id}`,
  title: (supplier) => supplier.name,
  reference: (supplier) => supplier.code,
  actions: (supplier) => [
    {
      key: "message",
      label: "Message on WhatsApp",
      requires: [UPDATE],
      do: { href: `${base(supplier)}?sheet=supplier-message&ids=${supplier.id}` },
    },
  ],
  primary: (supplier) =>
    supplier.stoppedAt
      ? null
      : { key: "order", label: "New order", requires: [ORDER_CREATE_GRANT], do: { sheet: "order-new", params: { supplierId: supplier.id } } },
  more: (supplier) => [
    { key: "contact", label: "Add a contact", requires: [UPDATE], do: { sheet: "contact-new", params: { supplierId: supplier.id } } },
    ...(supplier.stoppedAt
      ? []
      : [
          {
            key: "stop",
            label: "Stop buying from them",
            tone: "bad" as const,
            requires: [STOP],
            do: {
              post: {
                url: `${API}/${supplier.id}/stop`,
                ask: stopBuyingAsk(supplier.name),
                done: `You stopped buying from ${supplier.name}.`,
              },
            },
          },
        ]),
  ],
  banner: (supplier) =>
    supplier.stoppedAt
      ? {
          lead: "",
          tone: "bad",
          text: `You stopped buying from ${supplier.name} on ${dayMonth(supplier.stoppedAt)}. Orders cannot be raised to them.`,
          action: {
            label: "Buy from them again",
            post: `${API}/${supplier.id}/stop`,
            method: "DELETE",
            body: {},
            done: `You buy from ${supplier.name} again.`,
            requires: STOP,
          },
        }
      : null,
  chips: (supplier) => [
    { label: supplier.chips.pays, tone: "plain" },
    ...(supplier.chips.category ? [{ label: supplier.chips.category, tone: "plain" as const }] : []),
    ...(supplier.chips.late > 0
      ? [{ label: `${formatCount(supplier.chips.late)} ${supplier.chips.late === 1 ? "order" : "orders"} late`, tone: "bad" as const }]
      : []),
  ],
  figure: (supplier) =>
    supplier.kpis.owed < 0
      ? { label: "In credit", value: formatMoney(-supplier.kpis.owed) }
      : { label: "Owed", value: formatMoney(supplier.kpis.owed), ...(supplier.kpis.owed > 0 ? { tone: "warn" as const } : {}) },
  kpis,
  chartRanges: { options: SUPPLIER_RANGES, initial: "12m" },
  chart,
  tabs: [
    {
      key: "orders",
      label: "Orders",
      source: "retail-orders",
      parent: "supplierId",
      requires: ORDER_VIEW_GRANT,
      filters: () => ({ tab: "all" }),
      columns: ["poNo", "state", "raised", "expected", { key: "deliveredWords", label: "Delivered" }, "value"],
      allLink: {
        label: (supplier) => `All ${formatCount(supplier.kpis.orders)} ${supplier.kpis.orders === 1 ? "order" : "orders"}`,
        href: (supplier) => `/retail/buying/orders?supplier=${supplier.id}&tab=all`,
      },
    },
    {
      key: "contacts",
      label: "Contacts",
      source: "retail-supplier-contacts",
      parent: "supplier",
      requires: VIEW,
      columns: ["name", "role", "phone", "email", "sends"],
    },
    { key: "activity", label: "Activity" },
  ],
  rail: (supplier) => [
    {
      title: "Contact",
      rows: [
        {
          key: "rep",
          label: "Rep",
          value: supplier.rep?.name ?? "Add",
          muted: !supplier.rep,
          edit: {
            field: "repContactId",
            type: "auto",
            initial: supplier.rep?.id ?? "",
            lookup: { noun: "contact", picked: supplier.rep ? { id: supplier.rep.id, label: supplier.rep.name } : null, context: { supplierId: supplier.id } },
            parse: (value: string) => value || null,
            requires: UPDATE,
          },
        },
        textRow("phone", "Phone", supplier.phone, "phone", { mono: true }),
        textRow("whatsapp", "WhatsApp", supplier.whatsapp, "whatsapp", { mono: true }),
        textRow("email", "Email", supplier.email, "email"),
      ],
    },
    {
      title: "Terms",
      rows: [
        {
          key: "pays",
          label: "Pays",
          value: supplier.pays.days === null ? "On delivery" : `${supplier.pays.label} from delivery`,
          edit: { field: "pays", type: "seg", options: PAYS, initial: supplier.pays.label, requires: UPDATE },
        },
        textRow("delivers", "Delivers", supplier.deliversOn, "delivers"),
        {
          key: "minimum",
          label: "Minimum",
          value: supplier.minimumOrder === null ? "None" : `${formatMoney(supplier.minimumOrder)} an order`,
          muted: supplier.minimumOrder === null,
          mono: supplier.minimumOrder !== null,
          edit: {
            field: "minimumOrder",
            type: "money",
            initial: supplier.minimumOrder === null ? "" : supplier.minimumOrder.toFixed(2),
            parse: (typed: string) => typed.trim().replace(/,/g, "").replace(/^US\$/, "") || null,
            requires: UPDATE,
          },
        },
        textRow("lead", "Lead time", supplier.leadTime, "leadTime"),
      ],
    },
    {
      title: "Details",
      rows: [
        textRow("vat", "VAT number", supplier.vatNumber, "vatNumber", { mono: true }),
        textRow("bp", "BP number", supplier.bpNumber, "bpNumber", { mono: true }),
        // Editing shows the account as typed; reading, its last four.
        textRow("bank", "Bank", supplier.bank.masked, "bank", { mono: true, initial: supplier.bank.full ?? "" }),
      ],
    },
  ],
  invalidates: [["list", "retail-suppliers"], ["lookup", "supplier"], ["lookup", "payee"], ["reports"]],
};

/* ── An order (40-buying 5.4) ───────────────────────────────────────────── */

const ORDER_API = "/api/v2/retail/buying/orders";
const ORDER_VIEW: Grant = ["retail.purchasing", "view"];
const ORDER_CREATE: Grant = ["retail.purchasing", "create"];
const ORDER_UPDATE: Grant = ["retail.purchasing", "update"];
const ORDER_DELETE: Grant = ["retail.purchasing", "delete"];
const ORDER_RECEIVE: Grant = ["retail.purchasing", "receive"];
const DAY_MS = 86_400_000;

const REQ_CREATE: Grant = ["retail.requisitions", "create"];
/** The order's cash, from its live requisition: asked for, approved, paid out. */
const REQUISITION_CHIP = {
  SUBMITTED: { label: "Cash asked for", tone: "info" as const },
  APPROVED: { label: "Cash approved", tone: "info" as const },
  DISBURSED: { label: "Cash paid out", tone: "ok" as const },
  ACQUITTED: { label: "Cash paid out", tone: "ok" as const },
};
const pdfOf = (order: OrderView) => `/api/v2/retail/records/RetailPurchaseOrder/${order.id}/pdf`;
const isOpen = (order: OrderView) => order.status === "DRAFT" || order.status === "SENT" || order.status === "PARTIAL";
const unitWords = (n: number) => (n === 1 ? "unit" : "units");

/** Whole days from today (Harare) to a shop day: 0 today, 1 tomorrow, negative past. */
function daysFromToday(day: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${dayKey(new Date())}T00:00:00Z`)) / DAY_MS);
}

function orderExpectedKpi(order: OrderView): RecordKpi {
  const day = order.firstExpectedDate ?? order.expectedDate;
  if (!day) return { label: "Expected", value: "—", note: "No date set" };
  const value = formatShortDay(`${day}T12:00:00Z`);
  if (order.late) return { label: "Expected", value, lead: formatCount(order.late.days), leadTone: "bad", note: order.late.days === 1 ? "day late" : "days late" };
  if (order.figures.doneLateDays !== null) {
    return order.figures.doneLateDays === 0
      ? { label: "Expected", value, note: "on time" }
      : { label: "Expected", value, lead: formatCount(order.figures.doneLateDays), leadTone: "bad", note: order.figures.doneLateDays === 1 ? "day late" : "days late" };
  }
  const days = daysFromToday(order.expectedDate ?? day);
  if (days === 0) return { label: "Expected", value, note: "today" };
  if (days === 1) return { label: "Expected", value, note: "tomorrow" };
  return days > 1 ? { label: "Expected", value, lead: formatCount(days), leadTone: "plain", note: "days" } : { label: "Expected", value, note: "" };
}

function orderKpis(order: OrderView): RecordKpi[] {
  const f = order.figures;
  return [
    { label: "Ordered", value: formatCount(f.ordered), lead: formatCount(f.lines), leadTone: "plain", note: f.lines === 1 ? "line" : "lines" },
    {
      label: "Delivered",
      value: formatCount(f.delivered),
      lead: `${f.deliveredPct}%`,
      leadTone: f.deliveredPct >= 100 ? "ok" : f.delivered > 0 ? "warn" : "plain",
      note: "of the units",
    },
    { label: "Value", value: formatMoney(f.total), lead: formatMoney(f.deliveredValue), leadTone: "plain", note: "delivered" },
    order.status === "CLOSED" && f.notDelivered > 0
      ? { label: "Still to come", value: formatMoney(0), lead: formatCount(f.notDelivered), leadTone: "plain", note: `${unitWords(f.notDelivered)} not delivered` }
      : { label: "Still to come", value: formatMoney(f.stillValue), lead: formatCount(f.stillUnits), leadTone: "plain", note: unitWords(f.stillUnits) },
    orderExpectedKpi(order),
  ];
}

function orderChart(order: OrderView): RecordChart | null {
  if (order.chart.length === 0) return null;
  return {
    title: "Delivered, by line",
    unit: "% of what was ordered",
    max: 100,
    bars: order.chart.map((bar) => ({ label: bar.name, tick: bar.label, value: bar.pct, text: `${bar.pct}% delivered` })),
    tick: (value) => `${value}%`,
  };
}

function orderPrimary(order: OrderView): RecordAction | null {
  if (order.status === "DRAFT") {
    const short = firstWord(order.supplier.name);
    return {
      key: "send",
      label: `Send to ${short}`,
      requires: [ORDER_CREATE],
      do: { post: { url: `${ORDER_API}/${order.id}/send`, done: sentWords(order.poNo, order.supplier.name, order.channel) } },
    };
  }
  if (order.status === "SENT" || order.status === "PARTIAL") {
    return { key: "receive", label: "Receive a delivery", requires: [ORDER_RECEIVE], do: { href: `/retail/buying/orders/${order.id}/receive` } };
  }
  if (order.status === "CLOSED") {
    return {
      key: "reopen",
      label: "Reopen the order",
      requires: [ORDER_UPDATE],
      do: {
        post: {
          url: `${ORDER_API}/${order.id}/close`,
          method: "DELETE",
          done: `${order.poNo} reopened. ${formatCount(order.figures.notDelivered)} ${order.figures.notDelivered === 1 ? "unit is" : "units are"} expected again.`,
        },
      },
    };
  }
  return null;
}

function orderRail(order: OrderView): RailGroup[] {
  const open = isOpen(order);
  const groups: RailGroup[] = [
    {
      title: "Order",
      rows: [
        order.status === "DRAFT"
          ? {
              key: "supplier",
              label: "Supplier",
              value: order.supplier.name,
              edit: {
                field: "supplierId",
                type: "auto",
                initial: order.supplier.id,
                lookup: { noun: "supplier", picked: { id: order.supplier.id, label: order.supplier.name } },
                parse: (value: string) => value || undefined,
                requires: ORDER_UPDATE,
              },
            }
          : { key: "supplier", label: "Supplier", value: order.supplier.name, links: [{ label: order.supplier.name, href: `/retail/buying/suppliers/${order.supplier.id}` }] },
        order.siteOpen
          ? {
              key: "site",
              label: "Site",
              value: order.site.name,
              edit: {
                field: "siteId",
                type: "auto",
                initial: order.site.id,
                lookup: { noun: "site", picked: { id: order.site.id, label: order.site.name } },
                parse: (value: string) => value || undefined,
                requires: ORDER_UPDATE,
              },
            }
          : { key: "site", label: "Site", value: order.site.name },
        { key: "raised", label: "Raised", value: formatDay(order.raisedAt), mono: true },
        { key: "raisedBy", label: "Raised by", value: order.raisedBy ?? "—", muted: !order.raisedBy },
        { key: "sent", label: "Sent", value: order.sentWords, muted: !order.sentAt },
      ],
    },
    {
      title: "Money",
      rows: [
        { key: "lines", label: "Lines", value: formatMoney(order.figures.net), mono: true },
        { key: "vat", label: "VAT", value: formatMoney(order.figures.vat), mono: true },
        { key: "total", label: "Total", value: formatMoney(order.figures.total), mono: true },
        ...(order.requisition
          ? [
              {
                key: "cash",
                label: "Cash",
                value: `${order.requisition.requisitionNo}, ${formatMoney(order.requisition.amount)}`,
                links: [{ label: `${order.requisition.requisitionNo}, ${formatMoney(order.requisition.amount)}`, href: `/retail/buying/requisitions/${order.requisition.id}` }],
              },
            ]
          : []),
        {
          key: "pays",
          label: "Pays",
          value: paysRailWords(order.payment, order.supplier.payTermsDays),
          ...(open
            ? {
                edit: {
                  field: "payment",
                  type: "seg" as const,
                  options: [...PAYING],
                  initial: PAYING_WORD[order.payment],
                  parse: (word: string) => PAYMENT_OF[word as (typeof PAYING)[number]],
                  requires: ORDER_UPDATE,
                },
              }
            : {}),
        },
      ],
    },
  ];
  if (order.status !== "DRAFT") {
    const next: RailRow[] = open
      ? [
          {
            key: "next",
            label: "Next",
            value: order.expectedDate
              ? `${order.promisedFor ? "Promised for" : "Expected"} ${formatDay(`${order.expectedDate}T12:00:00Z`).replace(/ \d{4}$/, "")}`
              : "Not said",
            muted: !order.expectedDate,
            edit: { field: "expectedDate", type: "date", initial: order.expectedDate ?? "", earliest: "today", requires: ORDER_UPDATE },
          },
        ]
      : [];
    groups.push({
      title: "Deliveries",
      hint: false,
      rows: [
        ...order.deliveries.map((delivery) => {
          const value = `${formatDay(delivery.postedAt).replace(/ \d{4}$/, "")}, ${formatCount(delivery.units)} ${unitWords(delivery.units)}`;
          return { key: delivery.id, label: delivery.receiptNo, value, links: [{ label: value, href: `/retail/buying/deliveries/${delivery.id}` }] };
        }),
        ...(order.deliveries.length === 0 ? [{ key: "none", label: "Delivered", value: "Nothing yet", muted: true }] : []),
        ...next,
      ],
    });
  }
  return groups;
}

export const orderKind: RecordKind<OrderView> = {
  type: "RetailPurchaseOrder",
  back: { label: "Orders", href: "/retail/buying/orders" },
  queryKey: (id) => ["retail-order", id],
  load: async (id) => (await fetchJson<{ data: OrderView }>(`${ORDER_API}/${id}`)).data,
  endpoint: (id) => `${ORDER_API}/${id}`,
  title: (order) => order.supplier.name,
  reference: (order) => order.poNo,
  actions: (order) => [
    ...(order.can.chase ? [{ key: "chase", label: "Send a reminder", requires: [ORDER_UPDATE], do: { sheet: "order-chase", id: order.id } }] : []),
    ...(isOpen(order)
      ? [{ key: "edit", label: "Edit lines", requires: [ORDER_UPDATE], do: { sheet: "order-edit", id: order.id } }]
      : []),
    { key: "print", label: "Print", requires: [], do: { open: `${pdfOf(order)}?print=1` } },
  ],
  more: (order) => [
    { key: "pdf", label: "Export as PDF", requires: [], do: { download: pdfOf(order) } },
    { key: "duplicate", label: "Duplicate order", requires: [ORDER_CREATE], do: { event: "duplicate" } },
    ...(order.can.close
      ? [
          {
            key: "close",
            label: "Close with what came",
            requires: [ORDER_UPDATE],
            do: {
              post: {
                url: `${ORDER_API}/${order.id}/close`,
                ask: closeShortAsk({
                  ref: order.poNo,
                  unitsToCome: order.figures.stillUnits,
                  linesToCome: order.lines.filter((line) => line.outstanding > 0 && !line.closedShort).length,
                  value: order.figures.deliveredValue,
                  supplier: firstWord(order.supplier.name),
                }),
                done: `${order.poNo} closed with what came. ${formatCount(order.figures.stillUnits)} ${order.figures.stillUnits === 1 ? "unit is" : "units are"} no longer expected.`,
              },
            },
          },
        ]
      : []),
    ...(order.can.cancelRest
      ? [
          {
            key: "cancelRest",
            label: "Cancel what is left",
            tone: "bad" as const,
            requires: [ORDER_UPDATE],
            do: {
              post: {
                url: `${ORDER_API}/${order.id}/cancel-rest`,
                body: { tell: true },
                ask: cancelRestAsk({
                  ref: order.poNo,
                  units: order.figures.stillUnits,
                  lines: order.lines.filter((line) => line.outstanding > 0 && !line.closedShort).length,
                  supplier: order.supplier.name,
                  channel: order.channel,
                  anythingCame: order.figures.delivered > 0,
                }),
                done: `What was left of ${order.poNo} is cancelled.${order.channel === "BY_HAND" ? "" : ` ${firstWord(order.supplier.name)} has been told.`}`,
              },
            },
          },
        ]
      : []),
    // W-31: ask for the money to pay it, while it is open and nothing is asked for it yet.
    ...(isOpen(order) && !order.requisition
      ? [{ key: "ask", label: "Ask for money", requires: [REQ_CREATE], do: { sheet: "req-new", params: { for: "order", orderId: order.id } } }]
      : []),
    ...(order.can.remove ? [{ key: "remove", label: "Remove the order", tone: "bad" as const, requires: [ORDER_DELETE], do: { event: "remove" } }] : []),
  ],
  primary: orderPrimary,
  bin: {
    kind: "order",
    deleteRight: ORDER_DELETE,
    state: (order) => order.binned,
    offer: () => false,
    meanwhile: (order) => `Off the Orders list; ${order.supplier.name} was never told.`,
  },
  steps: (order) => order.steps,
  chips: (order) => [
    ...(order.late ? [{ label: lateWords(order.late.days), tone: "bad" as const }] : []),
    ...(order.status === "DRAFT" ? [{ label: "Not sent", tone: "plain" as const }] : []),
    ...(order.status === "CLOSED" ? [{ label: "Closed short", tone: "plain" as const }] : []),
    ...(order.requisition ? [REQUISITION_CHIP[order.requisition.status]] : []),
  ],
  figure: (order) =>
    order.status === "DRAFT"
      ? { label: "Value", value: formatMoney(order.figures.total) }
      : {
          label: "Still to come",
          value: formatMoney(order.figures.stillValue),
          ...(order.figures.stillValue > 0 && (order.late || order.status === "PARTIAL") ? { tone: "warn" as const } : {}),
        },
  kpis: orderKpis,
  chart: orderChart,
  tabs: [
    {
      key: "lines",
      label: "Lines",
      source: "retail-order-lines",
      parent: "orderId",
      requires: ORDER_VIEW,
      allLink: { label: () => "Order history", tab: "activity" },
    },
    { key: "messages", label: "Messages", source: "retail-order-messages", parent: "orderId", requires: ORDER_VIEW },
    { key: "activity", label: "Activity" },
  ],
  rail: orderRail,
  invalidates: [["list", "retail-orders"], ["list", "retail-order-lines"], ["list", "retail-order-messages"], ["retail-supplier"], ["nav-badges"], ["reports"]],
};

/* ── A delivery (40-buying 5.6) ─────────────────────────────────────────── */

const DELIVERY_API = "/api/v2/retail/buying/deliveries";
const DELIVERY_POST: Grant = ["retail.purchasing", "approve"];
const notePdf = (delivery: DeliveryView) => `/api/v2/retail/records/RetailGoodsReceipt/${delivery.id}/pdf`;

function deliveryKpis(delivery: DeliveryView): RecordKpi[] {
  const f = delivery.figures;
  const received = delivery.receivedAt;
  return [
    { label: "Units", value: formatCount(f.units), lead: formatCount(f.noteUnits), leadTone: "plain", note: "on the note" },
    f.linesWithDifferences > 0
      ? { label: "Lines", value: formatCount(f.lines), lead: formatCount(f.linesWithDifferences), leadTone: "warn", note: "with differences" }
      : { label: "Lines", value: formatCount(f.lines), note: "as on the note" },
    f.shortValue > 0
      ? { label: "Value", value: formatMoney(f.value), lead: formatMoney(-f.shortValue), leadTone: "bad", note: "short" }
      : { label: "Value", value: formatMoney(f.value), note: "Matches" },
    delivery.order
      ? { label: "Against", value: delivery.order.poNo, lead: `${delivery.order.deliveredPct}%`, leadTone: "plain", note: "of it delivered" }
      : { label: "Against", value: "No order", note: "taken in" },
    {
      label: "Received",
      value: formatShortDay(received),
      lead: formatTime(received),
      leadTone: "plain",
      note: delivery.countedBy ? `by ${delivery.countedBy.name}` : "",
    },
  ];
}

function deliveryRail(delivery: DeliveryView): RailGroup[] {
  const counted = delivery.status === "COUNTED";
  return [
    {
      title: "Delivery",
      rows: [
        { key: "supplier", label: "Supplier", value: delivery.supplier.name, links: [{ label: delivery.supplier.name, href: `/retail/buying/suppliers/${delivery.supplier.id}` }] },
        delivery.order
          ? { key: "order", label: "Order", value: delivery.order.poNo, mono: true, links: [{ label: delivery.order.poNo, href: `/retail/buying/orders/${delivery.order.id}` }] }
          : { key: "order", label: "Order", value: "No order", muted: true },
        {
          key: "note",
          label: "Note number",
          value: delivery.noteNumber ?? "Add",
          muted: !delivery.noteNumber,
          mono: Boolean(delivery.noteNumber),
          edit: { field: "noteNumber", type: "text", initial: delivery.noteNumber ?? "", mono: true, parse: (typed: string) => typed.trim() || null, requires: ORDER_UPDATE },
        },
        {
          key: "driver",
          label: "Driver",
          value: delivery.driver ?? "Add",
          muted: !delivery.driver,
          edit: { field: "driver", type: "text", initial: delivery.driver ?? "", parse: (typed: string) => typed.trim() || null, requires: ORDER_UPDATE },
        },
      ],
    },
    {
      title: "Received",
      hint: false,
      rows: [
        { key: "when", label: "When", value: `${formatDay(delivery.receivedAt)}, ${formatTime(delivery.receivedAt)}`, mono: true },
        counted
          ? {
              key: "by",
              label: "By",
              value: delivery.countedBy?.name ?? "—",
              edit: {
                field: "countedById",
                type: "auto",
                initial: delivery.countedBy?.id ?? "",
                lookup: { noun: "person", picked: delivery.countedBy ? { id: delivery.countedBy.id, label: delivery.countedBy.name } : null },
                parse: (value: string) => value || undefined,
                requires: ORDER_UPDATE,
              },
            }
          : { key: "by", label: "By", value: delivery.countedBy?.name ?? "—" },
        { key: "checked", label: "Checked by", value: delivery.checkedBy?.name ?? "Not yet", muted: !delivery.checkedBy },
        { key: "site", label: "Site", value: delivery.site.name },
      ],
    },
    {
      title: "Differences",
      hint: false,
      rows: [
        {
          key: "short",
          label: "Short",
          value: delivery.figures.short > 0 ? `${formatCount(delivery.figures.short)} ${unitWords(delivery.figures.short)}, ${formatMoney(delivery.figures.shortValue)}` : "None",
          mono: delivery.figures.short > 0,
          muted: delivery.figures.short === 0,
        },
        ...(delivery.figures.damaged > 0 ? [{ key: "damaged", label: "Damaged", value: `${formatCount(delivery.figures.damaged)} ${unitWords(delivery.figures.damaged)}`, mono: true }] : []),
        { key: "credit", label: "Credit", value: delivery.rail.credit, muted: delivery.rail.credit === "None" },
        { key: "photos", label: "Photos", value: delivery.rail.photos, muted: delivery.rail.photos === "None" },
      ],
    },
  ];
}

export const deliveryKind: RecordKind<DeliveryView> = {
  type: "RetailGoodsReceipt",
  back: { label: "Deliveries", href: "/retail/buying/deliveries" },
  queryKey: (id) => ["retail-delivery", id],
  load: async (id) => (await fetchJson<{ data: DeliveryView }>(`${DELIVERY_API}/${id}`)).data,
  endpoint: (id) => `${DELIVERY_API}/${id}`,
  title: (delivery) => delivery.supplier.name,
  reference: (delivery) => delivery.receiptNo,
  actions: (delivery) => [{ key: "print", label: "Print", requires: [], do: { open: `${notePdf(delivery)}?print=1` } }],
  more: (delivery) => [{ key: "pdf", label: "Export as PDF", requires: [], do: { download: notePdf(delivery) } }],
  primary: (delivery) =>
    delivery.can.post
      ? {
          key: "post",
          label: "Post to stock",
          requires: [DELIVERY_POST],
          do: {
            post: {
              url: `${DELIVERY_API}/${delivery.id}/post`,
              done: `${delivery.receiptNo} posted. ${formatCount(delivery.figures.units)} ${unitWords(delivery.figures.units)} in stock.`,
            },
          },
        }
      : null,
  steps: (delivery) => delivery.steps,
  chips: (delivery) => delivery.chips,
  figure: (delivery) => ({ label: "Value", value: formatMoney(delivery.figures.value) }),
  kpis: deliveryKpis,
  chart: (delivery) =>
    delivery.chart.length === 0
      ? null
      : {
          title: "Counted against the delivery note",
          unit: "% of each line",
          max: 100,
          bars: delivery.chart.map((bar) => ({ label: bar.name, tick: bar.label, value: bar.pct, text: `${bar.pct}% of the note` })),
          tick: (value) => `${value}%`,
        },
  tabs: [
    {
      key: "lines",
      label: "Lines",
      source: "retail-delivery-lines",
      parent: "deliveryId",
      requires: ORDER_VIEW,
      columns: ["product", "onNote", "counted", "difference", "cost", "value"],
      allLink: { label: "Delivery note PDF", action: "pdf" },
    },
    { key: "activity", label: "Activity" },
  ],
  rail: deliveryRail,
  invalidates: [["list", "retail-orders"], ["list", "retail-order-lines"], ["list", "retail-delivery-lines"], ["retail-order"], ["retail-supplier"], ["nav-badges"], ["reports"]],
};
