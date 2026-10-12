import { formatCount } from "@/lib/workspace/format";

import type { OrderState } from "./figures";

/**
 * Buying's words for orders (40-buying 3.2, 5.3, 5.4): the state badge, the
 * supplier's short name, a product's short name for a chart's bars, how an
 * order is paid. Pure, so the list, the record and the messages read alike.
 */

export type BadgeTone = "neutral" | "info" | "warn" | "bad" | "hollow" | "ok";

/** "Delta Beverages" → "Delta": the supplier as the buttons name it ("Send to Delta"). */
export function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** A size token: "340ml", "1L", "750ml", "2kg", "24". */
const SIZE = /^\d+(?:[.,]\d+)?(?:ml|l|cl|kg|g)$/i;

/**
 * A product's name on a chart's bar: its first word and its size, "Castle
 * 340ml", "Chibuku 1L", "Coca-Cola 500ml"; the whole name when it has no size.
 */
export function shortName(name: string): string {
  const words = name.trim().split(/\s+/);
  const size = words.slice(1).find((word) => SIZE.test(word));
  return size ? `${words[0]} ${size}` : name.trim();
}

/** "1 day late", "48 days late". */
export const lateWords = (days: number) => `${formatCount(days)} ${days === 1 ? "day" : "days"} late`;

/** An order's state badge: late wins while it is sent or part delivered. */
export function orderBadge(state: OrderState, lateDays: number | null): { label: string; tone: BadgeTone } {
  if ((state === "SENT" || state === "PARTIAL") && lateDays && lateDays > 0) return { label: lateWords(lateDays), tone: "bad" };
  switch (state) {
    case "DRAFT":
      return { label: "Draft", tone: "neutral" };
    case "SENT":
      return { label: "Sent", tone: "info" };
    case "PARTIAL":
      return { label: "Part delivered", tone: "warn" };
    case "RECEIVED":
      return { label: "Received", tone: "hollow" };
    case "CLOSED":
      return { label: "Closed short", tone: "hollow" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "hollow" };
  }
}

/** The order's state in the edit sheet's sub, lower case: "part delivered", "draft", "48 days late". */
export function orderStateWords(state: OrderState, lateDays: number | null): string {
  return orderBadge(state, lateDays).label.toLowerCase();
}

/** "on account, 30 days" / "on account, on delivery" / "cash on delivery": how the message says it is paid. */
export function payingWords(payment: "ON_ACCOUNT" | "CASH_ON_DELIVERY", payTermsDays: number | null): string {
  if (payment === "CASH_ON_DELIVERY") return "cash on delivery";
  return payTermsDays === null ? "on account" : `on account, ${payTermsDays} days`;
}

/** The rail's Pays: "30 days from delivery", "Cash on delivery", "On account". */
export function paysRailWords(payment: "ON_ACCOUNT" | "CASH_ON_DELIVERY", payTermsDays: number | null): string {
  if (payment === "CASH_ON_DELIVERY") return "Cash on delivery";
  return payTermsDays === null ? "On account" : `${payTermsDays} days from delivery`;
}

export const PAYING = ["On account", "Cash on delivery"] as const;
export const PAYMENT_OF: Record<(typeof PAYING)[number], "ON_ACCOUNT" | "CASH_ON_DELIVERY"> = {
  "On account": "ON_ACCOUNT",
  "Cash on delivery": "CASH_ON_DELIVERY",
};
export const PAYING_WORD: Record<"ON_ACCOUNT" | "CASH_ON_DELIVERY", (typeof PAYING)[number]> = {
  ON_ACCOUNT: "On account",
  CASH_ON_DELIVERY: "Cash on delivery",
};

/** How an order reaches its supplier, as the primary says it. */
export type OrderChannel = "WHATSAPP" | "EMAIL" | "BY_HAND";

export const SEND_LABEL: Record<OrderChannel, string> = {
  WHATSAPP: "Send on WhatsApp",
  EMAIL: "Send by email",
  BY_HAND: "Save and print",
};

/** "Delta gets the changed order on WhatsApp." / "… by email." / "" (the edit sheet's note). */
export function tellNote(supplier: string, channel: OrderChannel): string {
  if (channel === "WHATSAPP") return `${firstWord(supplier)} gets the changed order on WhatsApp.`;
  if (channel === "EMAIL") return `${firstWord(supplier)} gets the changed order by email.`;
  return "";
}

/** The raise toast: "PO-0031 sent to Delta Beverages on WhatsApp." */
export function sentWords(poNo: string, supplier: string, via: OrderChannel): string {
  if (via === "WHATSAPP") return `${poNo} sent to ${supplier} on WhatsApp.`;
  if (via === "EMAIL") return `${poNo} sent to ${supplier} by email.`;
  return `${poNo} saved. Print it from the order.`;
}

/** "Delta pays 30 days. Their minimum is US$500.00." and its warn form under the minimum. */
export function termsNote(input: {
  supplier: string;
  payTermsDays: number | null;
  minimum: number | null;
  totalWithVat: number;
  money: (n: number) => string;
}): { text: string; warn: boolean } {
  const short = firstWord(input.supplier);
  if (input.minimum !== null && input.totalWithVat > 0 && input.totalWithVat < input.minimum) {
    return { text: `${short}'s minimum is ${input.money(input.minimum)}. This order is ${input.money(input.totalWithVat)}.`, warn: true };
  }
  const pays = input.payTermsDays === null ? `${short} pays on delivery.` : `${short} pays ${input.payTermsDays} days.`;
  return { text: input.minimum === null ? pays : `${pays} Their minimum is ${input.money(input.minimum)}.`, warn: false };
}
