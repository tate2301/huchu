import { ACCENT_HUES } from "@corelithzw/react";
import { describe, it, expect } from "vitest";

import { ACCENTS, ACCENT_LABELS, isAccent } from "@/lib/ui/accents";

describe("ACCENTS", () => {
  it("is exactly the design system's palette", () => {
    // Restated rather than imported so server routes stay free of the
    // component library — which only holds if the two lists cannot drift.
    expect([...ACCENTS]).toEqual([...ACCENT_HUES]);
  });

  it("labels every hue", () => {
    for (const accent of ACCENTS) expect(ACCENT_LABELS[accent]).toBeTruthy();
  });
});

describe("isAccent", () => {
  it("accepts a hue and rejects anything else", () => {
    expect(isAccent("teal")).toBe(true);
    expect(isAccent("chartreuse")).toBe(false);
    expect(isAccent(null)).toBe(false);
  });
});
