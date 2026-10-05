import { DEFAULT_TIME_ZONE, dayKey, formatDay, formatTime } from "@/lib/workspace/format";

/**
 * Tills and devices in words (10-setup 4.3, 5.5): the state a till is in, what
 * runs it, when it last sold and was last seen, and the pairing code as the
 * sheet shows it. Pure, so the list, the sheets and the tests read the same.
 */

export type TillState = "SELLING" | "CLOSED" | "OFFLINE" | "NOT_PAIRED";
export type DeviceKind = "COUNTER_MINI" | "KORA" | "BROWSER";

/** A device that has not called in for longer than this is offline, if it should be on. */
export const OFFLINE_AFTER_MS = 5 * 60 * 1000;
/** "Now" on Last seen: under two minutes. */
const NOW_WITHIN_MS = 2 * 60 * 1000;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "1 hour", "2 hours", "5 minutes", "3 days": rounded down. */
export function offlineFor(ms: number): string {
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (ms >= DAY) return unit(Math.floor(ms / DAY), "day");
  if (ms >= HOUR) return unit(Math.floor(ms / HOUR), "hour");
  return unit(Math.max(1, Math.floor(ms / MINUTE)), "minute");
}

/**
 * The till's state, first match wins: no active device → Not paired; not
 * heard from in 5 minutes while a shift is open on it, or while it is a
 * CounterMini (which stays on all day) → Offline for that long; a shift open
 * → Selling; else Closed. A Kora or a browser switched off with no shift is
 * simply Closed.
 */
export function tillState(
  input: { device: { kind: DeviceKind; lastSeenAt: Date | null } | null; shiftOpen: boolean },
  now: Date = new Date(),
): { state: TillState; label: string } {
  const { device, shiftOpen } = input;
  if (!device) return { state: "NOT_PAIRED", label: "Not paired" };
  const silentFor = device.lastSeenAt ? now.getTime() - device.lastSeenAt.getTime() : null;
  const silent = silentFor === null || silentFor > OFFLINE_AFTER_MS;
  if (silent && (shiftOpen || device.kind === "COUNTER_MINI")) {
    return { state: "OFFLINE", label: silentFor === null ? "Offline" : `Offline ${offlineFor(silentFor)}` };
  }
  if (shiftOpen) return { state: "SELLING", label: "Selling" };
  return { state: "CLOSED", label: "Closed" };
}

/** The badge tone of each state (5.5): Selling ok, Closed hollow, Offline warn, Not paired neutral. */
export const TILL_STATE_TONES = { SELLING: "ok", CLOSED: "hollow", OFFLINE: "warn", NOT_PAIRED: "neutral" } as const;

/** The State filter's words. */
export const TILL_STATE_WORDS: Record<TillState, string> = {
  SELLING: "Selling",
  CLOSED: "Closed",
  OFFLINE: "Offline",
  NOT_PAIRED: "Not paired",
};

const KIND_WORDS: Record<DeviceKind, string> = { COUNTER_MINI: "CounterMini", KORA: "Kora", BROWSER: "Browser" };

/** What runs the till: "CounterMini", "Kora", "Browser, Windows PC", or "No device yet". */
export function deviceWords(device: { kind: DeviceKind; label: string | null } | null): string {
  if (!device) return "No device yet";
  if (device.kind === "BROWSER" && device.label) return `Browser, ${device.label}`;
  return KIND_WORDS[device.kind];
}

/** The Device choice on Pair a till, in the board's words. */
export const DEVICE_CHOICES: Array<[DeviceKind, string]> = [
  ["COUNTER_MINI", "CounterMini"],
  ["KORA", "Kora handheld"],
  ["BROWSER", "A browser"],
];

export const deviceChoiceWords = (kind: DeviceKind): string =>
  DEVICE_CHOICES.find(([value]) => value === kind)?.[1] ?? "CounterMini";

export const deviceChoiceKind = (words: unknown): DeviceKind =>
  DEVICE_CHOICES.find(([, label]) => label === words)?.[0] ?? "COUNTER_MINI";

/** "Harare Main Branch · CounterMini · selling now"; "… · offline 2 hours"; "Borrowdale · not paired". */
export function tillSub(site: string, device: string | null, state: { state: TillState; label: string }): string {
  if (state.state === "NOT_PAIRED" || !device) return `${site} · not paired`;
  const words = state.state === "SELLING" ? "selling now" : state.label.toLowerCase();
  return `${site} · ${device} · ${words}`;
}

/** "2 October", or "2 October 2025" in another year. */
function dayWords(at: Date, now: Date, timeZone: string): string {
  const day = formatDay(at, timeZone);
  return dayKey(at, timeZone).slice(0, 4) === dayKey(now, timeZone).slice(0, 4) ? day.replace(/ \d{4}$/, "") : day;
}

function isToday(at: Date, now: Date, timeZone: string) {
  return dayKey(at, timeZone) === dayKey(now, timeZone);
}

function isYesterday(at: Date, now: Date, timeZone: string) {
  return dayKey(at, timeZone) === dayKey(new Date(now.getTime() - DAY), timeZone);
}

/** Last sale: "Today, 11:42", "Yesterday, 21:50", "2 October, 14:05". */
export function lastSaleWords(at: Date, now: Date = new Date(), timeZone = DEFAULT_TIME_ZONE): string {
  const time = formatTime(at, timeZone);
  if (isToday(at, now, timeZone)) return `Today, ${time}`;
  if (isYesterday(at, now, timeZone)) return `Yesterday, ${time}`;
  return `${dayWords(at, now, timeZone)}, ${time}`;
}

/**
 * Last seen: "Now, version 4.12.0" under two minutes; "11:38, version 4.12.0"
 * today; "Yesterday, 21:55"; "2 October, 14:05". The version only when known.
 */
export function lastSeenWords(
  at: Date | null,
  appVersion: string | null,
  now: Date = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
): string {
  const version = appVersion ? `, version ${appVersion}` : "";
  if (!at) return `Not yet${version}`;
  if (now.getTime() - at.getTime() < NOW_WITHIN_MS) return `Now${version}`;
  const time = formatTime(at, timeZone);
  if (isToday(at, now, timeZone)) return `${time}${version}`;
  if (isYesterday(at, now, timeZone)) return `Yesterday, ${time}${version}`;
  return `${dayWords(at, now, timeZone)}, ${time}${version}`;
}

/** "4 8 2 – 9 1 7". */
export function codeShown(code: string): string {
  const digits = code.replace(/\D/g, "").split("");
  return `${digits.slice(0, 3).join(" ")} – ${digits.slice(3).join(" ")}`;
}

/** The QR's payload (W-04 step 3). */
export const pairingPayload = (code: string) => `tender-pair:${code}`;

/** 409 PLAN_LIMIT: "Your Grow plan has 8 tills, all paired." */
export function planLimitSentence(plan: string, maxTills: number): string {
  return `Your ${plan} plan has ${maxTills} ${maxTills === 1 ? "till" : "tills"}, all paired.`;
}

/** "There is already a till called Front till at Harare Main Branch." */
export const nameTakenSentence = (name: string, site: string) => `There is already a till called ${name} at ${site}.`;

/** 409 SHIFT_OPEN on Unpair (W-76): "Close Chipo Dube’s shift on Front till first." */
export const unpairShiftOpen = (till: string, cashier: string) => `Close ${cashier}’s shift on ${till} first.`;

/** Paired: "2 August 2026 by Tafara Nyathi". */
export function pairedWords(at: Date, by: string, timeZone = DEFAULT_TIME_ZONE): string {
  const day = formatDay(at, timeZone);
  return by ? `${day} by ${by}` : day;
}
/** 409 SHIFT_OPEN on moving a till to another site. */
export const MOVE_SHIFT_OPEN = "Close the shift on it before moving it.";

/** "Till 6": the first "Till n" from the count up that no till of the shop uses yet. */
export function suggestTillName(names: string[]): string {
  const taken = new Set(names.map((name) => name.trim().toLowerCase()));
  for (let n = names.length + 1; ; n += 1) {
    const name = `Till ${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** "Only asked because you have two sites." */
export function siteHint(sites: number): string {
  return `Only asked because you have ${NUMBER_WORDS[sites] ?? String(sites)} sites.`;
}

/** "Sent to 2 tills." */
export const sentWords = (n: number) => `Sent to ${n} ${n === 1 ? "till" : "tills"}.`;
