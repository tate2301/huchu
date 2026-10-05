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
};
