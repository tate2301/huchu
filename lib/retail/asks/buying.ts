import type { Ask } from "@/lib/workspace/ask";
import { formatCount, formatMoney } from "@/lib/workspace/format";

const plural = (n: number, one: string, many: string) => `${formatCount(n)} ${n === 1 ? one : many}`;

/** An order's "Close with what came" (Record board, `ASKS.closeshort`). */
export function closeShortAsk({
  ref,
  unitsToCome,
  linesToCome,
  value,
  currency = "USD",
  supplier,
}: {
  ref: string;
  unitsToCome: number;
  linesToCome: number;
  /** What the order is done at: the value of what was delivered. */
  value: number;
  currency?: string;
  supplier: string;
}): Ask {
  const still = `${plural(unitsToCome, "unit", "units")} across ${plural(linesToCome, "line", "lines")} ${unitsToCome === 1 ? "is" : "are"} still to come.`;
  return {
    title: `Close ${ref} with what came?`,
    body: `${still} Closing stops expecting them: the order is done at ${formatMoney(value, currency)}, ${supplier} is billed for what was delivered, and the lines stop showing as late. You can reopen it until a bill is recorded against it.`,
    keep: "Keep waiting",
    go: "Close the order",
    fill: "action",
  };
}

/** An order never sent and never delivered against: ⋯ › Remove the order. */
export function removeOrderAsk({ ref, supplier }: { ref: string; supplier: string }): Ask {
  return {
    title: `Remove ${ref}?`,
    body: `Nothing has come against it and it was never sent, so nothing in stock or in the books changes. It goes to the bin for 30 days; ${supplier} is not told.`,
    keep: "Keep it",
    go: "Remove the order",
    fill: "bad",
  };
}

/** A requisition's "Cancel the requisition" (Record board, `ASKS.cancelreq`). */
export function cancelRequisitionAsk({
  ref,
  amount,
  currency = "USD",
  orderRef,
  asker,
}: {
  ref: string;
  amount: number;
  currency?: string;
  orderRef: string;
  asker: string;
}): Ask {
  return {
    title: `Cancel ${ref}?`,
    body: `${formatMoney(amount, currency)} for order ${orderRef} is no longer asked for. ${asker}, who asked, gets a message, and the order goes back to unpaid. Nothing was paid out, so no cash moves.`,
    keep: "Keep it",
    go: "Cancel the requisition",
    fill: "bad",
  };
}
