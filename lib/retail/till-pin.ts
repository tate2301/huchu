/**
 * The till's PIN: who is selling, on a device a manager has paired to a till.
 *
 * ── What a PIN is here, and what it is not ─────────────────────────────────
 *
 * Four digits sign a person in, and only on a paired device. The device's key
 * (`lib/retail/till-device.ts`, an httpOnly cookie a manager's pairing code
 * issued) says which till and which workspace; the PIN says who, out of the
 * people that workspace lets sell. A PIN typed anywhere else is refused before
 * a user is looked up (`till-pin` in `lib/auth.ts`). The same four digits also
 * unlock a till that locked itself while its session stayed open.
 *
 * Four digits is 10,000 possibilities. Against an offline attack on the hash that
 * is nothing, which is why the threat this defends against is stated narrowly:
 * someone standing at a paired till, being watched, tries to sell or read the
 * takings under another person's name. They get five guesses before that PIN
 * stops for fifteen minutes, and the device itself was a manager's decision.
 *
 * **A PIN is issued by a password, never by another PIN** (`pos/pin`,
 * `pos/pin/first`), and **a PIN never authorises a manager override.**
 * `pos/sales/route.ts` compares a manager's bcrypt password before a price or
 * discount override is accepted, so the person approving is not the person
 * ringing up. A four-digit code shared across a shift would collapse the two.
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
