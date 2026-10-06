import { fetchJson } from "@/lib/api-client";
import { stopBuyingAsk } from "@/lib/retail/asks/buying";
import type { SupplierView } from "@/lib/retail/buying/supplier-view";
import { formatCount, formatDay, formatMoney } from "@/lib/workspace/format";

import type { Grant, RailRow, RecordChart, RecordKind, RecordKpi } from "./types";

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
const base = (supplier: SupplierView) => `/retail/buying/suppliers/${supplier.id}`;

const PAYS = ["On delivery", "7 days", "14 days", "30 days"];

/** "3 October" — the banner leaves the year to the reader. */
const dayMonth = (iso: string) => formatDay(iso).replace(/ \d{4}$/, "");

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });

function monthLabel(key: string, newestYear: string): string {
  const [year, month] = key.split("-").map(Number) as [number, number];
  const name = MONTH.format(new Date(Date.UTC(year, month - 1, 15))).replace("Sept", "Sep");
  return String(year) === newestYear ? name : `${name} ${year}`;
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
