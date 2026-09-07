import { describe, it, expect } from "vitest";

import { inferNumbering } from "./id-generator";

/**
 * A school's own numbering is continued, not replaced.
 *
 * The bug this closes is the sort nobody files: a school arrives with four hundred
 * pupils numbered `S1000` upwards — in a register, on a wall, in a parent's phone —
 * and the first pupil admitted through the product was handed `STU-0001`, because
 * the configured prefix is `STU` and the matcher only recognised `PREFIX-digits`.
 * Two schemes in one school, the new one starting at 1, which reads as a brand new
 * school to anybody scanning a list.
 */

describe("inferNumbering", () => {
  it("continues a school's own scheme, separator and all", () => {
    const result = inferNumbering(["S1000", "S1001", "S1002"], "STU");
    expect(result).toEqual({ prefix: "S", separator: "", max: 1002 });
  });

  it("recognises a slashed scheme, which is how many schools write them", () => {
    expect(inferNumbering(["CHS/0140", "CHS/0141"], "STU")).toEqual({
      prefix: "CHS",
      separator: "/",
      max: 141,
    });
  });

  it("keeps the product's own scheme when that is what is there", () => {
    expect(inferNumbering(["STU-0001", "STU-0002"], "STU")).toEqual({
      prefix: "STU",
      separator: "-",
      max: 2,
    });
  });

  it("falls back to the configured prefix for a school with no pupils yet", () => {
    expect(inferNumbering([], "STU")).toEqual({ prefix: "STU", separator: "-", max: 0 });
  });

  it("ignores numbers it cannot read rather than guessing", () => {
    // A hand-entered "old file 12b" is not a scheme. It must not become the
    // school's numbering, and it must not stop the real one being found.
    expect(inferNumbering(["S1000", "old file 12b", "", null, "S1001"], "STU")).toEqual({
      prefix: "S",
      separator: "",
      max: 1001,
    });
  });

  it("follows the commonest scheme when a school has changed prefix", () => {
    // Two legacy numbers and four current ones: the four win, so the next number
    // continues what the school is using now.
    const result = inferNumbering(
      ["OLD-0009", "OLD-0010", "S1000", "S1001", "S1002", "S1003"],
      "STU",
    );
    expect(result.prefix).toBe("S");
    expect(result.max).toBe(1003);
  });

  it("breaks a tie on the higher number, not on order", () => {
    const result = inferNumbering(["A-0001", "B-0100"], "STU");
    expect(result.prefix).toBe("B");
    expect(result.max).toBe(100);
  });

  it("treats case as one scheme, since S1000 and s1001 are one register", () => {
    const result = inferNumbering(["S1000", "s1001", "S1002"], "STU");
    expect(result.max).toBe(1002);
    expect(result.prefix.toUpperCase()).toBe("S");
  });
});
