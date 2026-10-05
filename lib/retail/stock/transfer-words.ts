import type { Tone } from "@/lib/reports/types";
import { DEFAULT_TIME_ZONE, dayKey, formatCount, formatShortDay, formatTime } from "@/lib/workspace/format";

/**
 * The words a transfer reads in (30-stock W-24, 5.12, 5.13): its state, when
 * it left, and the sentences the sheet and the toast say. Pure, so the list,
 * the sheet and the tests read the same table.
 */

export type TransferStatus = "ON_THE_WAY" | "RECEIVED" | "CANCELLED";

/** What a transfer's lines add up to, as numbers. */
export type TransferTally = { sent: number; received: number; lost: number };

/**
 * Units still to come on an open transfer: sent less received and lost. A
 * received or cancelled transfer has nothing to come — what did not arrive
 * was either written off or went back to the site it left.
 */
export function stillToCome(status: TransferStatus, tally: TransferTally): number {
  if (status !== "ON_THE_WAY") return 0;
  return Math.max(0, tally.sent - tally.received - tally.lost);
}

/**
 * The State cell (5.12): "On the way" and "Part received, 2 to come" in
 * `info`, "Received" `hollow`, "Received, 2 short" `warn`, "Cancelled"
 * `neutral`.
 */
export function transferState(status: TransferStatus, tally: TransferTally): { label: string; tone: Tone } {
  if (status === "CANCELLED") return { label: "Cancelled", tone: "neutral" };
  if (status === "RECEIVED") {
    return tally.lost > 0
      ? { label: `Received, ${formatCount(tally.lost)} short`, tone: "warn" }
      : { label: "Received", tone: "hollow" };
  }
  if (tally.received > 0 || tally.lost > 0) {
    return { label: `Part received, ${formatCount(stillToCome(status, tally))} to come`, tone: "info" };
  }
  return { label: "On the way", tone: "info" };
}

/**
 * When it was sent, as the Sent column reads it: "Today, 08:30",
 * "Yesterday, 17:40", "1 Oct, 12:03"; another year adds it ("1 Oct 2025, 12:03").
 */
export function formatDayTime(value: Date | string, now: Date, timeZone = DEFAULT_TIME_ZONE): string {
  const at = typeof value === "string" ? new Date(value) : value;
  const day = dayKey(at, timeZone);
  const time = formatTime(at, timeZone);
  if (day === dayKey(now, timeZone)) return `Today, ${time}`;
  if (day === dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000), timeZone)) return `Yesterday, ${time}`;
  const year = day.slice(0, 4);
  const short = formatShortDay(at, timeZone);
  return year === dayKey(now, timeZone).slice(0, 4) ? `${short}, ${time}` : `${short} ${year}, ${time}`;
}

/** The toast once sent (5.13): "TRF-0008 sent. Borrowdale will see it to receive." */
export function sentToast(transferNo: string, toName: string): string {
  return `${transferNo} sent. ${toName} will see it to receive.`;
}

/** The sheet's footer note (5.13): "It leaves stock here now and arrives when Borrowdale receives it." */
export function sendNote(toName: string | null): string {
  return `It leaves stock here now and arrives when ${toName ?? "the other site"} receives it.`;
}

/** Changing From drops lines not kept there (**Defined here**): "2 lines were not at Borrowdale and were left out." */
export function leftOutNote(count: number, siteName: string): string {
  return count === 1
    ? `1 line was not at ${siteName} and was left out.`
    : `${formatCount(count)} lines were not at ${siteName} and were left out.`;
}

/** A line's sub in the sheet and the lookup: "9 at Harare Main Branch". */
export function atSiteWords(onHand: number, siteName: string): string {
  return `${formatCount(onHand)} at ${siteName}`;
}

/** A line sent beyond what is on the shelf (W-24): "Only 9 at Harare Main Branch." */
export function onlyWords(onHand: number, siteName: string): string {
  return `Only ${formatCount(onHand)} at ${siteName}.`;
}

/** The phone card's figure when cost is hidden: "540 units". */
export function unitsWords(units: number): string {
  return `${formatCount(units)} ${units === 1 ? "unit" : "units"}`;
}
