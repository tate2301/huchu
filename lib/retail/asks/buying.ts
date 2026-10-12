import type { Ask } from "@/lib/workspace/ask";
import { formatCount, formatDay, formatMoney } from "@/lib/workspace/format";

import type { ListActionRun } from "./runs";

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

/** "on WhatsApp" / "by email" / null (nobody to tell). */
type TellChannel = "WHATSAPP" | "EMAIL" | "BY_HAND";

/** "Cancel what is left" on an order (`cancelrest`, **Defined here**). */
export function cancelRestAsk({
  ref,
  units,
  lines,
  supplier,
  channel,
  anythingCame,
}: {
  ref: string;
  units: number;
  lines: number;
  supplier: string;
  channel: TellChannel;
  anythingCame: boolean;
}): Ask {
  const told =
    channel === "WHATSAPP" ? `${supplier} is told on WhatsApp.` : channel === "EMAIL" ? `${supplier} is told by email.` : `${supplier} has no WhatsApp number or email; tell them yourself.`;
  const came = anythingCame ? "What came stays in stock and is billed as usual." : "Nothing came, so the order is cancelled.";
  return {
    title: `Cancel what is left of ${ref}?`,
    body: `${plural(units, "unit", "units")} across ${plural(lines, "line", "lines")} will not come. ${told} ${came} This cannot be undone; order again if you need them.`,
    keep: "Keep the order",
    go: "Cancel what is left",
    fill: "bad",
  };
}

/** "PO-0004 to Pamela on WhatsApp and PO-0007 to Delta Beverages on WhatsApp." */
function listWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** Orders' bulk "Send to suppliers" (`sendorders`, **Defined here**): each order, to whom and how. */
export function sendOrdersAsk(orders: Array<{ poNo: string; supplier: string; how: string }>, count = orders.length): Ask {
  const named = orders.length === count && orders.length > 0;
  return {
    title: `Send ${plural(count, "order", "orders")}?`,
    body: named
      ? `${listWords(orders.map((order) => `${order.poNo} to ${order.supplier} ${order.how}`))}.`
      : "Each goes to its supplier the way they take orders. Drafts with no lines are left.",
    keep: "Not yet",
    go: `Send ${formatCount(count)}`,
    fill: "action",
  };
}

/** Orders' bulk "Cancel" (`cancelorders`, **Defined here**). */
export function cancelOrdersAsk(count: number): Ask {
  return {
    title: `Cancel ${plural(count, "order", "orders")}?`,
    body: "Drafts go to the bin for 30 days. Sent orders have what is left cancelled and their suppliers are told. Orders that are done are left alone.",
    keep: "Keep them",
    go: `Cancel ${formatCount(count)}`,
    fill: "bad",
  };
}

/**
 * A requisition's "Cancel the requisition" (Record board, `ASKS.cancelreq`): for an order, or an expense
 * (`whatFor`); when the asker cancels their own, those who were to approve it are told instead.
 */
export function cancelRequisitionAsk({
  ref,
  amount,
  currency = "USD",
  orderRef = null,
  whatFor = null,
  asker,
  byAsker = false,
  approver = null,
}: {
  ref: string;
  amount: number;
  currency?: string;
  orderRef?: string | null;
  whatFor?: string | null;
  asker: string;
  byAsker?: boolean;
  /** Who it waits for (the owner approver), or null: the managers. */
  approver?: string | null;
}): Ask {
  const what = orderRef ? `order ${orderRef}` : (whatFor ?? "it");
  const told = byAsker
    ? approver
      ? `${approver}, who was to approve it, gets a message`
      : "The managers, who were to approve it, get a message"
    : `${asker}, who asked, gets a message`;
  return {
    title: `Cancel ${ref}?`,
    body: `${formatMoney(amount, currency)} for ${what} is no longer asked for. ${told}${orderRef ? ", and the order goes back to unpaid" : ""}. Nothing was paid out, so no cash moves.`,
    keep: "Keep it",
    go: "Cancel the requisition",
    fill: "bad",
  };
}

/** Bulk "Approve" on Requisitions (`approvemany`, **Defined here**): each at the amount asked; what a manager cannot approve is said. */
export function approveManyAsk({
  count,
  total,
  askers,
  leftFor = [],
}: {
  count: number;
  total: number;
  askers: string[];
  /** "REQ-0014 is over US$500.00 and is left for Tendai Mhlanga." */
  leftFor?: string[];
}): Ask {
  const names = [...new Set(askers)];
  const told = names.length === 0 ? "" : names.length === 1 ? ` ${names[0]} is told.` : ` ${names.slice(0, -1).join(", ")} and ${names.at(-1)} are told.`;
  return {
    title: `Approve ${plural(count, "requisition", "requisitions")}?`,
    body: `${formatMoney(total)} in all, each at the amount asked.${told}${leftFor.length ? ` ${leftFor.join(" ")}` : ""}`,
    keep: "Not yet",
    go: `Approve ${formatCount(count)}`,
    fill: "action",
  };
}

/** ⋯ "Stop buying from them" on a supplier (`stopbuying`, **Defined here**). */
export function stopBuyingAsk(name: string): Ask {
  return {
    title: `Stop buying from ${name}?`,
    body: "They leave the supplier list and every supplier field. Bills, payments and past orders stay. You can start buying from them again from their record.",
    keep: "Keep buying",
    go: "Stop buying",
    fill: "bad",
  };
}

/** A contact's "Remove" (`removecontact`, **Defined here**). */
export function removeContactAsk(name: string, supplier: string): Ask {
  return {
    title: `Remove ${name}?`,
    body: `${supplier} keeps everything sent to them. If they were the rep, the supplier has no rep until you choose one.`,
    keep: "Keep them",
    go: "Remove",
    fill: "bad",
  };
}

/** The answer's own sentence ("PO-0031 sent to Delta Beverages on WhatsApp."), else the fallback. */
const said = (answer: unknown, fallback: string) => {
  const message = (answer as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : fallback;
};

/** "PO-0007 is in the bin. You can restore it until 3 November." */
export function orderBinnedWords(poNo: string, keptUntil: string | null | undefined): string {
  return keptUntil ? `${poNo} is in the bin. You can restore it until ${formatDay(keptUntil).replace(/ \d{4}$/, "")}.` : `${poNo} is in the bin.`;
}

/** Suppliers', a supplier's contacts', orders' and an order's messages' row actions. */
export const BUYING_LIST_RUNS: Record<string, ListActionRun> = {
  stopbuying: {
    ask: (_count, rows) => stopBuyingAsk(String(rows[0]?.name ?? "them")),
    done: (_count, rows) => `You stopped buying from ${String(rows[0]?.name ?? "them")}.`,
  },
  makerep: {
    method: "PATCH",
    body: (ids) => ({ repContactId: ids[0] }),
    done: (_count, rows) => `${String(rows[0]?.name ?? "They")} is the rep now.`,
  },
  sendorder: {
    done: (_count, rows, answer) => said(answer, `${String(rows[0]?.poNo ?? "The order")} sent.`),
  },
  duplicateorder: {
    done: (_count, rows, answer) => said(answer, `${String(rows[0]?.poNo ?? "The order")} duplicated.`),
  },
  closeshort: {
    ask: (_count, rows) =>
      closeShortAsk({
        ref: String(rows[0]?.poNo ?? "the order"),
        unitsToCome: Number(rows[0]?.stillUnits ?? 0),
        linesToCome: Number(rows[0]?.linesOwed ?? 0),
        value: Number(rows[0]?.deliveredValue ?? 0),
        supplier: String(rows[0]?.supplierShort ?? "The supplier"),
      }),
    done: (_count, rows, answer) => said(answer, `${String(rows[0]?.poNo ?? "The order")} closed with what came.`),
  },
  removeorder: {
    ask: (_count, rows) => removeOrderAsk({ ref: String(rows[0]?.poNo ?? "the order"), supplier: String(rows[0]?.supplier ?? "The supplier") }),
    body: (ids) => ({ kind: "order", id: ids[0] }),
    done: (_count, rows, answer) => orderBinnedWords(String(rows[0]?.poNo ?? "The order"), (answer as { keptUntil?: string } | null)?.keptUntil),
  },
  sendorders: {
    ask: (count, rows) =>
      sendOrdersAsk(
        rows.map((row) => ({ poNo: String(row.poNo ?? ""), supplier: String(row.supplier ?? ""), how: String(row.sendWords ?? "") })),
        count,
      ),
    done: (count, _rows, answer) => {
      const skipped = (answer as { skipped?: unknown[] } | null)?.skipped ?? [];
      const words = said(answer, `${plural(count, "order", "orders")} sent.`);
      return skipped.length ? { title: words, variant: "warning" } : words;
    },
  },
  cancelorders: {
    ask: (count) => cancelOrdersAsk(count),
    done: (count, _rows, answer) => {
      const skipped = (answer as { skipped?: unknown[] } | null)?.skipped ?? [];
      const words = said(answer, `${plural(count, "order", "orders")} cancelled.`);
      return skipped.length ? { title: words, variant: "warning" } : words;
    },
  },
  sendagain: {
    done: (_count, _rows, answer) => said(answer, "It is queued to send again."),
  },
  // Requisitions (5.8): the row's Approve, Cancel the requisition, and the bulk Approve.
  approvereq: {
    done: (_count, rows, answer) => said(answer, `${String(rows[0]?.requisitionNo ?? "It")} approved.`),
  },
  cancelreq: {
    ask: (_count, rows) =>
      cancelRequisitionAsk({
        ref: String(rows[0]?.requisitionNo ?? "the requisition"),
        amount: Number(rows[0]?.amount ?? 0),
        currency: String(rows[0]?.currency ?? "USD"),
        orderRef: rows[0]?.orderNo ? String(rows[0].orderNo) : null,
        whatFor: rows[0]?.orderNo ? null : String(rows[0]?.purpose ?? "it").toLowerCase(),
        asker: String(rows[0]?.askedBy ?? "The asker"),
        byAsker: rows[0]?.mine === "yes",
        approver: rows[0]?.approverName ? String(rows[0].approverName) : null,
      }),
    done: (_count, rows, answer) => said(answer, `${String(rows[0]?.requisitionNo ?? "It")} cancelled.`),
  },
  approvemany: {
    ask: (count, rows) => {
      const left = rows.filter((row) => row.decidable !== "yes");
      const going = rows.filter((row) => row.decidable === "yes");
      return approveManyAsk({
        count: going.length || count,
        total: going.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
        askers: going.map((row) => String(row.askedBy ?? "")).filter(Boolean),
        leftFor: left.map((row) => `${String(row.requisitionNo)} ${String(row.cannotWhy ?? "cannot be approved by you.")}`),
      });
    },
    done: (_count, _rows, answer) => {
      const skipped = (answer as { skipped?: unknown[] } | null)?.skipped ?? [];
      const words = said(answer, "Approved.");
      return skipped.length ? { title: words, variant: "warning" } : words;
    },
  },
  removecontact: {
    method: "DELETE",
    ask: (_count, rows) => removeContactAsk(String(rows[0]?.name ?? "them"), String(rows[0]?.supplier ?? "The supplier")),
    done: (_count, rows) => `${String(rows[0]?.name ?? "They")} removed.`,
  },
};
