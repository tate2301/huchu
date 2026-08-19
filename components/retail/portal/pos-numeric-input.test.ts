/**
 * The keypad's arithmetic-free half: what pressing a key does to a string.
 *
 * Worth its own tests because every money field on the till goes through it —
 * the opening float, the counted cash, a tender amount, a line quantity, a
 * discount — and because it is the one place where "0" means two different
 * things: a field nobody has touched, and a number somebody is halfway through
 * typing.
 */

import { describe, expect, it } from "vitest";

import { applyPosKeypadAction } from "./pos-numeric-input";

const digit = (value: string) => ({ type: "digit" as const, value });

describe("a leading zero is replaced rather than built on", () => {
  it("turns a $200 float into 200, not 0200", () => {
    // The opening-float field starts at "0"; a cashier counts in two hundred.
    let value = "0";
    for (const key of "200") value = applyPosKeypadAction(value, digit(key));
    expect(value).toBe("200");
  });

  it("leaves an untouched field at a single zero until a digit lands", () => {
    expect(applyPosKeypadAction("0", digit("0"))).toBe("0");
  });

  it("does not eat the zero of a decimal being typed", () => {
    // "0." is a number in progress. Collapsing it would make 0.50 into .50.
    let value = applyPosKeypadAction("", { type: "decimal" });
    expect(value).toBe("0.");
    value = applyPosKeypadAction(value, digit("5"));
    value = applyPosKeypadAction(value, digit("0"));
    expect(value).toBe("0.50");
  });

  it("keeps zeros that are not leading", () => {
    let value = "";
    for (const key of "105") value = applyPosKeypadAction(value, digit(key));
    expect(value).toBe("105");
  });
});

describe("the rest of the keys", () => {
  it("clear empties the field", () => {
    expect(applyPosKeypadAction("47.60", { type: "clear" })).toBe("");
  });

  it("backspace drops one character at a time, decimal point included", () => {
    expect(applyPosKeypadAction("47.60", { type: "backspace" })).toBe("47.6");
    expect(applyPosKeypadAction("47.", { type: "backspace" })).toBe("47");
  });

  it("a preset replaces whatever was there", () => {
    // Quick-cash keys are the exact total or a round-up; they never append.
    expect(applyPosKeypadAction("12", { type: "preset", value: "50.00" })).toBe("50.00");
  });

  it("refuses a second decimal point", () => {
    expect(applyPosKeypadAction("47.6", { type: "decimal" })).toBe("47.6");
  });

  it("holds to two decimals by default", () => {
    let value = "1.99";
    value = applyPosKeypadAction(value, digit("9"));
    expect(value).toBe("1.99");
  });

  it("takes no decimals at all when told not to — loyalty points are whole", () => {
    const options = { allowDecimal: false, maxDecimals: 0 };
    expect(applyPosKeypadAction("120", { type: "decimal" }, options)).toBe("120");
  });
});
