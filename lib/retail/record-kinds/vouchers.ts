import { fetchJson } from "@/lib/api-client";
import { voidVoucherAsk } from "@/lib/retail/asks/products";
import type { VoucherView } from "@/lib/retail/vouchers/service";
import { ANYONE } from "@/lib/retail/vouchers/words";
import { formatCount, formatDay, formatMediumDay, formatMoney, formatShortMonth } from "@/lib/workspace/format";

import type { Grant, RailGroup, RecordAction, RecordChart, RecordKind, RecordKpi, RecordStep } from "./types";

/**
 * The voucher record kind (PRD-10, 20-products 5.26, `VoucherRecord.png`):
 * where it is between Issued and Used up, what it was worth, what was spent
 * and what is left, when it expires and how it came to be, money spent from
 * it by month, where it was spent and its changes, and its details with the
 * secret for Owner and Manager. Not binnable: a voucher is voided with a
 * reason. Extend opens `voucher-edit` over it.
 */

export type VoucherRecord = VoucherView & { months: Array<{ start: string; spent: number }> };

const VIEW: Grant = ["retail.promotions", "view"];
const UPDATE: Grant = ["retail.promotions", "update"];
const DELETE: Grant = ["retail.promotions", "delete"];

const voucherUrl = (id: string) => `/api/v2/retail/vouchers/${id}`;
const open = (voucher: VoucherRecord) => !voucher.voidedAt && !voucher.expiredAt;
const money = (voucher: VoucherRecord) => voucher.left !== null;
const times = (count: number) => `${formatCount(count)} ${count === 1 ? "time" : "times"}`;

const RANGES = [
  { key: "3m", label: "3 months" },
  { key: "12m", label: "12 months" },
  { key: "all", label: "All time" },
];

function steps(voucher: VoucherRecord): RecordStep[] {
  const last =
    voucher.state === "VOID" ? "Void" : voucher.state === "EXPIRED" ? "Expired" : "Used up";
  const ended = voucher.state === "VOID" || voucher.state === "EXPIRED" || voucher.state === "USED_UP";
  return [
    { label: "Issued", state: "done" },
    { label: "In use", state: voucher.state === "IN_USE" ? "now" : voucher.uses > 0 || ended ? "done" : "todo" },
    { label: last, state: ended ? "now" : "todo" },
  ];
}

/** How it came to be: sold at a till, given in the back office, or a refund's credit note. */
function sourceKpi(voucher: VoucherRecord): RecordKpi {
  if (voucher.funding === "SOLD") {
    return {
      label: "Sold for",
      value: voucher.value === null ? "—" : formatMoney(voucher.value),
      ...(voucher.soldSale ? { lead: voucher.soldSale.paidWith, leadTone: "plain" as const } : {}),
      note: voucher.soldSale?.saleNo ?? "At a till",
    };
  }
  if (voucher.funding === "REFUND") {
    return { label: "Refund of", value: voucher.soldSale?.saleNo ?? "A sale", note: voucher.soldSale ? `paid back as ${voucher.kindLabel.toLowerCase()}` : "" };
  }
  return { label: "Given", value: formatMediumDay(voucher.issuedAt), note: voucher.issuedBy ? `by ${voucher.issuedBy}` : "in the back office" };
}

function kpis(voucher: VoucherRecord): RecordKpi[] {
  const expires: RecordKpi = {
    label: "Expires",
    value: formatMediumDay(voucher.expiresOn),
    note:
      voucher.state === "VOID"
        ? "Voided"
        : voucher.daysToExpiry < 0
          ? `${formatCount(-voucher.daysToExpiry)} days ago`
          : voucher.daysToExpiry === 0
            ? "Today is the last day"
            : `${formatCount(voucher.daysToExpiry)} ${voucher.daysToExpiry === 1 ? "day" : "days"}`,
  };
  if (!money(voucher)) {
    return [
      { label: "Value", value: voucher.valueLabel, note: "on each sale" },
      { label: "Given off", value: formatMoney(voucher.spent), note: times(voucher.uses) },
      { label: "Left", value: formatCount(voucher.usesLeft ?? 0), note: `of ${formatCount(voucher.copies)} printed` },
      expires,
      sourceKpi(voucher),
    ];
  }
  return [
    { label: "Value", value: voucher.valueLabel, note: "when issued" },
    { label: "Spent", value: formatMoney(voucher.spent), note: voucher.uses === 0 ? "Not yet" : times(voucher.uses) },
    { label: "Left", value: formatMoney(voucher.left ?? 0), note: `${voucher.leftPercent ?? 0}% of the value` },
    expires,
    sourceKpi(voucher),
  ];
}

function chart(voucher: VoucherRecord, range: string | null): RecordChart {
  const months = range === "3m" ? voucher.months.slice(-3) : range === "all" ? voucher.months : voucher.months.slice(-12);
  return {
    title: money(voucher) ? "Spent from it, by month" : "Taken off with it, by month",
    unit: voucher.site === "All sites" ? "all sites" : voucher.site,
    bars: months.map((month) => ({
      label: formatShortMonth(month.start.slice(0, 7)),
      value: month.spent,
      text: `${formatMoney(month.spent)} ${money(voucher) ? "spent" : "off"}`,
    })),
    tick: (value) => (value === 0 ? "0" : formatMoney(value).replace(/\.00$/, "")),
  };
}

function rail(voucher: VoucherRecord): RailGroup[] {
  const editable = open(voucher);
  return [
    {
      title: "Voucher",
      rows: [
        { key: "code", label: "Code", value: voucher.code, mono: true },
        ...(voucher.secret ? [{ key: "secret", label: "Secret", value: voucher.secret, mono: true }] : []),
        { key: "kind", label: "Kind", value: voucher.kindLabel },
        {
          key: "holder",
          label: "Holder",
          value: voucher.holderName ?? ANYONE,
          edit: editable ? { field: "holder", type: "text" as const, initial: voucher.holderName ?? "", parse: (text: string) => text.trim() || null, requires: UPDATE } : undefined,
        },
        { key: "value", label: "Value", value: voucher.valueLabel, mono: true },
        ...(voucher.minSale ? [{ key: "min", label: "Smallest sale", value: formatMoney(voucher.minSale), mono: true }] : []),
      ],
    },
    {
      title: "Valid",
      rows: [
        { key: "issued", label: "Issued", value: formatDay(voucher.issuedAt), mono: true },
        {
          key: "expires",
          label: "Expires",
          value: formatDay(voucher.expiresOn),
          mono: true,
          edit: editable ? { field: "expiresOn", type: "date" as const, initial: voucher.expiresOn, earliest: "today" as const, requires: UPDATE } : undefined,
        },
        {
          key: "sites",
          label: "Sites",
          value: voucher.site,
          edit: editable
            ? {
                field: "siteId",
                type: "auto" as const,
                initial: voucher.siteId ?? "all",
                lookup: {
                  noun: "site",
                  picked: voucher.siteId ? { id: voucher.siteId, label: voucher.site } : { id: "all", label: "All sites" },
                  context: { allSites: true },
                },
                parse: (value: string) => (value && value !== "all" ? value : null),
                requires: UPDATE,
              }
            : undefined,
        },
        ...(voucher.voidReason ? [{ key: "void", label: "Voided", value: voucher.voidReason }] : []),
      ],
    },
    voucher.funding === "GIVEN"
      ? {
          title: "Given",
          rows: [
            { key: "by", label: "By", value: voucher.issuedBy ?? "Not on record", muted: !voucher.issuedBy },
            { key: "send", label: "Sent", value: voucher.canSend ? "On WhatsApp to the holder" : "Printed" },
          ],
        }
      : {
          title: voucher.funding === "SOLD" ? "Sold" : "Refund",
          rows: [
            {
              key: "sale",
              label: "Sale",
              value: voucher.soldSale?.saleNo ?? "Not on record",
              mono: Boolean(voucher.soldSale),
              ...(voucher.soldSale ? { links: [{ label: voucher.soldSale.saleNo, href: `/retail/sales/${voucher.soldSale.id}` }] } : {}),
            },
            { key: "paid", label: "Paid with", value: voucher.soldSale?.paidWith ?? "—" },
            { key: "by", label: "By", value: voucher.soldSale?.cashier ?? "—" },
          ],
        },
  ];
}

export const voucherKind: RecordKind<VoucherRecord> = {
  type: "RetailVoucher",
  back: { label: "Vouchers", href: "/retail/products/vouchers" },
  queryKey: (id) => ["retail-voucher", id],
  load: async (id) => {
    const [view, chartData] = await Promise.all([
      fetchJson<{ data: VoucherView }>(voucherUrl(id)),
      fetchJson<{ data: { months: VoucherRecord["months"] } }>(`${voucherUrl(id)}/chart?range=all`),
    ]);
    return { ...view.data, months: chartData.data.months };
  },
  endpoint: voucherUrl,
  title: (voucher) => voucher.kindLabel,
  reference: (voucher) => voucher.code,
  actions: (voucher): RecordAction[] => [
    ...(open(voucher) ? [{ key: "extend", label: "Extend", requires: [UPDATE], do: { sheet: "voucher-edit", id: voucher.id } }] : []),
    { key: "print", label: "Print", requires: [VIEW], do: { open: `/api/v2/retail/vouchers/print?ids=${voucher.id}` } },
    ...(open(voucher) && voucher.canSend
      ? [
          {
            key: "send",
            label: "Send to the holder",
            requires: [UPDATE],
            do: { post: { url: `${voucherUrl(voucher.id)}/send`, done: `${voucher.code} sent to ${voucher.holderName ?? "the holder"} on WhatsApp.` } },
          },
        ]
      : []),
  ],
  more: (voucher): RecordAction[] => [
    { key: "pdf", label: "Export as PDF", requires: [VIEW], do: { download: `/api/v2/retail/records/RetailVoucher/${voucher.id}/pdf` } },
    ...(open(voucher)
      ? [
          {
            key: "void",
            label: "Void it",
            tone: "bad" as const,
            requires: [DELETE],
            do: {
              post: {
                url: "/api/v2/retail/vouchers/void",
                body: { ids: [voucher.id] },
                ask: voidVoucherAsk({ code: voucher.code, count: 1, left: money(voucher) ? voucher.leftLabel : null }),
                done: `${voucher.code} is void.`,
              },
            },
          },
        ]
      : []),
  ],
  steps,
  chips: (voucher) => [{ label: voucher.holderName ?? ANYONE, tone: voucher.state === "VOID" ? "bad" : "plain" }],
  figure: (voucher) => ({ label: "Left", value: money(voucher) ? formatMoney(voucher.left ?? 0) : `${formatCount(voucher.usesLeft ?? 0)} left` }),
  kpis,
  chartRanges: { options: RANGES, initial: "12m" },
  chart,
  tabs: [
    {
      key: "uses",
      label: "Uses",
      source: "retail-voucher-uses",
      parent: "voucher",
      allLink: { label: "Every use", href: (voucher) => `/retail/sales?voucher=${voucher.id}` },
      totalsText: (voucher) => ({
        saleNo: `Σ ${formatCount(voucher.uses)} ${voucher.uses === 1 ? "use" : "uses"}`,
        ...(voucher.left !== null ? { leftAfter: formatMoney(voucher.left) } : {}),
      }),
    },
    { key: "activity", label: "Changes" },
  ],
  rail,
  invalidates: [["list", "retail-vouchers"], ["list", "retail-voucher-uses"], ["reports"]],
};
