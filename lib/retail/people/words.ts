import { TILL_PIN_MAX_ATTEMPTS } from "@/lib/retail/till-pin";
import { DEFAULT_TIME_ZONE, dayKey, formatDay, formatShortDay, formatTime } from "@/lib/workspace/format";

import { PERSON_ROLE_LABELS, type PersonRole } from "./roles";

/**
 * What People says about a person (80-admin 4.1, 5.1, 5.3): pure, so every
 * sentence is tested without a database. Times are in Africa/Harare.
 */

export type PersonState = "ACTIVE" | "PIN_LOCKED" | "INVITED" | "INVITE_EXPIRED" | "NO_ACCESS";
export type PinState = "NONE" | "SET" | "NEW" | "LOCKED";

export const STATE_LABELS: Record<PersonState, string> = {
  ACTIVE: "Active",
  PIN_LOCKED: "PIN locked",
  INVITED: "Invited",
  INVITE_EXPIRED: "Invite expired",
  NO_ACCESS: "No access",
};

export const STATE_TONES: Record<PersonState, "ok" | "warn" | "info" | "neutral"> = {
  ACTIVE: "ok",
  PIN_LOCKED: "warn",
  INVITED: "info",
  INVITE_EXPIRED: "warn",
  NO_ACCESS: "neutral",
};

/** The Till PIN column: "Set", "Locked", "Sent" (issued, not yet changed), or blank (drawn "–"). */
export const PIN_COLUMN: Record<PinState, string> = { NONE: "", SET: "Set", NEW: "Sent", LOCKED: "Locked" };

/** "+263719027713" → "+263 71 902 7713"; anything else as stored. */
export function phoneDisplay(e164: string | null | undefined): string {
  if (!e164) return "";
  const match = /^\+263(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return match ? `+263 ${match[1]} ${match[2]} ${match[3]}` : e164;
}

/** "All sites", or the names joined ("Harare Main Branch, Borrowdale"). */
export function sitesLabel(sites: { all: boolean; names: string[] }): string {
  return sites.all ? "All sites" : sites.names.join(", ");
}

/** What the database holds about a PIN, as People reads it. */
export type PinFacts = {
  failedAttempts: number;
  lockedAt: Date | null;
  mustChange: boolean;
  issuedAt: Date;
  lastUnlockedAt: Date | null;
} | null;

/** Locked at the fifth wrong try, until somebody sends a new PIN (`lib/retail/till-pin.ts`). */
export function pinLockedAt(pin: PinFacts): Date | null {
  return pin?.lockedAt ?? null;
}

export function pinState(pin: PinFacts): PinState {
  if (!pin) return "NONE";
  if (pinLockedAt(pin)) return "LOCKED";
  return pin.mustChange ? "NEW" : "SET";
}

/** "today at 08:12", "yesterday at 21:40", "2 Oct at 08:12". */
function dayAt(value: Date, now: Date): string {
  const day = dayKey(value, DEFAULT_TIME_ZONE);
  const time = formatTime(value);
  if (day === dayKey(now)) return `today at ${time}`;
  if (day === dayKey(new Date(now.getTime() - 86_400_000))) return `yesterday at ${time}`;
  return `${formatShortDay(value)} at ${time}`;
}

/** "1 October": a day in a sentence, no year. */
export function dayInSentence(value: Date): string {
  return formatDay(value).replace(/ \d{4}$/, "");
}

/**
 * The person sheet's Till PIN line: "Locked today at 08:12 after 5 wrong
 * tries", "Set. Last used today at 07:58.", "Sent 2 Oct. Not used yet.",
 * "No PIN yet."; for someone without access, "Removed with their access on 1 October.".
 */
export function pinText(pin: PinFacts, now: Date, removedAt: Date | null = null): string {
  if (removedAt) return `Removed with their access on ${dayInSentence(removedAt)}.`;
  const state = pinState(pin);
  if (!pin || state === "NONE") return "No PIN yet.";
  if (state === "LOCKED") {
    const at = dayAt(pinLockedAt(pin)!, now);
    return `Locked ${at} after ${TILL_PIN_MAX_ATTEMPTS} wrong tries`;
  }
  if (state === "NEW") return `Sent ${formatShortDay(pin.issuedAt)}. Not used yet.`;
  return pin.lastUnlockedAt ? `Set. Last used ${dayAt(pin.lastUnlockedAt, now)}.` : "Set. Not used yet.";
}

/** Seen within this long reads "Now". */
export const NOW_MS = 5 * 60 * 1000;
/** A PIN used at a till within this long reads "Selling now". */
export const SELLING_NOW_MS = 30 * 60 * 1000;

/**
 * The Last in column: "Now" (the viewer, or seen in the last five minutes),
 * "Selling now" (their PIN opened a till in the last 30 minutes), "Today
 * 12:31", "Yesterday", "28 Sep", "Invited 2 Oct" while an invite waits, or
 * "Never".
 */
export function lastInWord(input: {
  isViewer: boolean;
  state: PersonState;
  invitedAt: Date | null;
  lastSeenAt: Date | null;
  pinUsedAt: Date | null;
  now: Date;
}): string {
  const { now } = input;
  if (input.isViewer) return "Now";
  if ((input.state === "INVITED" || input.state === "INVITE_EXPIRED") && input.invitedAt) {
    return `Invited ${formatShortDay(input.invitedAt)}`;
  }
  if (input.pinUsedAt && now.getTime() - input.pinUsedAt.getTime() <= SELLING_NOW_MS) return "Selling now";
  const seen = input.lastSeenAt;
  if (!seen) return "Never";
  if (now.getTime() - seen.getTime() <= NOW_MS) return "Now";
  const day = dayKey(seen);
  if (day === dayKey(now)) return `Today ${formatTime(seen)}`;
  if (day === dayKey(new Date(now.getTime() - 86_400_000))) return "Yesterday";
  return formatShortDay(seen);
}

/**
 * The person sheet's sub: "Cashier · Borrowdale · PIN locked after 5 tries",
 * "Manager · Harare Main Branch · PIN set", "Bookkeeper · All sites · Invited
 * 2 Oct", "Stock clerk · All sites · No access since 1 Oct", "Owner · All
 * sites · No till PIN".
 */
export function personSub(input: {
  role: PersonRole;
  sites: string;
  state: PersonState;
  pin: PinState;
  invitedAt: Date | null;
  removedAt: Date | null;
}): string {
  const head = `${PERSON_ROLE_LABELS[input.role]} · ${input.sites}`;
  if (input.state === "NO_ACCESS") {
    return input.removedAt ? `${head} · No access since ${formatShortDay(input.removedAt)}` : `${head} · No access`;
  }
  if (input.state === "INVITED" && input.invitedAt) return `${head} · Invited ${formatShortDay(input.invitedAt)}`;
  if (input.state === "INVITE_EXPIRED") return `${head} · Invite expired`;
  switch (input.pin) {
    case "LOCKED":
      return `${head} · PIN locked after ${TILL_PIN_MAX_ATTEMPTS} tries`;
    case "SET":
      return `${head} · PIN set`;
    case "NEW":
      return `${head} · PIN sent`;
    default:
      return `${head} · No till PIN`;
  }
}

/** The state from what is stored: no access first, then a waiting invite, then a locked PIN. */
export function personState(input: {
  isActive: boolean;
  invite: { acceptedAt: Date | null; expiresAt: Date } | null;
  pin: PinState;
  now: Date;
}): PersonState {
  if (!input.isActive) return "NO_ACCESS";
  if (input.invite && !input.invite.acceptedAt) {
    return input.invite.expiresAt.getTime() <= input.now.getTime() ? "INVITE_EXPIRED" : "INVITED";
  }
  return input.pin === "LOCKED" ? "PIN_LOCKED" : "ACTIVE";
}

/** "4829" → "4 8 2 9": a PIN read aloud off the hand-over panel. */
export function spacedPin(pin: string): string {
  return pin.split("").join(" ");
}
