/**
 * The till's PIN: four digits that say who is selling at a paired till.
 *
 * SET-04 (10-setup W-04 step 7). A device paired to a till carries a key in
 * the POS host's httpOnly cookie; the key says which till, and the PIN says
 * who. "Who is selling?" signs a person in with the `till-pin` provider
 * (`lib/auth.ts`), which needs both — the device key is the second factor —
 * and the session it makes is good on the POS host only. Signing in with a
 * password stays, and a PIN also unlocks a till that is already signed in.
 *
 * Four digits is 10,000 possibilities. Against an offline attack on the hash that
 * is nothing; against someone at the counter of a paired till it is five
 * guesses, then nothing until a manager sends a new PIN (ADM-03). That is the
 * threat it is sized for, and it is a factor beside the device key, never on
 * its own.
 *
 * A manager's PIN also approves, at the till, what a cashier may not do alone
 * under the till rules (SET-06, `lib/retail/manager-pin.ts`): the device key,
 * the lockout and the approver's name on every record are what make four
 * digits enough there.
 *
 * ── Issued, then chosen ────────────────────────────────────────────────────
 *
 * A PIN is issued from People (`lib/retail/people/pins.ts`), never set with a
 * password. An issued PIN must be changed: the first time the person uses it
 * the till asks them to choose their own (`mustChange`, the session's
 * `pinMustChange` claim, `POST /api/v2/retail/pos/pin/change`).
 *
 * ── Storage ────────────────────────────────────────────────────────────────
 *
 * The digits are hashed with bcrypt and never stored, returned or logged. No
 * endpoint echoes a PIN back, not even to the person who set it; a forgotten PIN
 * is replaced, not recovered.
 *
 * This module is pure so the lockout rule can be tested without a database;
 * `till-pin-attempt.ts` reads and writes the counter around it.
 */

/** Five guesses. Enough for a wet finger on a tablet, not enough to search. */
export const TILL_PIN_MAX_ATTEMPTS = 5;

export const TILL_PIN_LENGTH = 4;

/** What the till says while a PIN is locked, wherever it is typed. */
export const TILL_PIN_LOCKED = "Too many tries. Ask a manager to send you a new PIN.";

/** What the database holds between attempts. */
export type TillPinAttemptState = {
  failedAttempts: number;
  /** When the fifth wrong PIN locked it. Set until somebody sends a new one. */
  lockedAt: Date | null;
};

export type TillPinDecision =
  /** Refused without comparing anything, because the PIN is locked. */
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
};

/**
 * Whether the PIN is refused outright.
 *
 * Asked **before** a hash is compared: a locked PIN must not do the bcrypt
 * work, both to keep a lock cheap under a script and so the response time
 * cannot distinguish a wrong PIN from a locked one.
 */
export function isTillPinLocked(state: TillPinAttemptState): boolean {
  return state.lockedAt !== null;
}

/**
 * The whole lockout rule, in one place.
 *
 * `verified` is `null` when the caller has not compared the hash yet — the lock
 * check is the first thing that happens and it short-circuits everything else.
 *
 * There is no time-out. A locked PIN stays locked until somebody sends a new
 * one (`issueTillPin` clears `lockedAt` and the counter); the password sign-in
 * stays on the lock screen for people who have one.
 */
export function evaluateTillPinAttempt(input: {
  state: TillPinAttemptState;
  verified: boolean | null;
  now: Date;
}): TillPinAttemptOutcome {
  const { state, verified, now } = input;

  if (isTillPinLocked(state)) {
    return { decision: "LOCKED", next: state, attemptsRemaining: 0 };
  }

  const baseAttempts = Math.max(0, state.failedAttempts);

  if (verified === null) {
    return {
      decision: "REJECTED",
      next: { failedAttempts: baseAttempts, lockedAt: null },
      attemptsRemaining: Math.max(0, TILL_PIN_MAX_ATTEMPTS - baseAttempts),
    };
  }

  if (verified) {
    return {
      decision: "ACCEPTED",
      next: { failedAttempts: 0, lockedAt: null },
      attemptsRemaining: TILL_PIN_MAX_ATTEMPTS,
    };
  }

  const failedAttempts = baseAttempts + 1;

  if (failedAttempts >= TILL_PIN_MAX_ATTEMPTS) {
    return {
      decision: "REJECTED_NOW_LOCKED",
      next: { failedAttempts, lockedAt: now },
      attemptsRemaining: 0,
    };
  }

  return {
    decision: "REJECTED",
    next: { failedAttempts, lockedAt: null },
    attemptsRemaining: TILL_PIN_MAX_ATTEMPTS - failedAttempts,
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
