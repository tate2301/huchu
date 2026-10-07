import { fetchJson } from "@/lib/api-client";
import type { SaleView } from "@/lib/retail/floor/sale-view";
import { fiscalChip, paidKpi, saleStateChip } from "@/lib/retail/floor/sale-words";
import type { ShiftRecordView } from "@/lib/retail/shift-record";
import { salesWords, takingsTitle } from "@/lib/retail/shift-words";
import { formatDay, formatDuration, formatMediumDay, formatMoney, formatSigned, formatTime, formatWhen, formatCount } from "@/lib/workspace/format";

import type { RailGroup, RecordAction, RecordChip, RecordKind, RecordKpi, RecordStep } from "./types";

/**
 * The shift record kind (00-foundations 5.6.10, ShiftRecord board): the
 * reference record. FND wires "Export as PDF", "Print X-report" (open) or
 * "Print Z-report" (closed) and the existing count and close; the floor spec
 * adds the cash move, staff message, sign-off and close without counting.
 */

const CASH_CONTROL = ["retail.cash-control", "view"] as const;
const OWN_TILL = ["retail.sell", "open-shift"] as const;
/** Printing an X-report mid-shift: someone who runs drawers, not the bookkeeper who reads them. */
const X_REPORT = ["retail.cash-control", "update"] as const;

/** A drawer open longer than this is left over from another day. */
const STALE_MINUTES = 12 * 60;

function steps(shift: ShiftRecordView): RecordStep[] {
  if (shift.status === "OPEN") {
    return [
      { label: "Opened", state: "done" },
      { label: "Trading", state: "now" },
      { label: "Counted", state: "todo" },
      { label: "Closed", state: "todo" },
    ];
  }
  return [
    { label: "Opened", state: "done" },
    { label: "Trading", state: "done" },
    { label: "Counted", state: shift.countedCash === null ? "todo" : "done" },
    { label: "Closed", state: "now" },
  ];
}

function stateChip(shift: ShiftRecordView): RecordChip {
  if (shift.status === "OPEN") {
    const stale = shift.minutesOpen > STALE_MINUTES;
    return {
      label: stale ? `Open ${Math.floor(shift.minutesOpen / 60)}h` : `Open ${formatDuration(shift.minutesOpen)}`,
      tone: stale ? "warn" : "info",
    };
  }
  if (shift.state === "Short") return { label: `Short ${formatMoney(Math.abs(shift.variance ?? 0))}`, tone: "bad" };
  if (shift.state === "Over") return { label: `Over ${formatMoney(shift.variance ?? 0)}`, tone: "warn" };
  if (shift.state === "Balanced") return { label: "Balanced", tone: "ok" };
  return { label: "Not counted", tone: "warn" };
}

function cashInOutNote(shift: ShiftRecordView): { lead: string; note: string } {
  const { count, drops } = shift.movements;
  if (count === 0) return { lead: "0", note: "none" };
  if (drops === count) return { lead: formatCount(drops), note: drops === 1 ? "drop to the safe" : "drops to the safe" };
  return { lead: formatCount(count), note: count === 1 ? "movement" : "movements" };
}

function countedKpi(shift: ShiftRecordView) {
  if (shift.countedCash === null) return { label: "Counted", value: "—", note: "not counted yet" };
  const variance = shift.variance ?? 0;
  if (variance < 0) return { label: "Counted", value: formatMoney(shift.countedCash), lead: formatSigned(variance), leadTone: "bad" as const, note: "short" };
  if (variance > 0) return { label: "Counted", value: formatMoney(shift.countedCash), lead: formatSigned(variance), leadTone: "warn" as const, note: "over" };
  return { label: "Counted", value: formatMoney(shift.countedCash), note: "balanced" };
}

function toTheSafe(shift: ShiftRecordView): string {
  const { drops, dropTotal, lastDropAt } = shift.movements;
  if (drops === 0) return "None";
  if (drops === 1 && lastDropAt) return `${formatMoney(-dropTotal)} at ${formatTime(lastDropAt)}`;
  return `${formatMoney(-dropTotal)}, ${drops} drops`;
}

export const shiftKind: RecordKind<ShiftRecordView> = {
  type: "RetailShift",
  back: { label: "Shifts", href: "/retail/shifts" },
  queryKey: (id) => ["retail-shift", id],
  load: async (id) => (await fetchJson<{ data: ShiftRecordView }>(`/api/v2/retail/shifts/${id}`)).data,
  title: (shift) => shift.registerName,
  reference: (shift) => shift.shiftNo,
  actions: (shift) =>
    shift.status === "OPEN"
      ? [
          // FLR-03: on a drawer the viewer may move (own `retail.sell`, anybody's with cash control).
          ...(shift.can.move
            ? [
                {
                  key: "cash-move",
                  label: "Record cash in or out",
                  requires: [["retail.sell", "create"], ["retail.cash-control", "update"]],
                  do: { sheet: "cash-move", id: shift.id },
                } satisfies RecordAction,
              ]
            : []),
          {
            key: "x-report",
            label: "Print X-report",
            // A till action: whoever runs drawers (cash control) or sells at one; the bookkeeper only reads.
            requires: [[...X_REPORT], [...OWN_TILL]],
            do: { open: `/api/v2/retail/records/RetailShift/${shift.id}/pdf?as=x-report` },
          },
        ]
      : [
          {
            key: "z-report",
            label: "Print Z-report",
            requires: [[...CASH_CONTROL]],
            do: { event: "print-z-report" },
          },
        ],
  more: (shift) => [
    // C-06: ADM-02's message sheet, to this shift's cashier.
    ...(shift.status === "OPEN" && shift.can.message
      ? [
          {
            key: "message",
            label: "Message the cashier",
            requires: [["retail.people", "update"]],
            do: { sheet: "people-message", params: { ids: shift.cashierId } },
          } satisfies RecordAction,
        ]
      : []),
    {
      key: "pdf",
      label: "Export as PDF",
      requires: [[...CASH_CONTROL], [...OWN_TILL]],
      do: { download: `/api/v2/retail/records/RetailShift/${shift.id}/pdf` },
    },
  ],
  primary: (shift) =>
    shift.status === "OPEN"
      ? {
          key: "count-and-close",
          label: "Count and close",
          requires: [
            ["retail.cash-control", "close-shift"],
            ["retail.sell", "close-shift"],
          ],
          do: { event: "count-and-close" },
        }
      : null,
  steps,
  chips: (shift) => [{ label: shift.cashierName, tone: "plain" }, stateChip(shift)],
  figure: (shift) =>
    shift.status === "OPEN"
      ? { label: "Should be in the drawer", value: formatMoney(shift.expectedCash) }
      : shift.countedCash === null
        ? { label: "Expected", value: formatMoney(shift.expectedCash) }
        : { label: "Counted", value: formatMoney(shift.countedCash) },
  kpis: (shift) => {
    const moves = cashInOutNote(shift);
    return [
      { label: "Takings", value: formatMoney(shift.takings), lead: formatCount(shift.saleCount), leadTone: "plain", note: salesWords(shift).replace(/^[\d,]+ /, "") },
      {
        label: "Opening float",
        value: formatMoney(shift.openingFloat),
        lead: formatTime(shift.openedAt),
        leadTone: "plain",
        note: shift.openingFloatZig > 0 ? `counted in, and ${formatMoney(shift.openingFloatZig, "ZWG")}` : "counted in",
      },
      { label: "Cash in and out", value: formatMoney(shift.cashMovementNet), lead: moves.lead, leadTone: "plain", note: moves.note },
      { label: "Should be in the drawer", value: formatMoney(shift.expectedCash), lead: formatMoney(shift.cashSales), leadTone: "plain", note: "in cash sales" },
      countedKpi(shift),
    ];
  },
  chart: (shift) => ({
    title: takingsTitle(shift.takingsOverTime.hoursEach),
    unit: "US$",
    bars: shift.takingsOverTime.bars.map((bar) => ({ label: bar.label, tick: bar.tick, value: bar.amount, text: formatMoney(bar.amount) })),
    tick: (value) => (value === 0 ? "0" : `US$${formatCount(value)}`),
  }),
  tabs: [
    {
      key: "sales",
      label: "Sales",
      source: "retail-shift-sales",
      parent: "shift",
      allLink: { label: "All sales on this shift", href: (shift) => `/retail/sales?tab=all&shift=${shift.id}` },
      totalsText: (shift) => ({
        postedAt: `Σ ${salesWords(shift)}`,
        paidWith: shift.tenders.map((line) => `${line.label.toLowerCase()} ${formatMoney(line.amount)}`).join(" · "),
      }),
    },
    { key: "cash", label: "Cash in and out", source: "retail-shift-cash", parent: "shift" },
    { key: "tenders", label: "How people paid", source: "retail-shift-tenders", parent: "shift" },
    { key: "activity", label: "Activity" },
  ],
  rail: (shift) => [
    {
      title: "Shift",
      rows: [
        { key: "till", label: "Till", value: shift.registerName },
        { key: "site", label: "Site", value: shift.site?.name ?? "—", muted: !shift.site },
        { key: "cashier", label: "Cashier", value: shift.cashierName },
        { key: "opened", label: "Opened", value: `${formatDay(shift.openedAt)}, ${formatTime(shift.openedAt)}`, mono: true },
      ],
    },
    {
      title: "Cash up",
      rows: [
        { key: "float", label: "Opening float", value: formatMoney(shift.openingFloat), mono: true },
        { key: "cash-sales", label: "Cash sales", value: formatMoney(shift.cashSales), mono: true },
        { key: "safe", label: "To the safe", value: toTheSafe(shift), mono: shift.movements.drops > 0, muted: shift.movements.drops === 0 },
        { key: "expected", label: "Expected", value: formatMoney(shift.expectedCash), mono: true },
        {
          key: "counted",
          label: "Counted",
          value: shift.countedCash === null ? "Not counted yet" : formatMoney(shift.countedCash),
          mono: shift.countedCash !== null,
        },
      ],
    },
    {
      title: "Drawer",
      rows: [
        {
          key: "last-opened",
          label: "Last opened",
          value: shift.lastCashSale ? `${formatTime(shift.lastCashSale.at)}, for ${shift.lastCashSale.saleNo}` : "Not yet",
          muted: !shift.lastCashSale,
        },
        { key: "no-sale", label: "No-sale opens", value: formatCount(shift.noSaleOpens), mono: true },
      ],
    },
    ...(shift.closedAt
      ? [
          {
            title: "Close",
            rows: [
              { key: "closed", label: "Closed", value: `${formatDay(shift.closedAt)}, ${formatTime(shift.closedAt)}`, mono: true },
              ...(shift.notes ? [{ key: "note", label: "What happened", value: shift.notes }] : []),
            ],
          },
        ]
      : []),
  ],
  invalidates: [["retail-shifts"], ["nav-badges"], ["reports"]],
};

/* ── A sale (50-floor, SaleRecord board) ─────────────────────────────────── */

const SALES_READ: Array<["retail.sell" | "retail.cash-control", "view"]> = [
  ["retail.sell", "view"],
  ["retail.cash-control", "view"],
];
const SELL_UPDATE = ["retail.sell", "update"] as const;

const usd = (value: string | number) => formatMoney(Number(value));
const count = (n: number, one: string, many: string) => `${formatCount(n)} ${n === 1 ? one : many}`;

function saleKpis(sale: SaleView): RecordKpi[] {
  const paid = paidKpi(sale);
  const discountLines = sale.discountLines;
  return [
    { label: "Total", value: usd(sale.total), note: count(sale.items, "item", "items") },
    {
      label: "VAT",
      value: usd(sale.vat),
      ...(sale.vatRatePct === null ? {} : { lead: `${sale.vatRatePct}%`, leadTone: "plain" as const }),
      note: "included",
    },
    sale.margin
      ? {
          label: "Margin",
          value: usd(sale.margin.value),
          ...(sale.margin.onCostPct === null ? {} : { lead: `${sale.margin.onCostPct}%`, leadTone: "plain" as const }),
          note: "on cost",
        }
      : { label: "Discount", value: usd(sale.discount), note: count(discountLines, "line", "lines") },
    { label: "Paid with", value: paid.value, ...(paid.lead ? { lead: paid.lead, leadTone: "plain" as const } : {}), note: paid.note },
    { label: "When", value: formatTime(sale.postedAt), note: formatMediumDay(sale.postedAt) },
  ];
}

function saleRail(sale: SaleView): RailGroup[] {
  const groups: RailGroup[] = [];
  if (sale.refund) {
    groups.push({
      title: "Refund",
      rows: [
        { key: "of", label: "Of", value: sale.source?.saleNo ?? "—", mono: Boolean(sale.source) },
        { key: "why", label: "Why", value: sale.refund.reason ?? "Not given", muted: !sale.refund.reason },
        { key: "shelf", label: "Back on the shelf", value: sale.refund.restocked ? "Yes" : "No, written off" },
        { key: "approved", label: "Approved by", value: sale.refund.approvedBy ?? "Not needed", muted: !sale.refund.approvedBy },
      ],
    });
  }
  groups.push({
    title: "Sale",
    // The board's hint sits here, beside the customer it is for, though Customer is read-only until CUS-02.
    hint: true,
    rows: [
      { key: "till", label: "Till", value: sale.till.name },
      { key: "cashier", label: "Cashier", value: sale.cashier.name },
      // Editable once customers land (CUS-02); until then the name as rung.
      { key: "customer", label: "Customer", value: sale.customer?.name ?? sale.customerName ?? "Walk-in" },
      { key: "price-list", label: "Price list", value: sale.priceList },
    ],
  });
  groups.push({
    title: "Paid",
    rows: [
      ...sale.payments.flatMap((payment, index) => [
        {
          key: `paid-${payment.id}`,
          label: payment.label,
          value: formatMoney(Number(payment.amount), payment.currency),
          mono: true,
        },
        ...(payment.tender === "CASH"
          ? []
          : [
              {
                key: `reference-${payment.id}`,
                label: sale.payments.length > 1 ? `Reference ${index + 1}` : "Reference",
                value: payment.reference ?? "None",
                mono: Boolean(payment.reference),
                muted: !payment.reference,
                ...(sale.can.update
                  ? {
                      edit: {
                        field: "paymentReference",
                        type: "text" as const,
                        initial: payment.reference ?? "",
                        mono: true,
                        parse: (text: string) => {
                          const reference = text.trim();
                          if (!reference) throw new Error("Write the reference as the slip shows it.");
                          if (reference.length > 40) throw new Error("Keep the reference to 40 characters.");
                          return { paymentId: payment.id, reference };
                        },
                        requires: [...SELL_UPDATE] as ["retail.sell", "update"],
                      },
                    }
                  : {}),
              },
            ]),
      ]),
      { key: "change", label: "Change", value: usd(sale.change), mono: true },
      ...(Number(sale.deposit) !== 0 ? [{ key: "deposit", label: "Deposit", value: usd(sale.deposit), mono: true }] : []),
    ],
  });
  // Without a fiscal receipt the group keeps only ID checked, where the board puts it.
  const signs = sale.fiscal.state !== "OFF";
  groups.push({
    title: "Fiscal",
    rows: [
      ...(signs
        ? [
            { key: "receipt", label: sale.saleType === "REFUND" ? "Credit note" : "Receipt", value: sale.fiscal.receipt ?? "Not signed yet", mono: Boolean(sale.fiscal.receipt), muted: !sale.fiscal.receipt },
            { key: "day", label: "Day", value: sale.fiscal.dayNo === null ? "—" : String(sale.fiscal.dayNo), mono: sale.fiscal.dayNo !== null },
          ]
        : []),
      { key: "id", label: "ID checked", value: sale.idCheckedAt ? `Yes, ${formatTime(sale.idCheckedAt)}` : "Not needed", muted: !sale.idCheckedAt },
      ...(signs && sale.fiscal.error ? [{ key: "error", label: "Why not", value: sale.fiscal.error }] : []),
    ],
  });
  if (sale.void) {
    groups.push({
      title: "Void",
      rows: [
        { key: "why", label: "Why", value: sale.void.reason ?? "Not given", muted: !sale.void.reason },
        { key: "approved", label: "Approved by", value: sale.void.approvedBy ?? "Not needed", muted: !sale.void.approvedBy },
        { key: "when", label: "When", value: formatWhen(sale.void.at), mono: true },
      ],
    });
  }
  return groups;
}

/** "Send on WhatsApp": straight to the customer's number when there is one, else the sheet asks for it. */
function sendAction(sale: SaleView): RecordAction {
  return {
    key: "send",
    label: "Send on WhatsApp",
    requires: SALES_READ,
    do: sale.customer?.phone ? { event: "send" } : { sheet: "sale-send", id: sale.id },
  };
}

export const saleKind: RecordKind<SaleView> = {
  type: "RetailSale",
  back: { label: "Sales", href: "/retail/sales" },
  queryKey: (id) => ["retail-sale", id],
  load: async (id) => (await fetchJson<{ data: SaleView }>(`/api/v2/retail/sales/${id}`)).data,
  endpoint: (id) => `/api/v2/retail/sales/${id}`,
  title: (sale) => sale.saleNo,
  reference: (sale) => `${sale.till.name} · ${sale.cashier.name}`,
  // Refund and Void join with FLR-02 (packet 56).
  actions: (sale) => [
    { key: "reprint", label: "Reprint the receipt", requires: SALES_READ, do: { print: `/api/v2/retail/sales/${sale.id}/receipt` } },
    sendAction(sale),
  ],
  more: (sale) => [
    { key: "pdf", label: "Export as PDF", requires: SALES_READ, do: { download: `/api/v2/retail/records/RetailSale/${sale.id}/pdf` } },
    ...(sale.review && !sale.review.reviewedAt
      ? [
          {
            key: "reviewed",
            label: "Mark as looked at",
            requires: [[...SELL_UPDATE] as ["retail.sell", "update"]],
            do: { post: { url: `/api/v2/retail/sales/${sale.id}/reviewed`, done: `${sale.saleNo} looked at.` } },
          },
        ]
      : []),
  ],
  chips: (sale) => {
    const chips: RecordChip[] = [saleStateChip(sale.state)];
    const fiscal = fiscalChip(sale);
    if (fiscal) chips.push(fiscal);
    if (sale.review && !sale.review.reviewedAt) chips.push({ label: "To look at", tone: "warn" });
    return chips;
  },
  figure: (sale) => ({ label: "Total", value: usd(sale.total) }),
  kpis: saleKpis,
  chartRanges: {
    options: [
      { key: "today", label: "Today" },
      { key: "week", label: "This week" },
    ],
    initial: "today",
  },
  chart: (sale, range) => {
    const week = range === "week";
    const series = week ? sale.hourly.week : sale.hourly.today;
    return {
      title: week ? "This till this week, by day" : "This till today, by hour",
      unit: week ? "US$, this sale’s day darker" : "US$, this sale’s hour darker",
      bars: series.labels.map((label, index) => ({ label, value: series.values[index] ?? 0, text: usd(series.values[index] ?? 0) })),
      tick: (value) => (value === 0 ? "0" : `US$${formatCount(value)}`),
      mark: series.mark,
    };
  },
  tabs: [
    {
      key: "lines",
      label: "Lines",
      source: "retail-sale-lines",
      parent: "sale",
      allLink: { label: "View the receipt", action: "reprint" },
      totalsText: (sale) => ({ name: `Σ ${count(sale.lines.length, "line", "lines")}` }),
    },
    { key: "payment", label: "Payment", source: "retail-sale-payments", parent: "sale" },
    { key: "receipt", label: "Receipt", source: "retail-sale-receipt", parent: "sale" },
    { key: "refunds", label: "Refunds", source: "retail-sale-refunds", parent: "sale", when: (sale) => sale.refunds.length > 0 },
    { key: "activity", label: "Activity" },
  ],
  rail: saleRail,
  invalidates: [["list", "retail-sales"], ["nav-badges"]],
};
