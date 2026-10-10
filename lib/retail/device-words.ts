import { DEFAULT_TIME_ZONE, dayKey, formatDay, formatTime } from "@/lib/workspace/format";
import type { DeviceKind } from "@/lib/retail/till-words";

/**
 * The device side of pairing in words and rules (10-setup W-04 steps 5–8,
 * W-76, 5.5 "Device screens on the POS host"). Pure, so the screens, the
 * routes and the tests read the same sentences.
 */

/** The httpOnly device key, sent only to the POS host. */
export const DEVICE_COOKIE = "tender_device";
/** A random id an unpaired device keeps, so five wrong codes stop it and not the shop. */
export const INSTALL_COOKIE = "tender_install";
/** 400 days: the longest a browser keeps a cookie. */
export const DEVICE_COOKIE_MAX_AGE = 34_560_000;

/** `RetailSale.reviewReason` on a sale an unpaired device sent in afterwards (W-76). */
export const UNPAIRED_REVIEW_REASON = "Sold on a device that was then unpaired";

/** `X-Tender-Shell: countermini | kora` → the kiosk shell's kind; anything else is a browser. */
export function deviceKindFromShell(shell: string | null | undefined): DeviceKind {
  const value = shell?.trim().toLowerCase();
  if (value === "countermini") return "COUNTER_MINI";
  if (value === "kora") return "KORA";
  return "BROWSER";
}

/**
 * What a browser is, from its user agent: "Windows PC", "Mac", "Chromebook",
 * "Linux PC", "Android tablet", "Android phone", "iPad", "iPhone". Null when
 * the agent says nothing we recognise.
 */
export function deviceLabelFromUserAgent(userAgent: string | null | undefined): string | null {
  const ua = userAgent ?? "";
  if (/iPhone|iPod/i.test(ua)) return "iPhone";
  // iPadOS 13+ reports itself as a Mac; a touch-capable "Macintosh" with "Mobile" is an iPad.
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile\//i.test(ua))) return "iPad";
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? "Android phone" : "Android tablet";
  if (/CrOS/i.test(ua)) return "Chromebook";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Linux|X11/i.test(ua)) return "Linux PC";
  return null;
}

const tries = (n: number) => `${n} ${n === 1 ? "try" : "tries"} left`;

/** 400 BAD_CODE under the boxes: "That code did not work. 4 tries left." */
export const badCodeSentence = (triesLeft: number) => `That code did not work. ${tries(triesLeft)}.`;

/** 429 LOCKED: "Too many tries. Try again at 14:17." */
export const lockedSentence = (lockedUntil: Date, timeZone = DEFAULT_TIME_ZONE) =>
  `Too many tries. Try again at ${formatTime(lockedUntil, timeZone)}.`;

/** 409 when a till acts on a shift that belongs to another till. */
export const shiftOnOtherTillSentence = (till: string) => `That shift is on ${till}.`;

/** 409 ALREADY_A_TILL: a paired device asked to pair again. */
export const alreadyATillSentence = (till: string) => `This device is already ${till}. Unpair it in Management › Tills and devices first.`;

/** A wrong PIN on Who is selling?: "Wrong PIN. 4 tries left." */
export const wrongPinSentence = (triesLeft: number) => `Wrong PIN. ${tries(triesLeft)}.`;

/** 409 when a person's shift is open on another till ("People are not devices"). */
export const shiftElsewhereSentence = (till: string) => `Close your shift on ${till} first.`;

/**
 * What a person's PIN will do on Who is selling? (TillPairing panel 3's
 * footnote): "Chipo's PIN opens her shift on Front till." without a pronoun,
 * since the shop does not record one.
 */
export function pinOutcomeSentence(
  name: string,
  till: string,
  shift: { onThisTill: true } | { onThisTill: false; elsewhere: string | null },
): string {
  const first = name.trim().split(/\s+/)[0] || "This person";
  if (shift.onThisTill) return `${first}’s PIN carries on their shift on ${till}.`;
  if (shift.elsewhere) return `${first}’s shift is open on ${shift.elsewhere}. Close it there first.`;
  return `${first}’s PIN opens their shift on ${till}.`;
}

/** A chip on Who is selling?: "Chipo D." */
export function personChip(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.`;
}

/** "2 August", the year only when it is not this one. */
function shortDay(at: Date, now: Date, timeZone: string): string {
  const day = formatDay(at, timeZone);
  return dayKey(at, timeZone).slice(0, 4) === dayKey(now, timeZone).slice(0, 4) ? day.replace(/ \d{4}$/, "") : day;
}

/** The footnote under the PIN: "Paired 2 August by Tafara Nyathi." */
export function pairedFootnote(at: Date, by: string, now: Date = new Date(), timeZone = DEFAULT_TIME_ZONE): string {
  const day = shortDay(at, now, timeZone);
  return by ? `Paired ${day} by ${by}.` : `Paired ${day}.`;
}

export type UnpairReason = "UNPAIRED" | "REPLACED" | "SITE_CLOSED" | "ACCOUNT_CLOSED";

/**
 * W-76: a device that was unpaired may still send in what it sold before it
 * was told; a sale made after that moment is refused. `accept` is a sale from
 * a device still paired.
 */
export function unpairedSaleVerdict(input: {
  unpairedAt: Date | null;
  soldAt: Date;
}): "accept" | "flag" | "refuse" {
  if (!input.unpairedAt) return "accept";
  return input.soldAt.getTime() <= input.unpairedAt.getTime() ? "flag" : "refuse";
}

/** The refusal for a sale rung after the device was unpaired. */
export const SOLD_AFTER_UNPAIR = "This device was no longer a till when that sale was rung.";
