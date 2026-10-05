import type { ReportRow } from "@/lib/reports/types";
import { unpairShiftOpen } from "@/lib/retail/till-words";
import type { Ask } from "@/lib/workspace/ask";

import type { ListActionRun } from "./runs";

/**
 * Unpair on a till (10-setup 5.5, inferred). With a shift open on it the
 * server refuses, so the body is that sentence and only "Keep it" is offered.
 */
export function unpairAsk(till: string, device: string, refusal: string | null = null): Ask {
  return {
    title: `Unpair ${till}?`,
    body:
      refusal ??
      `${device} stops being a till at its next request. Sales it holds offline still come in, flagged for you. The till stays, ready for another device.`,
    keep: "Keep it",
    go: refusal ? "" : "Unpair",
    fill: "bad",
  };
}

/** The same ask from a row of Tills and devices: who is on it now is its open shift. */
export function unpairRowAsk(row: ReportRow): Ask {
  const till = String(row.name ?? "this till");
  const cashier = typeof row.cashier === "string" && row.cashier ? row.cashier : null;
  return unpairAsk(till, String(row.device ?? "Its device"), cashier ? unpairShiftOpen(till, cashier) : null);
}

/** The list's row menu Unpair (`POST /tills/{id}/unpair`): the TillEdit confirm, then "{till} unpaired.". */
export const TILL_LIST_RUNS: Record<string, ListActionRun> = {
  unpairtill: {
    ask: (_count, rows) => unpairRowAsk(rows[0] ?? { id: "" }),
    done: (_count, rows) => `${String(rows[0]?.name ?? "The till")} unpaired.`,
  },
};
