import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MOTION, progressAt } from "./motion";

const css = readFileSync(join(__dirname, "teams.css"), "utf8");

describe("motion tokens", () => {
  it("declares every token in teams.css with its duration and easing", () => {
    for (const t of MOTION) {
      const declared = new RegExp(`--tm-${t.name}:\\s*(\\d+)ms\\s+([^;]+);`).exec(css);
      expect(declared, `--tm-${t.name}`).not.toBeNull();
      expect(Number(declared![1])).toBe(t.ms);
    }
  });

  it("answers reduced motion", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/animation: tm-fade 120ms/);
  });
});

describe("progressAt", () => {
  it("starts at nothing and ends at all of it", () => {
    expect(progressAt("arrive", 0)).toBe(0);
    expect(progressAt("arrive", 260)).toBe(1);
    expect(progressAt("arrive", 900)).toBe(1);
  });
  it("is most of the way there well before the end, because the curve eases out", () => {
    expect(progressAt("arrive", 90)).toBeGreaterThan(0.6);
    expect(progressAt("sheet", 90)).toBeGreaterThan(0.6);
  });
  it("rises and never falls", () => {
    let last = 0;
    for (let ms = 0; ms <= 700; ms += 35) {
      const p = progressAt("fill", ms);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
  });
  it("refuses a token that is not in the table", () => {
    expect(() => progressAt("wobble", 10)).toThrow();
  });
});
