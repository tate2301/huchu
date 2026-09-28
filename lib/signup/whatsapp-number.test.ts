import { describe, expect, it } from "vitest";

import { normaliseZimbabweMobile } from "./whatsapp-number";

describe("normaliseZimbabweMobile", () => {
  it("stores every way people type the same number once", () => {
    for (const typed of ["0771234567", "771234567", "+263771234567", "263 77 123 4567", "+263 (77) 123-4567"]) {
      expect(normaliseZimbabweMobile(typed)).toBe("+263771234567");
    }
  });

  it("accepts every mobile network", () => {
    expect(normaliseZimbabweMobile("0711234567")).toBe("+263711234567");
    expect(normaliseZimbabweMobile("0731234567")).toBe("+263731234567");
    expect(normaliseZimbabweMobile("0781234567")).toBe("+263781234567");
  });

  it("refuses a landline, a short number and a foreign number", () => {
    expect(normaliseZimbabweMobile("0242123456")).toBeNull();
    expect(normaliseZimbabweMobile("077123")).toBeNull();
    expect(normaliseZimbabweMobile("+27821234567")).toBeNull();
    expect(normaliseZimbabweMobile("")).toBeNull();
  });
});
