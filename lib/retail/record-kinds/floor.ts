import { fetchJson } from "@/lib/api-client";
import type { ShiftRecordView } from "@/lib/retail/shift-record";
import { salesWords, takingsTitle } from "@/lib/retail/shift-words";
import { formatDay, formatDuration, formatMoney, formatSigned, formatTime, formatCount } from "@/lib/workspace/format";

import type { RecordChip, RecordKind, RecordStep } from "./types";

/**
 * The shift record kind (00-foundations 5.6.10, ShiftRecord board): the
 * reference record. FND wires "Export as PDF", "Print X-report" (open) or
 * "Print Z-report" (closed) and the existing count and close; the floor spec
 * adds the cash move, staff message, sign-off and close without counting.
 */

const CASH_CONTROL = ["retail.cash-control", "view"] as const;
const OWN_TILL = ["retail.sell", "open-shift"] as const;

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
          {
            key: "x-report",
            label: "Print X-report",
            requires: [[...CASH_CONTROL], [...OWN_TILL]],
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
      { label: "Opening float", value: formatMoney(shift.openingFloat), lead: formatTime(shift.openedAt), leadTone: "plain", note: "counted in" },
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
