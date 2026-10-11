import type { ReportRow } from "@/lib/reports/types";
import type { Ask } from "@/lib/workspace/ask";
import { formatCount, formatMoney, formatSigned } from "@/lib/workspace/format";
import { approvedCountsToast } from "@/lib/retail/stock/count-words";
import { reversedToast, type Skipped } from "@/lib/retail/stock/reverse-words";

import type { ListActionRun } from "./runs";

/** Movements › tick rows › Reverse (30-stock 5.22 `reversemovements`). */
export function reverseMovementsAsk(count: number): Ask {
  if (count === 1) {
    return {
      title: "Reverse 1 movement?",
      body: "It goes back with a movement the other way, dated now, and the books follow. Sales, deliveries, counts and transfers are not reversed here; open them instead.",
      keep: "Keep it",
      go: "Reverse it",
      fill: "bad",
    };
  }
  return {
    title: `Reverse ${formatCount(count)} movements?`,
    body: "Each goes back with a movement the other way, dated now, and the books follow. Sales, deliveries, counts and transfers are not reversed here; open them instead.",
    keep: "Keep them",
    go: "Reverse them",
    fill: "bad",
  };
}

/** A transfer's ⋯ › Cancel the transfer (30-stock 5.22 `canceltransfer`). */
export function cancelTransferAsk(input: { transferNo: string; units: number; from: string; to: string }): Ask {
  return {
    title: `Cancel ${input.transferNo}?`,
    body:
      input.units === 1
        ? `The 1 unit on the way goes back on ${input.from}’s stock, as if it never left. ${input.to} is told.`
        : `The ${formatCount(input.units)} units on the way go back on ${input.from}’s stock, as if they never left. ${input.to} is told.`,
    keep: "Keep it on the way",
    go: "Cancel the transfer",
    fill: "bad",
  };
}

/** Transfers › tick rows › Cancel (30-stock 5.22 `canceltransfers`). */
export function cancelTransfersAsk(count: number): Ask {
  return {
    title: `Cancel ${formatCount(count)} ${count === 1 ? "transfer" : "transfers"}?`,
    body: "Everything still on the way goes back on the stock of the site it came from. Received transfers are left as they are.",
    keep: count === 1 ? "Keep it" : "Keep them",
    go: count === 1 ? "Cancel it" : "Cancel them",
    fill: "bad",
  };
}

type CancelAnswer = { cancelled?: string[]; skipped?: string[] };

/** "TRF-0008 cancelled.", "2 transfers cancelled.", and what was left as it was. */
export function cancelledToast(answer: CancelAnswer): string | { title: string; variant: "warning" } {
  const cancelled = answer.cancelled ?? [];
  const skipped = answer.skipped ?? [];
  const done =
    cancelled.length === 0
      ? "Nothing was cancelled."
      : cancelled.length === 1
        ? `${cancelled[0]} cancelled.`
        : `${formatCount(cancelled.length)} transfers cancelled.`;
  if (skipped.length === 0) return done;
  const left =
    skipped.length === 1
      ? `${skipped[0]} was received or cancelled already and is left as it is.`
      : `${formatCount(skipped.length)} were received or cancelled already and are left as they are.`;
  return { title: `${done} ${left}`, variant: "warning" };
}

/** One transfer's row to hand reads as that transfer; anything else as a count. */
function cancelAsk(count: number, rows: ReportRow[]): Ask {
  const row = count === 1 ? rows[0] : undefined;
  if (row?.transferNo && row.status === "ON_THE_WAY") {
    return cancelTransferAsk({
      transferNo: String(row.transferNo),
      units: Number(row.units ?? 0),
      from: String(row.from ?? ""),
      to: String(row.to ?? ""),
    });
  }
  return cancelTransfersAsk(count);
}

/** A count's "Cancel the count" (STK-06 `cancelcount`), on the record, the review page and the Counts row menu. */
export function cancelCountAsk(input: { countNo: string; counter: string }): Ask {
  return {
    title: `Cancel ${input.countNo}?`,
    body: `Nothing on hand changes. What has been counted stays on the count for the record, and ${input.counter} is told it is off.`,
    keep: "Keep the count",
    go: "Cancel the count",
    fill: "bad",
  };
}

/**
 * Counts › tick rows › Approve the differences (STK-06 `approvecounts`):
 * "Approve 2 counts?" with the lines and the net of the ticked rows, and the
 * owner's limit when the shop has one.
 */
export function approveCountsAsk(input: { counts: number; lines: number; net: number | null; ownerOver: number | null }): Ask {
  const counts = input.counts === 1 ? "1 count" : `${formatCount(input.counts)} counts`;
  const lines = `${formatCount(input.lines)} ${input.lines === 1 ? "line" : "lines"}`;
  const posted =
    input.net === null || input.net === 0
      ? `Stock on hand becomes what was counted for ${lines}.`
      : `Stock on hand becomes what was counted for ${lines}, and ${formatSigned(input.net)} is posted to Breakage and losses.`;
  const limit = input.ownerOver === null ? "" : ` A count over ${formatMoney(input.ownerOver)} waits for the owner.`;
  return {
    title: `Approve ${counts}?`,
    body: `${posted}${limit}`,
    keep: "Not yet",
    go: "Approve the differences",
    fill: "action",
  };
}

const rowNumber = (row: ReportRow | undefined, key: string): number | null =>
  row && row[key] !== null && row[key] !== undefined && row[key] !== "" ? Number(row[key]) : null;

type ReverseAnswer = { reversed?: unknown[]; skipped?: Array<Pick<Skipped, "kind">> };

/** The Movements list's actions that post to the server (`do: { run }`). */
export const STOCK_LIST_RUNS: Record<string, ListActionRun> = {
  reversemovements: {
    ask: (count) => reverseMovementsAsk(count),
    done: (count, _rows, answer) => {
      const body = (answer ?? {}) as ReverseAnswer;
      return reversedToast({ reversed: body.reversed ?? new Array(count), skipped: body.skipped ?? [] });
    },
  },
  canceltransfers: {
    ask: cancelAsk,
    done: (_count, _rows, answer) => cancelledToast((answer ?? {}) as CancelAnswer),
  },
  cancelcount: {
    ask: (_count, rows) => cancelCountAsk({ countNo: String(rows[0]?.countNo ?? "the count"), counter: String(rows[0]?.counter ?? "The counter") }),
    done: (_count, rows) => `${String(rows[0]?.countNo ?? "The count")} cancelled. Nothing on hand changed.`,
  },
  approvecounts: {
    ask: (count, rows) => {
      // Only the rows that wait for approval are approved: their lines and their net.
      const waiting = rows.filter((row) => row.status === "TO_APPROVE");
      const nets = waiting.map((row) => rowNumber(row, "difference"));
      return approveCountsAsk({
        counts: rows.length > 0 ? waiting.length : count,
        lines: waiting.reduce((sum, row) => sum + (rowNumber(row, "lineCount") ?? 0), 0),
        net: nets.some((net) => net === null) ? null : Math.round(nets.reduce((sum: number, net) => sum + (net ?? 0), 0) * 100) / 100,
        ownerOver: rowNumber(rows[0], "ownerOver"),
      });
    },
    done: (_count, _rows, answer) => {
      const body = (answer ?? {}) as Partial<{ approved: string[]; waiting: string[]; skipped: string[] }>;
      const said = approvedCountsToast({ approved: body.approved ?? [], waiting: body.waiting ?? [], skipped: body.skipped ?? [] });
      return (body.waiting?.length ?? 0) + (body.skipped?.length ?? 0) > 0 ? { title: said, variant: "warning" } : said;
    },
  },
};
