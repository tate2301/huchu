import { describe, expect, it } from "vitest";

import { isRetailSource, nextPostingRun } from "./posting-schedule";

describe("the day's posting run", () => {
  it("is tonight's 23:00 in Harare until it passes, then tomorrow's", () => {
    expect(nextPostingRun(new Date("2026-10-03T10:00:00+02:00")).toISOString()).toBe("2026-10-03T21:00:00.000Z");
    expect(nextPostingRun(new Date("2026-10-03T22:59:00+02:00")).toISOString()).toBe("2026-10-03T21:00:00.000Z");
    expect(nextPostingRun(new Date("2026-10-03T23:00:00+02:00")).toISOString()).toBe("2026-10-04T21:00:00.000Z");
    // After midnight in Harare, still the evening before in UTC.
    expect(nextPostingRun(new Date("2026-10-04T00:30:00+02:00")).toISOString()).toBe("2026-10-04T21:00:00.000Z");
  });

  it("waits only for the shop's own sources", () => {
    expect(isRetailSource("RETAIL_SALE")).toBe(true);
    expect(isRetailSource("RETAIL_GOODS_RECEIPT")).toBe(true);
    expect(isRetailSource("SALES_INVOICE")).toBe(false);
  });
});
