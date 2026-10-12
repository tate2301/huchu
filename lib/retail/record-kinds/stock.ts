import { fetchJson } from "@/lib/api-client";
import { recountToast } from "@/lib/retail/stock/count-words";
import type { CountView } from "@/lib/retail/stock/counts";
import type { TransferView } from "@/lib/retail/stock/transfer-record";
import { routeWords, transferChip, formatDayTime } from "@/lib/retail/stock/transfer-words";
import { formatCount, formatMoney, formatSigned, formatTime } from "@/lib/workspace/format";

import type { Grant, RecordChart, RecordKind, RecordKpi, RecordStep } from "./types";

/**
 * The stock record kinds: a transfer and a count.
 *
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

/* ── A count (STK-06, CountRecord board) ─────────────────────────────────── */

const COUNT_VIEW: Grant = ["retail.counts", "view"];
const COUNT_UPDATE: Grant = ["retail.counts", "update"];
const COUNT_APPROVE: Grant = ["retail.counts", "approve"];
const COUNT_CANCEL: Grant = ["retail.counts", "delete"];

const countBase = (count: CountView) => `/retail/stock/counts/${count.id}`;
const countApi = (count: CountView) => `/api/v2/retail/stock/counts/${count.id}`;
const isOpen = (count: CountView) => count.status === "COUNTING" || count.status === "TO_APPROVE";
const linesNoun = (n: number) => (n === 1 ? "line" : "lines");
const lineWord = (n: number) => `${formatCount(n)} ${linesNoun(n)}`;

/** Minutes it took, or has taken so far: start to sent. */
function tookMinutes(count: CountView, now = Date.now()): number {
  const end = count.submittedAt ? new Date(count.submittedAt).getTime() : now;
  return Math.max(0, Math.round((end - new Date(count.startedAt).getTime()) / 60000));
}

function countSteps(count: CountView): RecordStep[] {
  const sent = count.status === "TO_APPROVE" || count.status === "APPROVED" || Boolean(count.submittedAt);
  if (count.status === "COUNTING") {
    return [
      { label: "Started", state: "done" },
      { label: "Counted", state: "now" },
      { label: "To approve", state: "todo" },
      { label: "Approved", state: "todo" },
    ];
  }
  return [
    { label: "Started", state: "done" },
    { label: "Counted", state: sent ? "done" : "todo" },
    { label: "To approve", state: count.status === "TO_APPROVE" ? "now" : count.status === "APPROVED" ? "done" : "todo" },
    { label: "Approved", state: count.status === "APPROVED" ? "done" : "todo" },
  ];
}

function countKpis(count: CountView): RecordKpi[] {
  const took = { label: "Took", value: `${formatCount(tookMinutes(count))} min` };
  if (count.status === "COUNTING") {
    const after = { value: "—", note: "after the count" };
    return [
      { label: "Lines", value: formatCount(count.lines), note: `${formatCount(count.counted)} counted` },
      { label: "Differ", ...after },
      { label: "Short", ...after },
      { label: "Over", ...after },
      { ...took, note: `so far, ${count.counter.name}` },
    ];
  }
  const share = count.lines === 0 ? 0 : Math.round((count.differ / count.lines) * 100);
  const short: RecordKpi =
    count.short === undefined
      ? { label: "Short", value: "—", note: "at cost" }
      : count.short.lines === 0
        ? { label: "Short", value: formatMoney(0), note: "nothing short" }
        : { label: "Short", value: formatMoney(count.short.value), lead: formatCount(count.short.lines), leadTone: "bad", note: linesNoun(count.short.lines) };
  const over: RecordKpi =
    count.over === undefined
      ? { label: "Over", value: "—", note: "at cost" }
      : count.over.lines === 0
        ? { label: "Over", value: formatSigned(count.over.value), note: "nothing over" }
        : { label: "Over", value: formatSigned(count.over.value), lead: formatCount(count.over.lines), leadTone: "plain", note: linesNoun(count.over.lines) };
  return [
    { label: "Lines", value: formatCount(count.lines), note: "counted" },
    { label: "Differ", value: formatCount(count.differ), lead: `${share}%`, leadTone: count.differ > 0 ? "warn" : "plain", note: "of the lines" },
    short,
    over,
    { ...took, note: count.counter.name },
  ];
}

/** The history a range draws: the last 3 or 12 months of counts, or all of them. */
export function countsInRange(history: CountView["history"], range: string | null, now = Date.now()): CountView["history"] {
  if (range === "all") return history;
  const months = range === "3" ? 3 : 12;
  const from = new Date(now);
  from.setUTCMonth(from.getUTCMonth() - months);
  return history.filter((point) => new Date(point.at).getTime() >= from.getTime());
}

function countChart(count: CountView, range: string | null): RecordChart | null {
  // Money: only for roles that see cost, and the server sends no history to anyone else.
  if (count.difference === undefined || count.history.length === 0) return null;
  const points = countsInRange(count.history, range);
  const mark = points.findIndex((point) => point.id === count.id);
  return {
    title: "Difference at each count",
    unit: "this shelf",
    bars: points.map((point) => ({
      label: point.countNo,
      // Many bars on a narrow chart: the number alone ("0016") under each.
      ...(points.length > 5 ? { tick: point.countNo.replace(/^CNT-/, "") } : {}),
      value: Math.abs(point.difference),
      text: point.difference === 0 ? "As expected" : formatSigned(point.difference),
    })),
    mark: mark < 0 ? null : mark,
    tick: (value) => (value === 0 ? "0" : formatMoney(value).replace(/\.00$/, "")),
  };
}

export const countKind: RecordKind<CountView> = {
  type: "RetailStockCount",
  back: { label: "Counts", href: "/retail/stock/counts" },
  queryKey: (id) => ["retail-stock-count", id],
  load: async (id) => (await fetchJson<{ data: CountView }>(`/api/v2/retail/stock/counts/${id}`)).data,
  endpoint: (id) => `/api/v2/retail/stock/counts/${id}`,
  title: (count) => count.name,
  reference: (count) => count.countNo,
  actions: (count) => [
    { key: "print", label: "Print count sheet", requires: [COUNT_VIEW], do: { download: `${countApi(count)}/sheet.pdf` } },
    ...(count.status === "TO_APPROVE" && count.differ > 0
      ? [
          {
            key: "recount",
            label: `Recount ${lineWord(count.differ)}`,
            requires: [COUNT_APPROVE],
            do: { post: { url: `${countApi(count)}/recount`, body: {}, done: recountToast(count.differ, count.counter.name) } },
          },
        ]
      : []),
    ...(count.status === "COUNTING"
      ? [
          {
            key: "remind",
            label: "Send the link again",
            requires: [COUNT_UPDATE],
            do: { post: { url: `${countApi(count)}/remind`, done: `${count.counter.name} has the link again.` } },
          },
        ]
      : []),
  ],
  more: (count) => [
    { key: "pdf", label: "Export as PDF", requires: [COUNT_VIEW], do: { download: `/api/v2/retail/records/RetailStockCount/${count.id}/pdf` } },
    ...(isOpen(count)
      ? [{ key: "cancel", label: "Cancel the count", tone: "bad" as const, requires: [COUNT_CANCEL], do: { event: "cancel" } }]
      : []),
  ],
  primary: (count) =>
    count.status === "TO_APPROVE"
      ? { key: "approve", label: "Approve the differences", requires: [COUNT_APPROVE], do: { href: `${countBase(count)}/review` } }
      : count.status === "COUNTING" && count.yours
        ? { key: "count", label: "Count it", requires: [], do: { href: `${countBase(count)}/count` } }
        : null,
  steps: countSteps,
  chips: (count) => [
    ...(count.blind ? [{ label: "Blind count", tone: "plain" as const }] : []),
    ...(count.status === "TO_APPROVE" && count.differ > 0
      ? [{ label: `${lineWord(count.differ)} ${count.differ === 1 ? "differs" : "differ"}`, tone: "warn" as const }]
      : []),
    ...(count.status === "COUNTING"
      ? [{ label: `${formatCount(count.counted)} of ${formatCount(count.lines)} counted`, tone: "info" as const }]
      : []),
    ...(count.status === "APPROVED" ? [{ label: `Approved by ${count.approvedBy ?? "a manager"}`, tone: "ok" as const }] : []),
    ...(count.status === "CANCELLED" ? [{ label: "Cancelled", tone: "plain" as const }] : []),
  ],
  figure: (count) => {
    if (count.status === "COUNTING") return { label: "Difference", value: "—" };
    if (count.difference === undefined) return { label: "Differ", value: formatCount(count.differ) };
    return {
      label: "Difference",
      value: formatSigned(count.difference),
      ...(count.status === "TO_APPROVE" && count.difference !== 0 ? { tone: "warn" as const } : {}),
    };
  },
  kpis: countKpis,
  chartRanges: { options: TRANSFER_RANGES, initial: "12" },
  chart: countChart,
  tabs: [
    {
      key: "differences",
      label: "Differences",
      source: "retail-stock-count-differences",
      parent: "count",
      allLink: { label: (count) => `All ${lineWord(count.lines)}`, tab: "lines" },
      emptyText: (count) => (count.status === "COUNTING" ? "Nothing to compare until the count is in." : "Every line is as expected."),
    },
    {
      key: "lines",
      label: "Every line",
      source: "retail-stock-count-lines",
      parent: "count",
    },
    { key: "activity", label: "Activity" },
  ],
  rail: (count) => {
    const now = new Date();
    const open = isOpen(count);
    return [
      {
        title: "Count",
        rows: [
          {
            key: "name",
            label: "Shelf",
            value: count.name,
            ...(open
              ? {
                  edit: {
                    field: "name",
                    type: "text" as const,
                    initial: count.name,
                    parse: (typed: string) => {
                      const name = typed.trim();
                      if (!name) throw new Error("Name the shelf.");
                      if (name.length > 80) throw new Error("Keep it to 80 characters.");
                      return name;
                    },
                    requires: COUNT_UPDATE,
                  },
                }
              : {}),
          },
          { key: "site", label: "Site", value: count.site.name },
          { key: "started", label: "Started", value: formatDayTime(count.startedAt, now), mono: true },
          {
            key: "finished",
            label: "Finished",
            value: count.submittedAt ? formatDayTime(count.submittedAt, now) : "—",
            mono: Boolean(count.submittedAt),
            muted: !count.submittedAt,
          },
        ],
      },
      {
        title: "People",
        rows: [
          { key: "counter", label: "Counted by", value: count.counter.name },
          { key: "blind", label: "Blind", value: count.blind ? "Yes, expected quantities hidden" : "No, counter sees what is expected" },
          ...(count.status === "APPROVED"
            ? [{ key: "approved", label: "Approved by", value: count.approvedBy ?? "—" }]
            : [{ key: "approves", label: "Approves", value: count.approves }]),
        ],
      },
    ];
  },
  invalidates: [["list", "retail-stock-counts"], ["list", "retail-stock-on-hand"], ["list", "retail-stock-movements"], ["reports"], ["nav-badges"]],
};
