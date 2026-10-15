import { describe, expect, it } from "vitest";

import { clampSize, DEFAULT_SIZES, readSizes, sizesKey, stepSize } from "./sizes";

describe("builder panel sizes", () => {
  it("keeps each panel within the boards' limits", () => {
    expect(clampSize("outline", 120)).toBe(200);
    expect(clampSize("outline", 900)).toBe(400);
    expect(clampSize("inspector", 333.4)).toBe(333);
    expect(clampSize("shelf", Number.NaN)).toBe(DEFAULT_SIZES.shelf);
  });

  it("keeps sizes per person and per builder", () => {
    expect(sizesKey("report", "u1")).toBe("builder-sizes:report:u1");
    expect(sizesKey("report", null)).toBeNull();
  });

  it("reads what was stored, and falls back where it cannot", () => {
    expect(readSizes(null)).toEqual(DEFAULT_SIZES);
    expect(readSizes("not json")).toEqual(DEFAULT_SIZES);
    expect(readSizes(JSON.stringify({ outline: 300, inspector: "wide", shelf: 9999 }))).toEqual({
      ...DEFAULT_SIZES,
      outline: 300,
      shelf: 560,
    });
  });

  it("steps by 16, or 64 with Shift, from the keyboard", () => {
    expect(stepSize("outline", 240, 1, false)).toBe(256);
    expect(stepSize("outline", 240, -1, true)).toBe(200);
  });
});
