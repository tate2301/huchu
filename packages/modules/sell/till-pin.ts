/**
 * The till's PIN: a fast unlock of a device that is already signed in.
 *
 * S-7.5. `docs/design-system/portals/pos.html` signs a cashier in on four digits
 * and shows the digits next to their name. That is a demo. What this implements is
 * the part of it that is right — typing a password on a tablet between customers
 * is not a thing a queue tolerates — without the part that is not.
 *
 * ── What a PIN is here, and what it is not ─────────────────────────────────
 *
 * A cashier signs in **once**, with their password, through the existing flow at
 * `app/portal/pos/login`. That is the only credential path into the system and
 * this module does not add another. What the PIN does is lock and unlock a
 * terminal whose session is already open: same session, same user, no new way in.
 * Sign the session out and the password is the only way back.
 *
 * Four digits is 10,000 possibilities. Against an offline attack on the hash that
 * is nothing, which is why the threat this defends against is stated narrowly:
 *
 *   The cashier steps away from an unattended, already-signed-in till and the
 *   next person along rings a sale up — or reads the day's takings — under
 *   their name.
 *
 * That attacker is standing at the counter, is being watched, and gets five
 * guesses before the terminal makes them fetch a password. It is a convenience
 * factor on an authenticated session, not a password, and nothing in the product
 * may treat it as one.
 *
 * **A PIN never authorises a manager override.** `pos/sales/route.ts` compares a
 * manager's bcrypt password before a price or discount override is accepted, and
 * that gate exists precisely so the person approving is not the person ringing up.
 * A four-digit code shared across a shift would collapse the two. The prototype's
 * "Supervisor PIN 4321" is the thing we are deliberately not building.
 *
 * ── Storage ────────────────────────────────────────────────────────────────
 *
 * The digits are hashed with bcrypt and never stored, returned or logged. No
 * endpoint echoes a PIN back, not even to the person who set it; a forgotten PIN
 * is replaced, not recovered.
 *
 * This module is pure so the lockout rule can be tested without a database.
 */

/** Five guesses. Enough for a wet finger on a tablet, not enough to search. */
export const TILL_PIN_MAX_ATTEMPTS = 5;

/**
 * How long the terminal refuses PINs after the fifth wrong one.
 *
 * Fifteen minutes rather than a permanent lock, because a permanent lock puts a
 * manager between a cashier and a queue, and because the password is available
 * on the lock screen throughout — a locked PIN never strands anybody. The
 * arithmetic it buys: 10,000 codes, five per quarter-hour, is on the order of a
 * fortnight of uninterrupted access to an unattended till whose session would
 * expire long before.
 */
export const TILL_PIN_LOCK_MS = 15 * 60 * 1000;

export const TILL_PIN_LENGTH = 4;

/** What the database holds between attempts. */
export type TillPinAttemptState = {
  failedAttempts: number;
  lockedUntil: Date | null;
};

export type TillPinDecision =
  /** Refused without comparing anything, because the terminal is locked. */
  | "LOCKED"
  /** The digits matched. */
  | "ACCEPTED"
  /** The digits did not match, and there are attempts left. */
  | "REJECTED"
  /** The digits did not match and that was the last attempt. */
  | "REJECTED_NOW_LOCKED";

export type TillPinAttemptOutcome = {
  decision: TillPinDecision;
  /** The state to persist. Identical to the input when the decision is `LOCKED`. */
  next: TillPinAttemptState;
  /** How many wrong guesses are left before the lock. Zero while locked. */
  attemptsRemaining: number;
  /** Milliseconds until the terminal will accept a PIN again. Zero when it will. */
  retryAfterMs: number;
};

/**
 * Whether the terminal is currently refusing PINs.
 *
 * Exported because the unlock route asks this **before** it compares a hash: a
 * locked terminal must not do the bcrypt work, both to keep a lock cheap under a
 * script and so the response time cannot distinguish a wrong PIN from a locked
 * one.
 */
export function isTillPinLocked(state: TillPinAttemptState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/**
 * The whole lockout rule, in one place.
 *
 * `verified` is `null` when the caller has not compared the hash yet — the lock
 * check is the first thing that happens and it short-circuits everything else.
 *
 * A lock that has expired resets the counter rather than leaving the cashier one
 * wrong digit away from another quarter of an hour. That is deliberate: the
 * counter exists to slow a search down, and an expired lock has already done it.
 */
export function evaluateTillPinAttempt(input: {
  state: TillPinAttemptState;
  verified: boolean | null;
  now: Date;
}): TillPinAttemptOutcome {
  const { state, verified, now } = input;

  if (isTillPinLocked(state, now)) {
    return {
      decision: "LOCKED",
      next: state,
      attemptsRemaining: 0,
      retryAfterMs: (state.lockedUntil as Date).getTime() - now.getTime(),
    };
  }

  // The lock, if there was one, has run out. Everything from here counts from zero.
  const baseAttempts = state.lockedUntil === null ? Math.max(0, state.failedAttempts) : 0;

  if (verified === null) {
    return {
      decision: "REJECTED",
      next: { failedAttempts: baseAttempts, lockedUntil: null },
      attemptsRemaining: Math.max(0, TILL_PIN_MAX_ATTEMPTS - baseAttempts),
      retryAfterMs: 0,
    };
  }

  if (verified) {
    return {
      decision: "ACCEPTED",
      next: { failedAttempts: 0, lockedUntil: null },
      attemptsRemaining: TILL_PIN_MAX_ATTEMPTS,
      retryAfterMs: 0,
    };
  }

  const failedAttempts = baseAttempts + 1;

  if (failedAttempts >= TILL_PIN_MAX_ATTEMPTS) {
    return {
      decision: "REJECTED_NOW_LOCKED",
      next: {
        failedAttempts,
        lockedUntil: new Date(now.getTime() + TILL_PIN_LOCK_MS),
      },
      attemptsRemaining: 0,
      retryAfterMs: TILL_PIN_LOCK_MS,
    };
  }

  return {
    decision: "REJECTED",
    next: { failedAttempts, lockedUntil: null },
    attemptsRemaining: TILL_PIN_MAX_ATTEMPTS - failedAttempts,
    retryAfterMs: 0,
  };
}

/**
 * Whether four digits are too obvious to be worth the five attempts.
 *
 * Not a blocklist of leaked PINs — that is a password control and this is not a
 * password. Two rules only, both of which a person standing behind the counter
 * would try first: every digit the same, and a straight run in either direction.
 * `0000`, `1111`, `1234` and `4321` are all caught, and they are what a cashier
 * left to themselves picks.
 */
export function isObviousTillPin(pin: string): boolean {
  if (!/^\d{4}$/.test(pin)) return false;
  const digits = pin.split("").map(Number);
  const allSame = digits.every((digit) => digit === digits[0]);
  if (allSame) return true;
  const ascending = digits.every((digit, index) => index === 0 || digit === digits[index - 1] + 1);
  const descending = digits.every((digit, index) => index === 0 || digit === digits[index - 1] - 1);
  return ascending || descending;
}

/**
 * Returns null when the digits are acceptable, or the sentence to refuse with.
 *
 * A message rather than a thrown error, matching `retailPermissionDenial` — the
 * person reading it is a cashier, and every retail route answers through
 * `errorResponse`.
 */
export function tillPinDenial(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) {
    return `Your PIN has to be exactly ${TILL_PIN_LENGTH} digits.`;
  }
  if (isObviousTillPin(pin)) {
    return "Pick a PIN that is not four of the same digit or four in a row.";
  }
  return null;
}
