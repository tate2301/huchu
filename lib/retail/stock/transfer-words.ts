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

const ON_HAND = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** What is on the shelf, never rounded to a count it does not hold: "9", "3.5", "1,204". */
function onHandFigure(onHand: number): string {
  return onHand < 0 ? `−${ON_HAND.format(-onHand)}` : ON_HAND.format(onHand);
}

/** A line's sub in the sheet and the lookup: "9 at Harare Main Branch". */
export function atSiteWords(onHand: number, siteName: string): string {
  return `${onHandFigure(onHand)} at ${siteName}`;
}

/** A line sent beyond what is on the shelf (W-24): "Only 9 at Harare Main Branch." */
export function onlyWords(onHand: number, siteName: string): string {
  return `Only ${onHandFigure(onHand)} at ${siteName}.`;
}

/** Units weighed or poured rather than counted: these alone may be sent in parts. */
const MEASURED_UNIT = /^(kg|kgs|kilogram|kilograms|g|gram|grams|l|litre|litres|liter|liters|ml|m|metre|metres|meter|meters)$/i;

/** Whether a line's unit is counted (bottle, case, bag), so only whole ones can be sent. */
export function isCountedUnit(unit: string | null | undefined): boolean {
  return !MEASURED_UNIT.test((unit ?? "").trim());
}

/** The phone card's figure when cost is hidden: "540 units". */
export function unitsWords(units: number): string {
  return `${formatCount(units)} ${units === 1 ? "unit" : "units"}`;
}

/* ── A transfer received, changed, on its record (5.14–5.16, W-24 steps 3–4) ── */

/** A line that came short: how many, of what. */
export type ShortLine = { name: string; short: number };

/**
 * What came short, for the hint and the toast (W-24, **Defined here**): one
 * product → "2 × Ice 2kg bag"; several → "5 units". Nothing short → null.
 */
export function shortWords(lines: readonly ShortLine[]): string | null {
  const short = lines.filter((line) => line.short > 0);
  if (short.length === 0) return null;
  if (short.length === 1) return `${formatCount(short[0]!.short)} × ${short[0]!.name}`;
  return unitsWords(short.reduce((sum, line) => sum + line.short, 0));
}

/** The receive sheet's hint (5.15): "2 × Ice 2kg bag short. They go back on Harare Main Branch’s stock unless you mark them lost." */
export function receiveHint(lines: readonly ShortLine[], fromName: string): string {
  const short = shortWords(lines);
  return short ? `${short} short. They go back on ${fromName}’s stock unless you mark them lost.` : "";
}

/** What the person said about what did not come. */
export type ShortChoice = "STILL_COMING" | "LOST";

/**
 * The toast once received (W-24 step 3): "TRF-0008 received at Borrowdale.",
 * then "2 × Ice 2kg bag written off." or "… still to come.".
 */
export function receivedToast(transferNo: string, toName: string, lines: readonly ShortLine[], choice: ShortChoice): string {
  const head = `${transferNo} received at ${toName}.`;
  const short = shortWords(lines);
  if (!short) return head;
  return `${head} ${short} ${choice === "LOST" ? "written off" : "still to come"}.`;
}

/** The toast once the lines changed (5.16): "TRF-0008 changed: 560 units on the way." */
export function changedToast(transferNo: string, units: number): string {
  return `${transferNo} changed: ${unitsWords(units)} on the way.`;
}

/** A receive line's sub (5.15): "4 sent", or on a second receipt "2 still to come". */
export function cameSub(sent: number, toCome: number): string {
  return toCome < sent ? `${formatCount(toCome)} still to come` : `${formatCount(sent)} sent`;
}

/** Receiving more than is on the way (W-24 step 3): "Only 10 were sent.", "Only 2 are still to come." */
export function onlySentWords(sent: number, toCome: number): string {
  if (toCome < sent) return toCome === 1 ? "Only 1 is still to come." : `Only ${formatCount(toCome)} are still to come.`;
  return sent === 1 ? "Only 1 was sent." : `Only ${formatCount(sent)} were sent.`;
}

/** The record's sub-title and the lines sheet's sub (5.16): "TRF-0008 · Harare Main Branch to Borrowdale". */
export function routeWords(fromName: string, toName: string): string {
  return `${fromName} to ${toName}`;
}

/**
 * The strip's chip (5.14): "On the way 2h 10m" `info`, "Received in 4h 10m"
 * `ok`, "Cancelled" `plain` (**Defined here**). Minutes from when it left.
 */
export function transferChip(
  status: TransferStatus,
  minutes: number,
  tally: TransferTally,
): { label: string; tone: "info" | "ok" | "plain" | "warn" } {
  const span = durationWords(minutes);
  if (status === "CANCELLED") return { label: "Cancelled", tone: "plain" };
  if (status === "RECEIVED") {
    return tally.lost > 0
      ? { label: `Received in ${span}, ${formatCount(tally.lost)} short`, tone: "warn" }
      : { label: `Received in ${span}`, tone: "ok" };
  }
  if (tally.received > 0) return { label: `Part received, ${formatCount(stillToCome(status, tally))} to come`, tone: "info" };
  return { label: `On the way ${span}`, tone: "info" };
}

/** "2h 10m", "45m", "3d 4h": how long, at a glance. */
export function durationWords(minutes: number): string {
  const total = Math.max(0, Math.floor(minutes));
  if (total < 60) return `${total}m`;
  if (total < 48 * 60) return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
  return `${Math.floor(total / (24 * 60))}d ${Math.floor((total % (24 * 60)) / 60)}h`;
}

/** When it left, as the receive sheet's sub reads it (5.15): "today 08:30", "yesterday 17:40", "1 Oct 12:03". */
export function sentWords(value: Date | string, now: Date, timeZone = DEFAULT_TIME_ZONE): string {
  const [day, time] = formatDayTime(value, now, timeZone).split(", ");
  return `${day === "Today" || day === "Yesterday" ? day.toLowerCase() : day} ${time}`;
}
