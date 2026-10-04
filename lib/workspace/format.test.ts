import { describe, expect, it } from "vitest";

import {
  dayKey,
  formatCount,
  formatDay,
  formatDuration,
  formatMoney,
  formatPercent,
  formatShortDay,
  formatSigned,
  formatTime,
  formatWhen,
} from "./format";

describe("money", () => {
  it("prints money as the till does", () => {
    expect(formatMoney(1284.6)).toBe("US$1,284.60");
    expect(formatMoney(1284.6, "ZWG")).toBe("ZiG 1,284.60");
    expect(formatMoney(-7.15)).toBe("−US$7.15");
    expect(formatMoney(0)).toBe("US$0.00");
  });

  it("always signs a difference, with U+2212 and no space", () => {
    expect(formatSigned(-7.15)).toBe("−US$7.15");
    expect(formatSigned(3.17)).toBe("+US$3.17");
    expect(formatSigned(0)).toBe("US$0.00");
    // Float dust is zero, not "−US$0.00".
    expect(formatSigned(-0.001)).toBe("US$0.00");
  });

  it("prints counts and percentages", () => {
    expect(formatCount(8412)).toBe("8,412");
    expect(formatPercent(28.6)).toBe("28.6%");
    expect(formatPercent(6.1, { signed: true })).toBe("+6.1%");
    expect(formatPercent(-2.4, { signed: true })).toBe("−2.4%");
  });
});

describe("dates, in the company's zone", () => {
  // 11:12 UTC is 13:12 in Harare.
  const at = new Date("2026-10-03T11:12:00Z");

  it("prints a date and time in a table", () => {
    expect(formatWhen(at)).toBe("3 Oct 13:12");
    expect(formatTime(at)).toBe("13:12");
  });

  it("never prints September as Sept", () => {
    expect(formatShortDay("2026-09-30")).toBe("30 Sep");
    expect(formatShortDay(new Date("2026-09-30T10:00:00Z"))).toBe("30 Sep");
  });

  it("prints a long date", () => {
    expect(formatDay("2026-08-15")).toBe("15 August 2026");
    // 23:30 UTC on the 14th is already the 15th in Harare.
    expect(formatDay(new Date("2026-08-14T23:30:00Z"))).toBe("15 August 2026");
    expect(dayKey(new Date("2026-08-14T23:30:00Z"))).toBe("2026-08-15");
  });

  it("prints a duration in hours and minutes", () => {
    expect(formatDuration(52 * 60 + 50)).toBe("52h 50m");
    expect(formatDuration(6 * 60 + 12)).toBe("6h 12m");
    expect(formatDuration(7 * 60)).toBe("7h 00m");
  });
});
