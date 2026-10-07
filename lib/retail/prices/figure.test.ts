import { describe, expect, it } from "vitest";

import { centsOf } from "./figure";

/**
 * A price as typed (PRD-07): one rule for the worksheet, Change many prices,
 * the phone's price sheet, the product form, the import and the preview.
 */
describe("centsOf", () => {
  it("reads a plain price, with or without US$, in whole cents", () => {
    expect(centsOf("18.99")).toBe(1899);
    expect(centsOf("US$ 18.99")).toBe(1899);
    expect(centsOf("$2.5")).toBe(250);
    expect(centsOf(" 7 ")).toBe(700);
    expect(centsOf("0")).toBe(0);
    expect(centsOf("0018.20")).toBe(1820);
    expect(centsOf("9999999.99")).toBe(999999999);
  });

  it("refuses what is not one, never rounding it or reading it as something else", () => {
    for (const typed of ["1e3", "1.234", "99999999999", "10000000", "18,99", "1,234.50", "-1", "", "abc", "18.", ".5", "Infinity"]) {
      expect(centsOf(typed)).toBeNull();
    }
  });
});
