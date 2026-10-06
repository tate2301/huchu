/**
 * The lockout rule, hand-worked (ADM-03).
 *
 * The rule is the whole security argument for a four-digit code, so it is pinned
 * rather than trusted: five wrong guesses lock it until somebody sends a new
 * PIN, a locked PIN is refused without the hash ever being compared, and a
 * correct PIN puts the counter back to zero.
 */

import { describe, expect, it } from "vitest";

import {
  TILL_PIN_MAX_ATTEMPTS,
  evaluateTillPinAttempt,
  isObviousTillPin,
  isTillPinLocked,
  tillPinDenial,
} from "./till-pin";

/** A fixed clock. */
const NOW = new Date("2026-08-13T14:00:00.000Z");

function fresh() {
  return { failedAttempts: 0, lockedAt: null };
}

describe("evaluateTillPinAttempt", () => {
  it("accepts a correct PIN and clears the counter", () => {
    const outcome = evaluateTillPinAttempt({ state: { failedAttempts: 3, lockedAt: null }, verified: true, now: NOW });
    expect(outcome.decision).toBe("ACCEPTED");
    expect(outcome.next).toEqual({ failedAttempts: 0, lockedAt: null });
    expect(outcome.attemptsRemaining).toBe(TILL_PIN_MAX_ATTEMPTS);
  });

  it("counts a wrong PIN down from five", () => {
    const first = evaluateTillPinAttempt({ state: fresh(), verified: false, now: NOW });
    expect(first.decision).toBe("REJECTED");
    expect(first.next).toEqual({ failedAttempts: 1, lockedAt: null });
    expect(first.attemptsRemaining).toBe(4);

    const fourth = evaluateTillPinAttempt({ state: { failedAttempts: 3, lockedAt: null }, verified: false, now: NOW });
    expect(fourth.decision).toBe("REJECTED");
    expect(fourth.next.failedAttempts).toBe(4);
    expect(fourth.attemptsRemaining).toBe(1);
  });

  it("locks on the fifth wrong PIN, from that moment, with no expiry", () => {
    const outcome = evaluateTillPinAttempt({ state: { failedAttempts: 4, lockedAt: null }, verified: false, now: NOW });
    expect(outcome.decision).toBe("REJECTED_NOW_LOCKED");
    expect(outcome.next).toEqual({ failedAttempts: 5, lockedAt: NOW });
    expect(outcome.attemptsRemaining).toBe(0);
    expect(outcome).not.toHaveProperty("retryAfterMs");
  });

  it("refuses a locked PIN without comparing anything, however long after", () => {
    const state = { failedAttempts: 5, lockedAt: NOW };
    // `verified: true` — the right PIN, typed a month into the lock. Still no.
    const outcome = evaluateTillPinAttempt({ state, verified: true, now: new Date("2026-09-13T14:00:00.000Z") });
    expect(outcome.decision).toBe("LOCKED");
    expect(outcome.next).toEqual(state);
    expect(isTillPinLocked(state)).toBe(true);
    expect(isTillPinLocked(fresh())).toBe(false);
  });

  it("answers the lock question before the hash is compared", () => {
    const locked = evaluateTillPinAttempt({ state: { failedAttempts: 5, lockedAt: NOW }, verified: null, now: NOW });
    expect(locked.decision).toBe("LOCKED");

    const open = evaluateTillPinAttempt({ state: { failedAttempts: 2, lockedAt: null }, verified: null, now: NOW });
    expect(open.decision).toBe("REJECTED");
    // Nothing was compared, so nothing is counted against the cashier.
    expect(open.next.failedAttempts).toBe(2);
    expect(open.attemptsRemaining).toBe(3);
  });
});

describe("what a PIN may be", () => {
  it("turns down the four a cashier picks first", () => {
    expect(isObviousTillPin("0000")).toBe(true);
    expect(isObviousTillPin("7777")).toBe(true);
    expect(isObviousTillPin("1234")).toBe(true);
    expect(isObviousTillPin("6789")).toBe(true);
    expect(isObviousTillPin("4321")).toBe(true);
    expect(isObviousTillPin("9876")).toBe(true);
  });

  it("allows anything that is not four the same or four in a row", () => {
    expect(isObviousTillPin("1357")).toBe(false);
    expect(isObviousTillPin("2024")).toBe(false);
    expect(isObviousTillPin("1243")).toBe(false);
    // A run that wraps is not a run: 8, 9, 0, 1 is not consecutive arithmetic.
    expect(isObviousTillPin("8901")).toBe(false);
  });

  it("refuses anything that is not exactly four digits", () => {
    expect(tillPinDenial("123")).toBe("Your PIN has to be exactly 4 digits.");
    expect(tillPinDenial("12345")).toBe("Your PIN has to be exactly 4 digits.");
    expect(tillPinDenial("12a4")).toBe("Your PIN has to be exactly 4 digits.");
    expect(tillPinDenial("")).toBe("Your PIN has to be exactly 4 digits.");
    expect(tillPinDenial("4321")).toBe(
      "Pick a PIN that is not four of the same digit or four in a row.",
    );
    expect(tillPinDenial("2748")).toBeNull();
  });
});
