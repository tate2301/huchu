/**
 * S-7.5 — the lockout rule, hand-worked.
 *
 * The rule is the whole security argument for a four-digit code, so it is pinned
 * rather than trusted: five wrong guesses buy a quarter of an hour, a locked
 * terminal is refused without the hash ever being compared, and a correct PIN
 * puts the counter back to zero.
 */

import { describe, expect, it } from "vitest";

import {
  TILL_PIN_LOCK_MS,
  TILL_PIN_MAX_ATTEMPTS,
  evaluateTillPinAttempt,
  isObviousTillPin,
  isTillPinLocked,
  tillPinDenial,
} from "./till-pin";

/** A fixed clock. Every expectation below is arithmetic off this instant. */
const NOW = new Date("2026-08-13T14:00:00.000Z");
const FIFTEEN_MINUTES = 15 * 60 * 1000;

function fresh() {
  return { failedAttempts: 0, lockedUntil: null };
}

describe("evaluateTillPinAttempt", () => {
  it("accepts a correct PIN and clears the counter", () => {
    const outcome = evaluateTillPinAttempt({
      state: { failedAttempts: 3, lockedUntil: null },
      verified: true,
      now: NOW,
    });

    expect(outcome.decision).toBe("ACCEPTED");
    expect(outcome.next).toEqual({ failedAttempts: 0, lockedUntil: null });
    expect(outcome.attemptsRemaining).toBe(TILL_PIN_MAX_ATTEMPTS);
  });

  it("counts a wrong PIN down from five", () => {
    const first = evaluateTillPinAttempt({ state: fresh(), verified: false, now: NOW });
    expect(first.decision).toBe("REJECTED");
    expect(first.next.failedAttempts).toBe(1);
    expect(first.next.lockedUntil).toBeNull();
    expect(first.attemptsRemaining).toBe(4);

    const fourth = evaluateTillPinAttempt({
      state: { failedAttempts: 3, lockedUntil: null },
      verified: false,
      now: NOW,
    });
    expect(fourth.decision).toBe("REJECTED");
    expect(fourth.next.failedAttempts).toBe(4);
    expect(fourth.attemptsRemaining).toBe(1);
  });

  it("locks on the fifth wrong PIN, for exactly fifteen minutes", () => {
    const outcome = evaluateTillPinAttempt({
      state: { failedAttempts: 4, lockedUntil: null },
      verified: false,
      now: NOW,
    });

    expect(outcome.decision).toBe("REJECTED_NOW_LOCKED");
    expect(outcome.next.failedAttempts).toBe(5);
    expect(outcome.next.lockedUntil).toEqual(new Date("2026-08-13T14:15:00.000Z"));
    expect(outcome.attemptsRemaining).toBe(0);
    expect(outcome.retryAfterMs).toBe(FIFTEEN_MINUTES);
    // The constant and the arithmetic have to agree, or one of them is a lie.
    expect(TILL_PIN_LOCK_MS).toBe(FIFTEEN_MINUTES);
  });

  it("refuses a locked terminal without comparing anything", () => {
    const lockedUntil = new Date("2026-08-13T14:15:00.000Z");

    // `verified: true` — the right PIN, typed one minute into the lock. Still no.
    // The route never gets this far, and the rule says so on its own.
    const outcome = evaluateTillPinAttempt({
      state: { failedAttempts: 5, lockedUntil },
      verified: true,
      now: new Date("2026-08-13T14:01:00.000Z"),
    });

    expect(outcome.decision).toBe("LOCKED");
    expect(outcome.next).toEqual({ failedAttempts: 5, lockedUntil });
    expect(outcome.retryAfterMs).toBe(14 * 60 * 1000);
  });

  it("reports the lock through isTillPinLocked up to the last millisecond", () => {
    const lockedUntil = new Date("2026-08-13T14:15:00.000Z");
    const state = { failedAttempts: 5, lockedUntil };

    expect(isTillPinLocked(state, new Date("2026-08-13T14:14:59.999Z"))).toBe(true);
    expect(isTillPinLocked(state, lockedUntil)).toBe(false);
    expect(isTillPinLocked(fresh(), NOW)).toBe(false);
  });

  it("gives five fresh attempts once the lock runs out", () => {
    const outcome = evaluateTillPinAttempt({
      state: { failedAttempts: 5, lockedUntil: new Date("2026-08-13T14:15:00.000Z") },
      verified: false,
      now: new Date("2026-08-13T14:15:00.001Z"),
    });

    // Not "six failures, still locked": an expired lock has already done the
    // slowing down the counter exists for, so it counts from one again.
    expect(outcome.decision).toBe("REJECTED");
    expect(outcome.next.failedAttempts).toBe(1);
    expect(outcome.next.lockedUntil).toBeNull();
    expect(outcome.attemptsRemaining).toBe(4);
  });

  it("answers the lock question before the hash is compared", () => {
    const locked = evaluateTillPinAttempt({
      state: { failedAttempts: 5, lockedUntil: new Date("2026-08-13T14:15:00.000Z") },
      verified: null,
      now: NOW,
    });
    expect(locked.decision).toBe("LOCKED");

    const open = evaluateTillPinAttempt({
      state: { failedAttempts: 2, lockedUntil: null },
      verified: null,
      now: NOW,
    });
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
