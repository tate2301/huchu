import type { Ask } from "@/lib/workspace/ask";
import { formatMoney } from "@/lib/workspace/format";

import type { ListActionRun } from "./runs";

/**
 * The floor's list runs (50-floor): a receipt sent on WhatsApp from a sale's
 * row, and "Send receipts" over ticked sales. While WhatsApp is not
 * connected the messages wait and the toast says so (98-decisions C-04).
 */

type Sent = { to?: string; waiting?: boolean };
type SentMany = { sent?: number; noNumber?: number };

/** "Sent to ••• 1144 on WhatsApp." or, not connected yet, "Queued for ••• 1144. It goes once WhatsApp is connected." */
export function sentWords(answer: Sent | null | undefined): string {
  const to = answer?.to ?? "the customer";
  return answer?.waiting ? `Queued for ${to}. It goes once WhatsApp is connected.` : `Sent to ${to} on WhatsApp.`;
}

/** "4 receipts sent. 2 sales have no customer number." */
export function sentManyWords(answer: SentMany | null | undefined): string {
  const sent = answer?.sent ?? 0;
  const none = answer?.noNumber ?? 0;
  const head = `${sent} ${sent === 1 ? "receipt" : "receipts"} sent.`;
  if (!none) return head;
  return `${head} ${none} ${none === 1 ? "sale has" : "sales have"} no customer number.`;
}

export const FLOOR_LIST_RUNS: Record<string, ListActionRun> = {
  "send-receipt": {
    body: () => ({}),
    done: (_count, _rows, answer) => sentWords(answer as Sent),
  },
  "send-receipts": {
    done: (_count, _rows, answer) => {
      const words = sentManyWords(answer as SentMany);
      return (answer as SentMany | null)?.noNumber ? { title: words, variant: "warning" } : words;
    },
  },
};

/**
 * "Close SH-00240 without counting?" (W-39, a lost handheld): nobody counts
 * the drawer, so it closes Not counted with what should be in it left on the
 * shift, for a manager to sign off. Why is needed.
 */
export function closeUncountedAsk(shift: { shiftNo: string; expectedCash: number }): Ask {
  return {
    title: `Close ${shift.shiftNo} without counting?`,
    body: `Nobody counts the drawer. It closes as Not counted, the ${formatMoney(shift.expectedCash)} that should be in it stays on the shift, and a manager has to sign it off.`,
    keep: "Keep it open",
    go: "Close without counting",
    fill: "bad",
    field: { key: "reason", label: "Why", placeholder: "The handheld was lost, for example", min: 3, max: 300, needed: "Say why it was not counted." },
  };
}
