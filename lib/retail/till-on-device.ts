import { hoursWords } from "@/lib/retail/till-rule-words";

/**
 * The two till rules the device applies itself (SET-06, W-64: "Cash drop
 * prompt and offline window are applied on the device"). The server cannot
 * stop a till that cannot reach it, and it does not watch a drawer between
 * sales, so the till asks for the drop and stops selling offline on its own,
 * from the rules `devices/me` gave it. Browser-safe.
 */

const HOUR_MS = 60 * 60 * 1000;

/** The drawer holds more than "Ask for a cash drop above" allows; a limit of 0 asks after any cash at all. */
export function cashDropDue(expectedCash: number, promptOver: string | number): boolean {
  const limit = Number(promptOver);
  return Number.isFinite(limit) && Number.isFinite(expectedCash) && expectedCash - limit > 0.009;
}

/** "The drawer holds about US$612.40, over the US$500.00 the till rules allow. Move some to the safe." */
export function cashDropSentence(expectedCash: number, promptOver: string | number, currency: string): string {
  return `The drawer holds about ${currency}${expectedCash.toFixed(2)}, over the ${currency}${Number(promptOver).toFixed(2)} the till rules allow. Move some to the safe.`;
}

/**
 * Whether the till has been away longer than "Keep selling offline for up
 * to" allows: its last word from the server, or the oldest sale it still
 * holds, is older than the window. While it is, a sale can no longer go into
 * the offline queue; one the server takes now still goes through.
 */
export function offlineWindowClosed(input: {
  offlineHours: number;
  /** The last moment the server answered this device; null when it never has. */
  lastOnlineAt: string | null;
  /** When the oldest sale the till still holds was queued; null when it holds none. */
  oldestQueuedAt: string | null;
  now: number;
}): boolean {
  const window = input.offlineHours * HOUR_MS;
  const olderThanWindow = (at: string | null) => {
    if (!at) return false;
    const time = new Date(at).getTime();
    return Number.isFinite(time) && input.now - time > window;
  };
  return olderThanWindow(input.lastOnlineAt) || olderThanWindow(input.oldestQueuedAt);
}

/** What the till says while it may not sell offline any longer. */
export function offlineStopSentence(offlineHours: number): string {
  return `This till has been offline for more than ${hoursWords(offlineHours)}, longer than the till rules allow. Connect it to send what it holds, then sell again.`;
}
