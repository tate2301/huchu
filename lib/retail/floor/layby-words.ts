import type { Ask } from "@/lib/workspace/ask";
import { formatDay, formatMoney } from "@/lib/workspace/format";

/**
 * Lay-bys in words (FLR-06, 58-floor-laybys): the toasts, the cancel ask and
 * the messages a customer gets. Browser-safe: the sheets, the list's runs and
 * the server share it.
 */

/** "US$26.00". */
export const usd = (value: number | string) => formatMoney(Number(value));

/** "20 October" from `2026-10-20`. */
export function dayMonth(day: string): string {
  return formatDay(`${day}T12:00:00Z`).replace(/ \d{4}$/, "");
}

/** "20 October 2026" from `2026-10-20`. */
export function longDay(day: string): string {
  return formatDay(`${day}T12:00:00Z`);
}

/** "Hennessy VS 700ml, gift box", "Castle Lager x4, Savanna Dry x2": what a lay-by puts aside. */
export function laybyWhat(lines: ReadonlyArray<{ name: string; quantity: number }>): string {
  return lines.map((line) => (line.quantity > 1 ? `${line.name} x${formatQuantity(line.quantity)}` : line.name)).join(", ");
}

const formatQuantity = (value: number) => (Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4))));

/** "LAY-0032 started. US$26.00 left to pay by 20 October." */
export function startedWords(answer: { laybyNo: string; left: string; dueOn: string }): string {
  return `${answer.laybyNo} started. ${usd(answer.left)} left to pay by ${dayMonth(answer.dueOn)}.`;
}

/** "US$13.00 taken. US$13.00 left." or, paid in full, "US$26.00 taken. LAY-0031 is paid. Hand it over when they come." */
export function paidWords(answer: { laybyNo: string; amount: string; left: string; status: string }): string {
  if (answer.status === "READY") return `${usd(answer.amount)} taken. ${answer.laybyNo} is paid. Hand it over when they come.`;
  return `${usd(answer.amount)} taken. ${usd(answer.left)} left.`;
}

/** "Pay by moved to 27 October." */
export const dueMovedWords = (dueOn: string) => `Pay by moved to ${dayMonth(dueOn)}.`;

/** "LAY-0031 handed over as SALE-31871." */
export const handedOverWords = (answer: { laybyNo: string; saleNo: string }) => `${answer.laybyNo} handed over as ${answer.saleNo}.`;

/** "LAY-0031 cancelled. US$18.00 paid back, US$2.00 kept as the fee." */
export const cancelledWords = (answer: { laybyNo: string; paidBack: string; fee: string }) =>
  `${answer.laybyNo} cancelled. ${usd(answer.paidBack)} paid back, ${usd(answer.fee)} kept as the fee.`;

/** The `cancellayby` ask: who paid what, what goes back and how, and the goods back on the shelf. */
export function cancelLaybyAsk(input: {
  laybyNo: string;
  customer: string;
  paid: string;
  paidBack: string;
  fee: string;
  /** "EcoCash", "Cash". */
  by: string;
  what: string;
  /** More than one thing goes back: "go back on the shelf". */
  many: boolean;
}): Ask {
  const shelf = `${input.what} ${input.many ? "go" : "goes"} back on the shelf`;
  const money =
    Number(input.fee) > 0
      ? `${usd(input.paidBack)} goes back by ${input.by}, ${usd(input.fee)} is kept as the fee in Till rules, and ${shelf}.`
      : `It all goes back by ${input.by}, and ${shelf}.`;
  return {
    title: `Cancel ${input.laybyNo}?`,
    body: `${input.customer} paid ${usd(input.paid)}. ${money}`,
    keep: "Keep it",
    go: "Cancel the lay-by",
    fill: "bad",
  };
}

/* ── What the customer is sent ─────────────────────────────────────────── */

/** "LAY-0032 at Harare Bottle Store: US$20.00 paid, US$26.00 left to pay by 20 October." */
export const startedMessage = (input: { laybyNo: string; shop: string; paid: string; left: string; dueOn: string }) =>
  `${input.laybyNo} at ${input.shop}: ${usd(input.paid)} paid, ${usd(input.left)} left to pay by ${dayMonth(input.dueOn)}.`;

/** "LAY-0031 is paid. Collect it at Harare Bottle Store any time." */
export const readyMessage = (input: { laybyNo: string; shop: string }) => `${input.laybyNo} is paid. Collect it at ${input.shop} any time.`;

/** The reminder's own placeholders and its default words (packet 55's registry). */
export const LAYBY_PLACEHOLDERS = ["first name", "lay-by", "left", "due"] as const;
export const laybyReminderBody = (shop: string) => `Hi {first name}, {lay-by} at ${shop}: {left} left to pay by {due}.`;
