import type { ReportRow } from "@/lib/reports/types";
import type { Ask } from "@/lib/workspace/ask";
import { formatCount } from "@/lib/workspace/format";
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
};
