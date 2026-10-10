/**
 * Licence hours: when a site may sell 18+ products, weekday by weekday, read on
 * Harare's clock.
 *
 * Pure and free of Prisma, so the till runs the same rule in the browser
 * (offline too) that the server runs on every sale. The rows come from
 * `RetailLicenceHours` (`lib/retail/site-licence-hours.ts` loads them) and
 * count only while the shop's licence-hours switch is on (`liquorSaleRefusal`
 * in `shop-profile-rules.ts`).
 */

export const LICENCE_TIMEZONE = "Africa/Harare";

export type LicenceWindow = {
  /** 0 is Sunday, as `Date.getDay()`. */
  weekday: number;
  /** Minutes after midnight. */
  alcoholFrom: number;
  alcoholUntil: number;
};

/** Monday first, as a shop reads its week; the numbers stay `Date.getDay()`'s. */
export const LICENCE_WEEK = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
  [0, "Sunday"],
] as const;

/** The weekday and minutes after midnight in Harare for an instant. */
export function harareClock(at: Date): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LICENCE_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { weekday, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export type AlcoholVerdict =
  | { sellable: true }
  | { sellable: false; stoppedAt: number; startsAt: number | null };

/**
 * Whether age-restricted products may sell at this instant.
 *
 * A weekday with no window sells all day. A window that ends before it starts
 * runs past midnight (from 10:00 to 02:00). An empty window sells none that day.
 * Nobody overrides the answer at the till, managers included: the licence is the law.
 */
export function alcoholVerdict(windows: readonly LicenceWindow[], at: Date): AlcoholVerdict {
  const { weekday, minutes } = harareClock(at);
  const today = windows.find((window) => window.weekday === weekday);
  const yesterday = windows.find((window) => window.weekday === (weekday + 6) % 7);

  // Last night's window may still be open after midnight.
  if (yesterday && yesterday.alcoholUntil < yesterday.alcoholFrom && minutes < yesterday.alcoholUntil) {
    return { sellable: true };
  }
  if (!today) return { sellable: true };

  const { alcoholFrom: from, alcoholUntil: until } = today;
  if (from === until) return { sellable: false, stoppedAt: from, startsAt: nextStart(windows, weekday) };
  const open = from < until ? minutes >= from && minutes < until : minutes >= from || minutes < until;
  if (open) return { sellable: true };
  return { sellable: false, stoppedAt: until, startsAt: minutes < from ? from : nextStart(windows, weekday) };
}

function nextStart(windows: readonly LicenceWindow[], weekday: number): number | null {
  const tomorrow = windows.find((window) => window.weekday === (weekday + 1) % 7);
  if (!tomorrow) return 0;
  return tomorrow.alcoholFrom === tomorrow.alcoholUntil ? null : tomorrow.alcoholFrom;
}

/** 1320 → "22:00". */
export function clockLabel(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "22:00" → 1320, or null when it is not a time. */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** 480, 1320 → "08:00 to 22:00". */
export function windowText(from: number, until: number): string {
  return `${clockLabel(from)} to ${clockLabel(until)}`;
}

/**
 * A window as a person writes it: "08:00 to 22:00" → minutes, or null when it
 * is not two 24-hour times joined by "to", or the two are the same minute. A
 * window may run past midnight (10:00 to 02:00), so the order is free.
 */
export function parseWindow(text: string): { alcoholFrom: number; alcoholUntil: number } | null {
  const match = /^\s*(\d{1,2}:\d{2})\s*(?:to|-|–)\s*(\d{1,2}:\d{2})\s*$/i.exec(text);
  if (!match) return null;
  const from = parseClock(match[1]!);
  const until = parseClock(match[2]!);
  if (from === null || until === null || from === until) return null;
  return { alcoholFrom: from, alcoholUntil: until };
}

/**
 * A week of licence hours in one line, Monday first, for the activity trail:
 * "Mon 08:00 to 22:00, Sun not at all". Days left out sell all day.
 */
export function licenceWeekText(windows: readonly LicenceWindow[]): string {
  const days = LICENCE_WEEK.flatMap(([weekday, name]) => {
    const day = windows.find((window) => window.weekday === weekday);
    if (!day) return [];
    const hours = day.alcoholFrom === day.alcoholUntil ? "not at all" : windowText(day.alcoholFrom, day.alcoholUntil);
    return [`${name.slice(0, 3)} ${hours}`];
  });
  return days.length ? days.join(", ") : "All day, every day";
}
