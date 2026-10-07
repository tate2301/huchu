import { formatCount } from "@/lib/workspace/format";

/**
 * The words prices are said in (PRD-07): the worksheet's Changed cell, the
 * Activity lines, the toasts of Change many prices and Add products. One place,
 * so the toast, the row and the history never disagree.
 */

const SHORT_WHEN = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Harare",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Harare", day: "numeric", month: "long" });
const CLOCK = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Harare", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "3 Oct 22:00", on the shop's clock. */
export const shortWhen = (at: Date) => SHORT_WHEN.format(at).replace(",", "");

/** "From 3 Oct 22:00": a price that changes later, on the worksheet and in the price history. */
export const scheduledWords = (at: Date) => `From ${shortWhen(at)}`;

export const priceWords = (n: number) => `${formatCount(n)} ${n === 1 ? "price" : "prices"}`;
export const productWords = (n: number) => `${formatCount(n)} ${n === 1 ? "product" : "products"}`;

/** "3 prices were not saved." / "1 price was not saved." */
export const notSavedSentence = (n: number) => `${priceWords(n)} ${n === 1 ? "was" : "were"} not saved.`;

/**
 * Change many prices' toast: "4 prices changed.", "4 prices change tonight at
 * 22:00.", "4 prices change tomorrow at 22:00.", "4 prices change on 15
 * October."; then what happened to the labels, when any were asked for.
 */
export function changedSentence(
  n: number,
  when: { kind: "NOW" } | { kind: "TONIGHT"; at: Date; tomorrow: boolean } | { kind: "DATE"; at: Date },
  labels: "queued" | "here" | null,
): string {
  const first =
    when.kind === "NOW"
      ? `${priceWords(n)} changed.`
      : when.kind === "TONIGHT"
        ? `${priceWords(n)} change ${when.tomorrow ? "tomorrow" : "tonight"} at ${CLOCK.format(when.at)}.`
        : `${priceWords(n)} change on ${DAY_MONTH.format(when.at)}.`;
  if (labels === "queued") return `${first} Labels are queued.`;
  if (labels === "here") return `${first} Labels are ready to print here.`;
  return first;
}

/** "3 products added to Wholesale.", and what is left to do or was left alone. */
export function addedSentence(list: string, added: number, skipped: number, setEach: boolean): string {
  const parts = [`${productWords(added)} added to ${list}.`];
  if (setEach && added > 0) parts.push("Set each price in the list.");
  if (skipped > 0) parts.push(`${productWords(skipped)} ${skipped === 1 ? "was" : "were"} on it already.`);
  return parts.join(" ");
}

/** The Activity line of a scheduled batch: "Scheduled 4 prices for 3 Oct 22:00". */
export const scheduledActivity = (count: number, at: Date) => `Scheduled ${priceWords(count)} for ${shortWhen(at)}`;
