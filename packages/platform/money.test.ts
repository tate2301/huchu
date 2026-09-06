/**
 * Money arithmetic.
 *
 * These need no database. They exist because the thing S-2.1 replaced looked
 * correct and was not: `Math.round((v + Number.EPSILON) * 100) / 100` is a
 * one-liner that everybody reads past, and it loses a cent on values a school
 * bills every day — and, since the module moved out of `lib/schools/`, on
 * values a payroll pays every month.
 */

import { describe, it, expect } from "vitest";
import { Prisma } from "@corelithzw/db";
import {
  apportionBase,
  atLeast,
  atMost,
  clampAtZero,
  exceeds,
  isPositive,
  isZeroOrLess,
  maxMoney,
  money,
  moneyOrNull,
  multiplyMoney,
  percent,
  rate,
  sumMoney,
  taxOn,
  toBaseAmount,
  toNumber,
  toNumberOrZero,
} from "./money";

/** The helper this file replaced, kept here as the thing being compared against. */
function floatEraToMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

describe("money", () => {
  it("keeps the cent the float helper lost", () => {
    // 8.575 is not representable in binary; the epsilon nudge is far too small
    // at this magnitude to reach the tie, so the old helper rounded down.
    // Postgres numeric — and this — round half away from zero.
    expect(floatEraToMoney(8.575)).toBe(8.57);
    expect(money(8.575).toString()).toBe("8.58");
  });

  it("rounds half away from zero, the way the column does", () => {
    expect(money("0.005").toString()).toBe("0.01");
    expect(money("1.005").toString()).toBe("1.01");
    expect(money("2.345").toString()).toBe("2.35");
    expect(money("-1.005").toString()).toBe("-1.01");
  });

  it("takes a Decimal, a number, a string or nothing", () => {
    expect(money(new Prisma.Decimal("12.3456")).toString()).toBe("12.35");
    expect(money("12.3").toString()).toBe("12.3");
    expect(money(12).toString()).toBe("12");
    expect(money(null).toString()).toBe("0");
    expect(money(undefined).toString()).toBe("0");
  });

  it("refuses a value that is not a finite number", () => {
    expect(() => money(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => money(Number.NaN)).toThrow();
  });

  it("distinguishes missing from zero when asked to", () => {
    expect(moneyOrNull(null)).toBeNull();
    expect(moneyOrNull(0)?.toString()).toBe("0");
  });
});

describe("sumMoney", () => {
  it("accumulates exactly where a double drifts", () => {
    const tenths = Array.from({ length: 10 }, () => 0.1);
    expect(tenths.reduce((sum, value) => sum + value, 0)).not.toBe(1);
    expect(sumMoney(tenths).toString()).toBe("1");
  });

  it("sums a hundred invoice lines without accumulating error", () => {
    const lines = Array.from({ length: 100 }, () => new Prisma.Decimal("12.34"));
    expect(sumMoney(lines).toString()).toBe("1234");
  });

  it("is zero over nothing", () => {
    expect(sumMoney([]).toString()).toBe("0");
  });
});

describe("line arithmetic", () => {
  it("multiplies a quantity by a unit amount at the cent", () => {
    expect(multiplyMoney("0.3333", "1500").toString()).toBe("499.95");
    expect(multiplyMoney(3, "12.005").toString()).toBe("36.02");
  });

  it("computes tax as a percentage of the net", () => {
    expect(taxOn("100", "15").toString()).toBe("15");
    expect(taxOn("8.15", "15").toString()).toBe("1.22");
    expect(taxOn("100", 0).toString()).toBe("0");
  });

  it("holds a quantity at four places and a tax rate at two", () => {
    expect(rate("0.33333").toString()).toBe("0.3333");
    expect(percent("14.999").toString()).toBe("15");
  });
});

describe("comparisons", () => {
  it("compares exactly rather than within a tolerance", () => {
    // The float era accepted anything within 0.009 of the balance. Half a cent
    // over is over.
    expect(exceeds("100.01", "100.00")).toBe(true);
    expect(exceeds("100.00", "100.00")).toBe(false);
    expect(exceeds(new Prisma.Decimal("500.00"), new Prisma.Decimal("500.00"))).toBe(
      false,
    );
  });

  it("knows positive from zero without a numeric coercion", () => {
    expect(isPositive(new Prisma.Decimal("0.01"))).toBe(true);
    expect(isPositive(new Prisma.Decimal("0"))).toBe(false);
    expect(isZeroOrLess(new Prisma.Decimal("0"))).toBe(true);
    expect(isZeroOrLess(new Prisma.Decimal("-1"))).toBe(true);
  });

  it("clamps and maximises", () => {
    expect(clampAtZero("-5").toString()).toBe("0");
    expect(clampAtZero("5").toString()).toBe("5");
    expect(maxMoney("5", "7").toString()).toBe("7");
  });
});

describe("toBaseAmount", () => {
  it("is the identity for a document already in the base currency", () => {
    expect(toBaseAmount("1000", 1).toString()).toBe("1000");
  });

  it("divides by quote-per-base, the sense CurrencyRate uses", () => {
    // {baseCurrency USD, quoteCurrency ZWG, rate 27.5} means 27.5 ZWG buys a
    // dollar, so 27,500 ZWG of school fees is a thousand dollars of income.
    expect(toBaseAmount("27500", "27.5").toString()).toBe("1000");
  });

  it("refuses a rate that would make the base amount undefined", () => {
    expect(() => toBaseAmount("100", 0)).toThrow(RangeError);
    expect(() => toBaseAmount("100", "-1")).toThrow(RangeError);
  });
});

describe("coercion at the read boundary", () => {
  it("keeps null null", () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumberOrZero(null)).toBe(0);
  });

  it("hands back a number a JSON response can carry", () => {
    expect(toNumber(new Prisma.Decimal("1234.56"))).toBeCloseTo(1234.56, 6);
    expect(toNumberOrZero(new Prisma.Decimal("0.01"))).toBeCloseTo(0.01, 6);
  });
});

describe("apportionBase", () => {
  it("splits so the two halves always add up to the whole", () => {
    // 100 ZWG at 3.00 is 33.33. Converting a 50/50 split separately gives
    // 16.67 + 16.67 = 33.34, and the journal entry that produces is a cent
    // heavier on one side than the other.
    const split = apportionBase({ amount: "100", part: "50", exchangeRate: "3" });

    expect(split.base.toFixed(2)).toBe("33.33");
    expect(split.basePart.toFixed(2)).toBe("16.67");
    expect(split.baseRest.toFixed(2)).toBe("16.66");
    expect(split.basePart.plus(split.baseRest).equals(split.base)).toBe(true);
  });

  it("is exact for a document already in the base currency", () => {
    const split = apportionBase({ amount: "1000", part: "150", exchangeRate: 1 });

    expect(split.base.toFixed(2)).toBe("1000.00");
    expect(split.basePart.toFixed(2)).toBe("150.00");
    expect(split.baseRest.toFixed(2)).toBe("850.00");
  });

  it("never lets the part exceed the whole", () => {
    const split = apportionBase({ amount: "100", part: "250", exchangeRate: 1 });

    expect(split.basePart.toFixed(2)).toBe("100.00");
    expect(split.baseRest.toFixed(2)).toBe("0.00");
  });

  it("treats a negative part as nothing", () => {
    const split = apportionBase({ amount: "100", part: "-5", exchangeRate: 1 });

    expect(split.basePart.toFixed(2)).toBe("0.00");
    expect(split.baseRest.toFixed(2)).toBe("100.00");
  });

  it("refuses a rate that would make the split undefined", () => {
    expect(() => apportionBase({ amount: "100", part: "50", exchangeRate: 0 })).toThrow(RangeError);
  });
});

/**
 * The comparison that reads correctly and is not.
 *
 * `<=` between two `Prisma.Decimal`s is a **string** comparison. JavaScript
 * coerces both sides with `valueOf`, `Decimal.prototype.valueOf` returns a
 * string, and two strings compare lexicographically — so
 * `new Decimal(14) <= new Decimal(6)` is `true`.
 *
 * TypeScript is worse than silent. Relational operators are allowed between two
 * values of the same object type, so `Decimal <= Decimal` compiles — while
 * `Decimal <= number`, which is the form that actually works, is a type error.
 * The compiler refuses the safe comparison and permits the broken one. Seven
 * hundred unit tests and a desktop screenshot passed over four filters written
 * the compiling way.
 *
 * It was found on a phone. S-1 converted `InventoryItem.currentStock` and
 * `minStock` off `Float`, and the low-stock watchlist started listing Amarula
 * Cream with 14 bottles on hand against a reorder point of 6, describing it as
 * "8.00 bottle short".
 *
 * These tests assert the wrong answer as well as the right one. Pinning the
 * trap is the point: a reader who deletes `atMost` in favour of the operator
 * should see exactly why they cannot.
 */
describe("comparing two Decimals", () => {
  const fourteen = new Prisma.Decimal(14);
  const six = new Prisma.Decimal(6);

  it("is lexicographic with the operator — this is the bug", () => {
    // Not an endorsement. This is what the language does, recorded so the
    // helpers below have something to be better than.
    expect(fourteen <= six).toBe(true);
    expect(fourteen > six).toBe(false);
  });

  it("is numeric with atMost and atLeast", () => {
    expect(atMost(fourteen, six)).toBe(false);
    expect(atLeast(fourteen, six)).toBe(true);
    expect(exceeds(fourteen, six)).toBe(true);
  });

  /**
   * Why this survived every check, and the part that should worry you.
   *
   * A `Decimal` against a plain `number` coerces the string back to a number,
   * so the mixed case is right by accident. **And TypeScript rejects it** —
   * "Operator '<=' cannot be applied to types 'Decimal' and 'number'". The
   * two lines below only compile behind a cast.
   *
   * So the compiler refuses the comparison that works and waves through the
   * one that does not. That is the whole reason four filters shipped: every
   * call site TypeScript could have flagged was already correct, and the
   * incorrect ones looked like the tidiest code in the file.
   */
  it("is already numeric when only one side is a Decimal", () => {
    const loose = fourteen as unknown as number;
    expect(loose <= 6).toBe(false);
    expect(14 <= (six as unknown as number)).toBe(false);
  });

  it("agrees with the operator wherever the operator happens to be right", () => {
    for (const [a, b] of [
      [1, 2],
      [2, 1],
      [5, 5],
      [0, 0],
      [-3, 2],
      [2, -3],
    ] as const) {
      expect(atMost(a, b), `${a} <= ${b}`).toBe(a <= b);
      expect(atLeast(a, b), `${a} >= ${b}`).toBe(a >= b);
    }
  });

  it("handles the boundary, which is the whole point of a reorder point", () => {
    // At the reorder point *is* low stock. An off-by-one here is a shop that
    // never reorders until it has run out.
    expect(atMost(six, six)).toBe(true);
    expect(atLeast(six, six)).toBe(true);
    expect(exceeds(six, six)).toBe(false);
  });

  it("compares at the quantity scale rather than by string length", () => {
    expect(atMost("9", "10")).toBe(true);
    expect(atMost("10", "9")).toBe(false);
    expect(atMost("0.5", "0.25")).toBe(false);
    expect(atMost("100", "99.99")).toBe(false);
  });

  it("treats null and undefined as zero, like the rest of this module", () => {
    expect(atMost(null, 0)).toBe(true);
    expect(atLeast(undefined, 0)).toBe(true);
    expect(atMost(null, -1)).toBe(false);
  });
});
