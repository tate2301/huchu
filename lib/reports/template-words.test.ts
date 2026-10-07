import { describe, expect, it } from "vitest";

import { lastOpenedLabel, reportPeriodWords } from "./template-words";

/** Harare is UTC+2: 06:12Z is 08:12 there. */
const now = new Date("2026-10-03T12:42:00Z");

describe("Last opened (70-insights-reports 3.6)", () => {
  it("reads today and yesterday with the time, earlier days as the day", () => {
    expect(lastOpenedLabel(new Date("2026-10-03T06:12:00Z"), now)).toBe("Today, 08:12");
    expect(lastOpenedLabel(new Date("2026-10-02T15:40:00Z"), now)).toBe("Yesterday, 17:40");
    expect(lastOpenedLabel(new Date("2026-09-28T09:20:00Z"), now)).toBe("28 September 2026");
  });

  it("takes the day in Harare, not in UTC", () => {
    // 23:30Z on 2 October is 01:30 on 3 October in Harare.
    expect(lastOpenedLabel(new Date("2026-10-02T23:30:00Z"), now)).toBe("Today, 01:30");
  });
});

describe("a run's period in words", () => {
  it("puts the year once, at the end", () => {
    expect(reportPeriodWords({ from: "2026-10-01", to: "2026-10-03" })).toBe("1 to 3 October 2026");
    expect(reportPeriodWords({ from: "2026-09-28", to: "2026-10-03" })).toBe("28 September to 3 October 2026");
    expect(reportPeriodWords({ from: "2026-10-03", to: "2026-10-03" })).toBe("3 October 2026");
    expect(reportPeriodWords({ from: "2025-12-28", to: "2026-01-03" })).toBe("28 December 2025 to 3 January 2026");
    expect(reportPeriodWords(null)).toBe("any time");
  });
});
