import { fetchJson } from "@/lib/api-client";
import type { TransferView } from "@/lib/retail/stock/transfer-record";
import { routeWords, transferChip, formatDayTime } from "@/lib/retail/stock/transfer-words";
import { formatCount, formatMoney, formatTime } from "@/lib/workspace/format";

import type { Grant, RecordChart, RecordKind, RecordKpi, RecordStep } from "./types";

/**
 * The transfer record kind (30-stock 5.14, TransferRecord board): stock on
 * its way between two sites, then received. "Receive it" and "Change the
 * lines" open their sheets over the record; "Cancel the transfer" asks
 * (`canceltransfer`) on the page. Not binnable: a transfer is called off,
 * never thrown away.
 */

const VIEW: Grant = ["retail.transfers", "view"];
const UPDATE: Grant = ["retail.transfers", "update"];
const CANCEL: Grant = ["retail.transfers", "delete"];

const base = (transfer: TransferView) => `/retail/stock/transfers/${transfer.id}`;
const note = (transfer: TransferView) => `/api/v2/retail/stock/transfers/${transfer.id}/delivery-note.pdf`;

/** On the way with nothing received or written off: its lines and its To can still change. */
export const untouched = (transfer: TransferView) =>
  transfer.status === "ON_THE_WAY" && transfer.received === 0 && transfer.lost === 0;

const tally = (transfer: TransferView) => ({ sent: transfer.units, received: transfer.received, lost: transfer.lost });

const minutesBetween = (from: string, to: string | number) => (new Date(to).getTime() - new Date(from).getTime()) / 60000;

function steps(transfer: TransferView): RecordStep[] {
  if (transfer.status === "ON_THE_WAY") {
    return [
      { label: "Packed", state: "done" },
      { label: "On the way", state: "now" },
      { label: "Received", state: "todo" },
    ];
  }
  return [
    { label: "Packed", state: "done" },
    { label: "On the way", state: "done" },
    { label: "Received", state: transfer.status === "RECEIVED" ? "done" : "todo" },
  ];
}

/** "08:30" today; "yesterday"; "1 Oct". */
function sentDay(transfer: TransferView): string {
  const [day] = formatDayTime(transfer.sentAt, new Date(transfer.now)).split(", ");
  return day === "Today" || day === "Yesterday" ? day!.toLowerCase() : day!;
}

function kpis(transfer: TransferView): RecordKpi[] {
  const units = formatCount(transfer.units);
  const value: RecordKpi =
    transfer.value === undefined
      ? { label: "Received", value: `${formatCount(transfer.received)} of ${units}`, note: "units" }
      : { label: "Value", value: formatMoney(transfer.value), note: "at cost" };
  const holds: RecordKpi =
    transfer.status === "ON_THE_WAY"
      ? {
          label: `${transfer.to.name} holds`,
          // What it will hold once this is in: "1,204", "+540" of it on the way.
          value: formatCount(transfer.toSiteHolds + transfer.toCome),
          lead: `+${formatCount(transfer.toCome)}`,
          leadTone: "ok",
          note: "units once received",
        }
      : { label: `${transfer.to.name} holds`, value: formatCount(transfer.toSiteHolds), note: "units now" };
  return [
    { label: "Lines", value: formatCount(transfer.lines.length), note: transfer.lines.length === 1 ? "product" : "products" },
    { label: "Units", value: units, note: "sent" },
    value,
    { label: "Sent", value: formatTime(transfer.sentAt), lead: sentDay(transfer), leadTone: "plain", note: `by ${transfer.sentBy}` },
    holds,
  ];
}

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

/** "2026-07" → "Jul"; another year than the newest bar's adds it: "Jul 2025". */
function monthLabel(key: string, newestYear: string): string {
  const [year, month] = key.split("-").map(Number) as [number, number];
  const name = MONTH.format(new Date(Date.UTC(year, month - 1, 15)));
  return String(year) === newestYear ? name : `${name} ${year}`;
}

export const TRANSFER_RANGES = [
  { key: "3", label: "3 months" },
  { key: "12", label: "12 months" },
  { key: "all", label: "All time" },
];

/** The months a range draws: the last 3 or 12, or from the first month anything moved (at least 12). */
export function monthsInRange(history: TransferView["history"], range: string | null): TransferView["history"] {
  if (range === "3") return history.slice(-3);
  if (range === "all") {
    const first = history.findIndex((month) => month.transfers > 0);
    return history.slice(first < 0 ? -12 : Math.min(first, history.length - 12));
  }
  return history.slice(-12);
}

function chart(transfer: TransferView, range: string | null): RecordChart {
  const months = monthsInRange(transfer.history, range);
  const newestYear = months[months.length - 1]?.month.slice(0, 4) ?? "";
  return {
    title: "Moved between the sites, by month",
    unit: "transfers",
    bars: months.map((month) => {
      const label = monthLabel(month.month, newestYear);
      return {
        label,
        // The axis names the month; the tooltip adds another year's number.
        tick: label.split(" ")[0],
        value: month.transfers,
        text: `${formatCount(month.transfers)} ${month.transfers === 1 ? "transfer" : "transfers"}`,
      };
    }),
    tick: (value) => (value === 0 ? "0" : Number.isInteger(value) ? `${formatCount(value)} transfers` : ""),
  };
}

export const transferKind: RecordKind<TransferView> = {
  type: "RetailStockTransfer",
  back: { label: "Transfers", href: "/retail/stock/transfers" },
  queryKey: (id) => ["retail-stock-transfer", id],
  load: async (id) => (await fetchJson<{ data: TransferView }>(`/api/v2/retail/stock/transfers/${id}`)).data,
  endpoint: (id) => `/api/v2/retail/stock/transfers/${id}`,
  title: (transfer) => routeWords(transfer.from.name, transfer.to.name),
  reference: (transfer) => transfer.transferNo,
  actions: (transfer) => [
    { key: "print", label: "Print delivery note", requires: [VIEW], do: { open: `${note(transfer)}?print=1` } },
    ...(untouched(transfer)
      ? [
          {
            key: "lines",
            label: "Change the lines",
            requires: [UPDATE],
            do: { href: `${base(transfer)}?sheet=transfer-lines&id=${transfer.id}` },
          },
        ]
      : []),
  ],
  more: (transfer) => [
    { key: "pdf", label: "Export as PDF", requires: [VIEW], do: { download: note(transfer) } },
    ...(transfer.status === "ON_THE_WAY"
      ? [{ key: "cancel", label: "Cancel the transfer", tone: "bad" as const, requires: [CANCEL], do: { event: "cancel" } }]
      : []),
  ],
  primary: (transfer) =>
    transfer.status === "ON_THE_WAY"
      ? {
          key: "receive",
          label: "Receive it",
          requires: [UPDATE],
          do: { href: `${base(transfer)}?sheet=transfer-receive&id=${transfer.id}` },
        }
      : null,
  steps,
  chips: (transfer) => {
    const minutes =
      transfer.status === "RECEIVED" && transfer.receivedAt
        ? minutesBetween(transfer.sentAt, transfer.receivedAt)
        : minutesBetween(transfer.sentAt, Date.now());
    return [transferChip(transfer.status, minutes, tally(transfer))];
  },
  figure: (transfer) =>
    transfer.value === undefined
      ? { label: "Units", value: formatCount(transfer.units) }
      : { label: "Value", value: formatMoney(transfer.value) },
  kpis,
  chartRanges: { options: TRANSFER_RANGES, initial: "12" },
  chart,
  tabs: [
    {
      key: "lines",
      label: "Lines",
      source: "retail-stock-transfer-lines",
      parent: "transfer",
      columns: ["product", "sent", "received", "cost", "value"],
      allLink: {
        label: "All transfers",
        href: (transfer) => `/retail/stock/transfers?from=${transfer.from.id}&to=${transfer.to.id}&tab=all`,
      },
      totalsText: (transfer) => ({
        product: `Σ ${formatCount(transfer.lines.length)} ${transfer.lines.length === 1 ? "line" : "lines"}`,
        ...(transfer.received === 0 && transfer.lost === 0 ? { received: "—" } : {}),
      }),
    },
    { key: "activity", label: "Activity" },
  ],
  rail: (transfer) => {
    const canMove = untouched(transfer);
    const text = (field: "vehicle" | "driver" | "note", label: string) => ({
      key: field,
      label,
      value: transfer[field] ?? "Not said",
      muted: !transfer[field],
      edit: {
        field,
        type: "text" as const,
        initial: transfer[field] ?? "",
        parse: (typed: string) => typed.trim() || null,
        requires: UPDATE,
      },
    });
    return [
      {
        title: "Transfer",
        rows: [
          { key: "from", label: "From", value: transfer.from.name },
          {
            key: "to",
            label: "To",
            value: transfer.to.name,
            ...(canMove
              ? {
                  edit: {
                    field: "toSiteId",
                    type: "auto" as const,
                    initial: transfer.to.id,
                    lookup: { noun: "site", picked: { id: transfer.to.id, label: transfer.to.name } },
                    parse: (value: string) => {
                      if (!value) throw new Error("Pick the site it goes to.");
                      return value;
                    },
                    requires: UPDATE,
                  },
                }
              : {}),
          },
          { key: "sent", label: "Sent", value: formatDayTime(transfer.sentAt, new Date(transfer.now)), mono: true },
          { key: "sent-by", label: "Sent by", value: transfer.sentBy },
          ...(transfer.receivedAt
            ? [
                { key: "received", label: "Received", value: formatDayTime(transfer.receivedAt, new Date(transfer.now)), mono: true },
                { key: "received-by", label: "Received by", value: transfer.receivedBy ?? "—" },
              ]
            : []),
        ],
      },
      { title: "Moving", rows: [text("vehicle", "Vehicle"), text("driver", "Driver"), text("note", "Note")] },
    ];
  },
  invalidates: [["list", "retail-stock-transfers"], ["list", "retail-stock-on-hand"], ["list", "retail-stock-movements"], ["reports"]],
};
