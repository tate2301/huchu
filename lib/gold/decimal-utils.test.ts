/**
 * Decimal coercion helpers — unit tests.
 *
 * Pure functions, no DB. These lock in the contract:
 *   - null/undefined pass through (nullable form) or fall to 0 (orZero form)
 *   - number passes through unchanged (no NaN, no precision loss)
 *   - Prisma.Decimal-like (string, bigint, object with toString) coerces via Number()
 *
 * Epic 6 will widen the set of Decimal columns; these tests are the
 * regression gate for the contract every callsite depends on.
 */

import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  toGrams,
  toGramsOrZero,
  toUsd,
  toUsdOrZero,
  mapEntryGrams,
} from "./decimal-utils";

describe("toGrams", () => {
  it("returns null for null and undefined", () => {
    expect(toGrams(null)).toBeNull();
    expect(toGrams(undefined)).toBeNull();
  });

  it("returns the number for a plain number", () => {
    expect(toGrams(0)).toBe(0);
    expect(toGrams(12.345)).toBe(12.345);
    expect(toGrams(-1)).toBe(-1);
  });

  it("coerces a Prisma.Decimal", () => {
    expect(toGrams(new Prisma.Decimal("12.345"))).toBeCloseTo(12.345, 6);
    expect(toGrams(new Prisma.Decimal("0"))).toBe(0);
  });

  it("coerces a numeric string", () => {
    expect(toGrams("9.876")).toBeCloseTo(9.876, 6);
  });

  it("coerces a bigint", () => {
    expect(toGrams(BigInt(42))).toBe(42);
  });
});

describe("toGramsOrZero", () => {
  it("returns 0 for null and undefined", () => {
    expect(toGramsOrZero(null)).toBe(0);
    expect(toGramsOrZero(undefined)).toBe(0);
  });

  it("passes numbers through", () => {
    expect(toGramsOrZero(5.5)).toBe(5.5);
  });

  it("coerces Decimal", () => {
    expect(toGramsOrZero(new Prisma.Decimal("3.14"))).toBeCloseTo(3.14, 6);
  });
});

describe("toUsd / toUsdOrZero", () => {
  it("mirrors the gram coercion semantics", () => {
    expect(toUsd(null)).toBeNull();
    expect(toUsd(new Prisma.Decimal("100.25"))).toBeCloseTo(100.25, 6);
    expect(toUsdOrZero(null)).toBe(0);
    expect(toUsdOrZero(new Prisma.Decimal("100.25"))).toBeCloseTo(100.25, 6);
  });
});

describe("mapEntryGrams", () => {
  it("normalises the four canonical gram columns to number|null", () => {
    const row = {
      id: "e1",
      lineNo: 1,
      gramsTotal: new Prisma.Decimal("10.5"),
      boysGrams: new Prisma.Decimal("3"),
      mdaraGrams: null,
      balGrams: new Prisma.Decimal("0.5"),
      other: "untouched",
    };
    const mapped = mapEntryGrams(row);
    expect(mapped.gramsTotal).toBeCloseTo(10.5);
    expect(mapped.boysGrams).toBe(3);
    expect(mapped.mdaraGrams).toBeNull();
    expect(mapped.balGrams).toBe(0.5);
    expect(mapped.other).toBe("untouched");
    expect(mapped.id).toBe("e1");
    expect(mapped.lineNo).toBe(1);
  });

  it("leaves plain numbers alone", () => {
    const row = {
      gramsTotal: 12.5,
      boysGrams: 1,
      mdaraGrams: 2,
      balGrams: 0,
    };
    expect(mapEntryGrams(row)).toEqual(row);
  });
});
