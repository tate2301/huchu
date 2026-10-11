import { describe, expect, it } from "vitest";

import { valueWarning } from "./words";

/** The warning under an amount off or a fixed price that reaches a product's price (PRD-09). */
describe("valueWarning", () => {
  const spirits = [
    { name: "Bols Brandy 50ml", price: 1.8 },
    { name: "Jameson Irish Whiskey 750ml", price: 27.9 },
  ];

  it("says which product an amount off gives away", () => {
    expect(valueWarning("AMOUNT", 2, spirits)).toBe("Bols Brandy 50ml is US$1.80: it goes free.");
    expect(valueWarning("AMOUNT", 1.8, spirits)).toBe("Bols Brandy 50ml is US$1.80: it goes free.");
    expect(valueWarning("AMOUNT", 1.79, spirits)).toBeNull();
    expect(valueWarning("AMOUNT", 30, spirits)).toBe("2 of its products are US$30.00 or less: they go free.");
  });

  it("says a fixed price at or over a product's price takes nothing off it", () => {
    expect(valueWarning("FIXED_PRICE", 24, spirits)).toBe("Bols Brandy 50ml is US$1.80: nothing comes off it.");
    expect(valueWarning("FIXED_PRICE", 1, spirits)).toBeNull();
  });

  it("says nothing for a percent, a two-for, or no value yet", () => {
    expect(valueWarning("PERCENT", 90, spirits)).toBeNull();
    expect(valueWarning("BUY_X_PAY", 5, spirits)).toBeNull();
    expect(valueWarning("AMOUNT", Number.NaN, spirits)).toBeNull();
  });
});
