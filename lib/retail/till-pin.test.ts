/**
 * What a till PIN may be. The lockout is tested against the database in
 * `till-pin-attempt.test.ts`.
 */

import { describe, expect, it } from "vitest";

import { isObviousTillPin, tillPinDenial } from "./till-pin";

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
