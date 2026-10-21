import { describe, expect, it } from "vitest";

import { outsideAccessOpen } from "./outside-accountant";

describe("outside accountant access", () => {
  const now = new Date("2026-10-21T15:30:00.000Z");
  it("is open until the end date, that day included", () => {
    expect(outsideAccessOpen(new Date("2026-10-21T00:00:00.000Z"), now)).toBe(true);
    expect(outsideAccessOpen(new Date("2026-12-31T00:00:00.000Z"), now)).toBe(true);
  });
  it("is closed the day after, and with no end date", () => {
    expect(outsideAccessOpen(new Date("2026-10-20T00:00:00.000Z"), now)).toBe(false);
    expect(outsideAccessOpen(null, now)).toBe(false);
  });
});
