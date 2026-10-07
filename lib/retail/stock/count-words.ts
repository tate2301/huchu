import type { Tone } from "@/lib/reports/types";
import { DEFAULT_TIME_ZONE, dayKey, formatCount } from "@/lib/workspace/format";

import { formatDayTime } from "./transfer-words";

/**
 * The words a stock count reads in (30-stock W-22, 5.5–5.7): its name, its
 * state, when it happened, and the sentences the sheet, the phone and the
 * refusals say. Pure, so the list, the sheet, the phone and the tests read
 * the same table.
 */

export type CountStatus = "COUNTING" | "TO_APPROVE" | "APPROVED" | "CANCELLED";
export type CountScope = "EVERYTHING" | "CATEGORIES" | "PRODUCTS" | "PLACE";

export const COUNT_STATE: Record<CountStatus, { label: string; tone: Tone }> = {
  TO_APPROVE: { label: "To approve", tone: "warn" },
  COUNTING: { label: "Counting", tone: "info" },
  APPROVED: { label: "Approved", tone: "hollow" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

/** The four ways to say what is counted, as the sheet's Count segments read them. */
export const SCOPE_LABEL: Record<CountScope, string> = {
  EVERYTHING: "Everything",
  CATEGORIES: "Some categories",
  PRODUCTS: "Some products",
  PLACE: "A place",
};

export const scopeOfLabel = (label: unknown): CountScope =>
  (Object.entries(SCOPE_LABEL).find(([, words]) => words === label)?.[0] as CountScope | undefined) ?? "CATEGORIES";

const productsWord = (n: number) => `${formatCount(n)} ${n === 1 ? "product" : "products"}`;

/**
 * A new count's name (W-22 step 1): one category "Spirits shelf", two
 * "Spirits and Wine", more "Spirits, Wine and 2 more"; a place its name; some
 * products the product's name or "3 products"; everything "Everything".
 */
export function countName(input: { scope: CountScope; categories?: string[]; place?: string | null; products?: string[] }): string {
  switch (input.scope) {
    case "EVERYTHING":
      return "Everything";
    case "PLACE":
      return input.place ?? "A place";
    case "PRODUCTS": {
      const products = input.products ?? [];
      return products.length === 1 ? products[0]! : productsWord(products.length);
    }
    case "CATEGORIES": {
      const [a, b, ...rest] = input.categories ?? [];
      if (!a) return "Some categories";
      if (!b) return `${a} shelf`;
      if (rest.length === 0) return `${a} and ${b}`;
      return `${a}, ${b} and ${formatCount(rest.length)} more`;
    }
  }
}

/**
 * What is counted, inside a sentence: "the spirits shelf", "the cold room",
 * "everything", "3 products", or a single product as it is named.
 */
export function countPhrase(name: string, scope: CountScope): string {
  if (scope === "EVERYTHING") return "everything";
  if (scope === "PRODUCTS") return name;
  return `the ${name.charAt(0).toLowerCase()}${name.slice(1)}`;
}

/** The phone's title (5.7): "Counting the spirits shelf"; a recount "Counting 3 lines again". */
export function countingTitle(name: string, scope: CountScope, recount = 0): string {
  if (recount > 0) return `Counting ${formatCount(recount)} ${recount === 1 ? "line" : "lines"} again`;
  return `Counting ${countPhrase(name, scope)}`;
}

/** The hint under the scope fields: "61 products." */
export const productsHint = (n: number) => `${productsWord(n)}.`;

/** The toast once started (5.6). */
export function startedToast(input: { countNo: string; lines: number; counter: string; self: boolean; messaged: boolean }): string {
  if (input.self) return `${input.countNo} is yours to count. ${productsWord(input.lines)}.`;
  if (!input.messaged) {
    return `${input.countNo} is ready for ${input.counter}. They have no WhatsApp number, so tell them it is in Notifications.`;
  }
  return `${input.countNo} sent to ${input.counter}. ${productsWord(input.lines)} to count.`;
}

/** The WhatsApp the counter gets: "Tafara Nyathi asked you to count the spirits shelf at Harare Main Branch: <link>". */
export function countLinkText(input: { by: string; name: string; scope: CountScope; site: string; link: string }): string {
  return `${input.by} asked you to count ${countPhrase(input.name, input.scope)} at ${input.site}: ${input.link}`;
}

/**
 * 409 when some lines are in open counts, each count with its own number:
 * "3 products are already being counted in CNT-0021. Finish that count first."
 * "9 products are already being counted in CNT-0020 and 14 in CNT-0021. Finish those counts first."
 */
export function alreadyCountingWords(busy: Array<{ countNo: string; products: number }>): string {
  const [first, ...rest] = busy;
  if (!first) return "";
  const head = first.products === 1 ? "1 product is" : `${formatCount(first.products)} products are`;
  const parts = [`${head} already being counted in ${first.countNo}`, ...rest.map((count) => `${formatCount(count.products)} in ${count.countNo}`)];
  const listed = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${listed}. ${rest.length === 0 ? "Finish that count first." : "Finish those counts first."}`;
}

/** 409 on "Done, send for review" with lines left: "Count every line first: 35 to go." */
export const toGoWords = (left: number) => `Count every line first: ${formatCount(left)} to go.`;

/** 409 at the till while a no-selling count is open. */
export const beingCountedWords = (product: string) => `${product} is being counted. It sells again when the count is sent.`;

/** The Lines cell: "38", or "12 of 40" while counting. */
export function linesWords(status: CountStatus, counted: number, total: number): string {
  return status === "COUNTING" ? `${formatCount(counted)} of ${formatCount(total)}` : formatCount(total);
}

/**
 * The When cell (5.5): To approve, when it was sent ("Today, 10:40");
 * Counting, when it started ("Started 11:05", another day "Started 2 Oct, 11:05");
 * Approved and Cancelled, when that happened.
 */
export function countWhen(
  count: { status: CountStatus; createdAt: Date; submittedAt: Date | null; approvedAt: Date | null; cancelledAt: Date | null },
  now: Date,
  timeZone = DEFAULT_TIME_ZONE,
): string {
  switch (count.status) {
    case "COUNTING": {
      const words = formatDayTime(count.createdAt, now, timeZone);
      const today = dayKey(count.createdAt, timeZone) === dayKey(now, timeZone);
      return `Started ${today ? words.replace(/^Today, /, "") : words.replace(/^Yesterday/, "yesterday")}`;
    }
    case "TO_APPROVE":
      return formatDayTime(count.submittedAt ?? count.createdAt, now, timeZone);
    case "APPROVED":
      return formatDayTime(count.approvedAt ?? count.createdAt, now, timeZone);
    case "CANCELLED":
      return formatDayTime(count.cancelledAt ?? count.createdAt, now, timeZone);
  }
}
