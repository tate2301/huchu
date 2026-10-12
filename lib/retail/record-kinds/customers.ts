import { fetchJson } from "@/lib/api-client";
import type { SpendChart, SpendRange } from "@/lib/retail/customers/spend-chart";
import type { CustomerRecordView } from "@/lib/retail/customers/view";
import { signedPoints } from "@/lib/retail/loyalty/format";
import { formatCount, formatDay, formatMoney } from "@/lib/workspace/format";

import type { Grant, RailRow, RecordAction, RecordChart, RecordKind } from "./types";

/**
 * The customer record kind (60-customers 5.3, CustomerRecord board, CUS-03):
 * their tier, points and five figures, spend per month, the points ledger,
 * purchases and notes as tabs, and their contact and loyalty details on the
 * rail, each contact value changed in place by owners and managers. Binned
 * from ⋯ or Edit everything. "Adjust points" (packet 64), "Take a payment"
 * (packet 67), Merge (packet 65) and the account (packet 66) join here.
 *
 * The record is the customer's view and their spend for each range, read
 * side by side.
 */

export type CustomerRecord = CustomerRecordView & { spend: Record<SpendRange, SpendChart> };

const VIEW: Grant = ["retail.customers", "view"];
const UPDATE: Grant = ["retail.customers", "update"];

const API = "/api/v2/retail/customers";
const customerUrl = (id: string) => `${API}/${id}`;

export const CUSTOMER_RANGES = [
  { key: "3m", label: "3 months" },
  { key: "12m", label: "12 months" },
  { key: "all", label: "All time" },
];

const spendTick = (value: number) => (value === 0 ? "0" : `US$${formatCount(value)}`);

function chart(customer: CustomerRecord, range: string | null): RecordChart {
  const key = (range === "3m" || range === "all" ? range : "12m") as SpendRange;
  const spend = customer.spend[key];
  const yearly = key === "all" && spend.bars.some((bar) => /^\d{4}$/.test(bar.key));
  return {
    title: key === "3m" ? "Spend per week" : yearly ? "Spend per year" : "Spend per month",
    unit: "US$",
    bars: spend.bars.map((bar) => ({ label: bar.tip, tick: bar.label, value: bar.value, text: formatMoney(bar.value) })),
    tick: spendTick,
  };
}

/** "earned +4,210 · spent −1,189 · expired −42": the parts that are not nought. */
function ledgerWords(totals: Record<string, number | string | boolean | null>): string {
  const parts: Array<[string, unknown]> = [
    ["earned", totals.earned],
    ["spent", totals.spent],
    ["expired", totals.expired],
    ["adjusted", totals.adjusted],
    ["taken back", totals.takenBack],
  ];
  return parts
    .filter(([, value]) => Number(value ?? 0) !== 0)
    .map(([label, value]) => `${label} ${signedPoints(Number(value))}`)
    .join(" · ");
}

/** A Contact row: its value, "—" when there is none, changed as text; blank sends null. */
function contactRow(key: string, label: string, value: string | null, field: string, opts: { mono?: boolean; shown?: string; initial?: string } = {}): RailRow {
  return {
    key,
    label,
    value: opts.shown ?? value ?? "—",
    muted: value === null && !opts.shown,
    mono: Boolean(opts.mono && value),
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

/** "6009 1400 0141". */
const cardWords = (card: string | null) => (card ? card.replace(/(\d{4})(?=\d)/g, "$1 ") : "—");

function consentAction(customer: CustomerRecord): RecordAction {
  return customer.marketingConsent
    ? {
        key: "consent",
        label: "Stop marketing messages",
        requires: [UPDATE],
        do: {
          post: {
            url: customerUrl(customer.id),
            method: "PATCH",
            body: { marketingConsent: false, via: "record" },
            done: `${customer.name} gets no more offers. Receipts still go.`,
          },
        },
      }
    : {
        key: "consent",
        label: "Allow marketing messages",
        requires: [UPDATE],
        do: {
          post: {
            url: customerUrl(customer.id),
            method: "PATCH",
            body: { marketingConsent: true, via: "record" },
            done: `${customer.name} will get offers again.`,
          },
        },
      };
}

export const customerKind: RecordKind<CustomerRecord> = {
  type: "Customer",
  back: { label: "Customers", href: "/retail/customers" },
  queryKey: (id) => ["retail-customer", id],
  load: async (id) => {
    const spend = (range: SpendRange) => fetchJson<SpendChart>(`${customerUrl(id)}/spend?range=${range}`);
    const [view, three, twelve, all] = await Promise.all([
      fetchJson<{ data: CustomerRecordView }>(customerUrl(id)),
      spend("3m"),
      spend("12m"),
      spend("all"),
    ]);
    return { ...view.data, spend: { "3m": three, "12m": twelve, all } };
  },
  endpoint: customerUrl,
  title: (customer) => customer.name,
  reference: (customer) => customer.code,
  // "Take a payment" (packet 67) joins this group.
  actions: (customer): RecordAction[] => [
    ...(customer.can.adjustPoints
      ? [{ key: "points", label: "Adjust points", requires: [UPDATE], do: { sheet: "points", id: customer.id } } satisfies RecordAction]
      : []),
    ...(customer.can.message
      ? [{ key: "message", label: "Message on WhatsApp", requires: [UPDATE], do: { sheet: "message", params: { ids: customer.id } } } satisfies RecordAction]
      : []),
  ],
  more: (customer): RecordAction[] => [
    { key: "pdf", label: "Export as PDF", requires: [VIEW], do: { download: `/api/v2/retail/records/Customer/${customer.id}/pdf` } },
    { key: "edit", label: "Edit everything", requires: [UPDATE], do: { sheet: "customer-edit", id: customer.id } },
    consentAction(customer),
  ],
  bin: {
    kind: "customer",
    deleteRight: ["retail.customers", "delete"],
    state: (customer) => customer.binned,
    meanwhile: "Off every list and the till’s search; their sales and points stay.",
  },
  chips: (customer) => [
    ...(customer.tier.name
      ? [{ label: customer.tier.heldUntil ? `${customer.tier.name}, held` : customer.tier.name, tone: customer.tier.isTop ? ("gold" as const) : ("plain" as const) }]
      : []),
    { label: `Member since ${formatDay(customer.memberSince)}`, tone: "plain" },
    ...(customer.marketingConsent ? [{ label: "Agreed to messages", tone: "plain" as const }] : []),
    ...(customer.staff ? [{ label: "Staff", tone: "plain" as const }] : []),
  ],
  figure: (customer) => ({ label: "Points", value: formatCount(customer.points.balance) }),
  kpis: (customer) => customer.kpis,
  chartRanges: { options: CUSTOMER_RANGES, initial: "12m" },
  chart,
  tabs: [
    {
      key: "points",
      label: "Points ledger",
      source: "retail-points",
      parent: "customer",
      requires: VIEW,
      filters: (customer) => ({ when: `${customer.since12m}..` }),
      columns: ["at", "what", "ref", "by", "points", "balance"],
      allLink: { label: "All points movements", href: (customer) => `/retail/customers/${customer.id}/points` },
      totalsText: (_customer, totals) => ({
        at: "Σ 12 months",
        what: ledgerWords(totals),
        balance: formatCount(Number(totals.balance ?? 0)),
      }),
    },
    {
      key: "purchases",
      label: "Purchases",
      source: "retail-customer-purchases",
      parent: "customer",
      requires: VIEW,
      allLink: { label: "All their purchases", href: (customer) => `/retail/sales?customer=${customer.id}` },
    },
    {
      key: "notes",
      label: "Notes",
      source: "retail-customer-notes",
      parent: "customer",
      requires: VIEW,
      allLink: {
        label: "Add a note",
        href: (customer) => (customer.can.note ? `/retail/customers/${customer.id}?sheet=customer-note&id=${customer.id}` : null),
        evenEmpty: true,
      },
    },
    {
      // A Deviation the spec asks for: only while they have a lay-by.
      key: "laybys",
      label: "Lay-bys",
      source: "retail-laybys",
      parent: "customer",
      requires: ["retail.laybys", "view"],
      when: (customer) => customer.counts.laybys > 0,
      allLink: { label: "All their lay-bys", href: (customer) => `/retail/laybys?customer=${customer.id}` },
    },
    { key: "activity", label: "Activity" },
  ],
  railTop: (customer) => ({ meter: customer.meter }),
  rail: (customer) => [
    {
      title: "Contact",
      hint: true,
      rows: [
        {
          key: "phone",
          label: "Phone",
          value: customer.phoneDisplay || "—",
          mono: Boolean(customer.phone),
          muted: !customer.phone,
          edit: {
            field: "phone",
            type: "text",
            mono: true,
            initial: customer.phoneDisplay,
            parse: (typed: string) => {
              if (!typed.trim()) throw new Error("That is not a phone number.");
              return typed.trim();
            },
            requires: UPDATE,
          },
        },
        contactRow("whatsapp", "WhatsApp", customer.whatsappDisplay, "whatsapp", {
          shown: customer.whatsappDisplay ?? "Same number",
          mono: Boolean(customer.whatsappDisplay),
        }),
        contactRow("email", "Email", customer.email, "email"),
        contactRow("area", "Area", customer.area, "area"),
      ],
    },
    {
      title: "Loyalty",
      rows: [
        { key: "earns", label: "Earns", value: customer.loyalty.earns },
        { key: "worth", label: "Worth", value: customer.loyalty.worth },
        {
          key: "card",
          label: "Card",
          value: cardWords(customer.cardNo),
          mono: Boolean(customer.cardNo),
          edit: {
            field: "cardNo",
            type: "text",
            mono: true,
            initial: cardWords(customer.cardNo).replace("—", ""),
            parse: (typed: string) => {
              const digits = typed.replace(/\s+/g, "");
              if (!/^\d{12}$/.test(digits)) throw new Error("A card number is 12 digits.");
              return digits;
            },
            requires: UPDATE,
          },
        },
        { key: "expiry", label: "Expiry", value: customer.loyalty.expiry },
      ],
    },
    {
      title: "Usually buys",
      rows: [
        { key: "most", label: "Most", value: customer.usually.most },
        { key: "then", label: "Then", value: customer.usually.then },
        { key: "pays", label: "Pays with", value: customer.usually.paysWith },
      ],
    },
  ],
  invalidates: [["list", "retail-customers"], ["lookup", "customer"], ["list", "retail-bin"]],
};
