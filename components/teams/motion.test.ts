import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MOTION } from "./motion";

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
