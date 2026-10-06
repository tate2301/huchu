import { describe, expect, it } from "vitest";

import {
  addDays,
  dayBoundRefusal,
  dayKey,
  dayRangeWords,
  daysBetween,
  formatCount,
  formatDay,
  formatDuration,
  formatMoney,
  formatPercent,
  formatShortDay,
  formatShortMonth,
  formatSigned,
  formatTime,
  formatWhen,
  parseDay,
  parseTime,
  todayIn,
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
    expect(formatShortMonth("2026-09")).toBe("Sep");
  });

  it("prints a long date", () => {
    expect(formatDay("2026-08-15")).toBe("15 August 2026");
    // 23:30 UTC on the 14th is already the 15th in Harare.
    expect(formatDay(new Date("2026-08-14T23:30:00Z"))).toBe("15 August 2026");
    expect(dayKey(new Date("2026-08-14T23:30:00Z"))).toBe("2026-08-15");
  });

  it("reads a typed day back, and refuses a day that does not exist", () => {
    expect(parseDay("31 December 2026")).toBe("2026-12-31");
    expect(parseDay(" 1 jan 2027 ")).toBe("2027-01-01");
    expect(parseDay("2026-12-31")).toBe("2026-12-31");
    expect(parseDay(formatDay("2026-02-28"))).toBe("2026-02-28");
    expect(parseDay("31 February 2026")).toBeNull();
    expect(parseDay("December 2026")).toBeNull();
    expect(parseDay("31 Decembre 2026")).toBeNull();
  });

  it("prints a duration in hours and minutes", () => {
    expect(formatDuration(52 * 60 + 50)).toBe("52h 50m");
    expect(formatDuration(6 * 60 + 12)).toBe("6h 12m");
    expect(formatDuration(7 * 60)).toBe("7h 00m");
  });
});

describe("picking days", () => {
  it("knows today in Harare, not in the machine's zone", () => {
    expect(todayIn("Africa/Harare", new Date("2026-10-05T22:30:00Z"))).toBe("2026-10-06");
    expect(todayIn("UTC", new Date("2026-10-05T22:30:00Z"))).toBe("2026-10-05");
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts the days in a range, both ends in", () => {
    expect(daysBetween("2026-10-01", "2026-10-03")).toBe(3);
    expect(daysBetween("2026-10-03", "2026-10-03")).toBe(1);
    expect(daysBetween("2025-12-28", "2026-01-03")).toBe(7);
  });

  it("reads a time as people type it", () => {
    expect(parseTime("9:05")).toBe("09:05");
    expect(parseTime("0905")).toBe("09:05");
    expect(parseTime("14:30")).toBe("14:30");
    expect(parseTime("25:00")).toBeNull();
    expect(parseTime("9:60")).toBeNull();
    expect(parseTime("nine")).toBeNull();
  });

  it("says a range of days in words", () => {
    const today = "2026-10-06";
    expect(dayRangeWords({ from: "2026-10-03", to: "2026-10-03" }, today)).toBe("3 October");
    expect(dayRangeWords({ from: "2026-10-01", to: "2026-10-03" }, today)).toBe("1 to 3 October");
    expect(dayRangeWords({ from: "2026-09-28", to: "2026-10-03" }, today)).toBe("28 September to 3 October");
    expect(dayRangeWords({ from: "2025-12-28", to: "2026-01-03" }, today)).toBe("28 December 2025 to 3 January 2026");
    expect(dayRangeWords({ from: "2025-10-01", to: "2025-10-03" }, today)).toBe("1 to 3 October 2025");
    expect(dayRangeWords({ from: "2026-10-01", to: null }, today)).toBe("From 1 October");
    expect(dayRangeWords({ from: null, to: "2026-10-03" }, today)).toBe("Up to 3 October");
    expect(dayRangeWords({ from: null, to: null }, today)).toBe("");
  });

  it("refuses a day outside its bounds in words", () => {
    expect(dayBoundRefusal("2026-10-05", "2026-10-06")).toBe("Choose a day from 6 October 2026.");
    expect(dayBoundRefusal("2026-10-07", null, "2026-10-06")).toBe("Choose a day up to 6 October 2026.");
    expect(dayBoundRefusal("2026-10-06", "2026-10-06", "2026-10-06")).toBeNull();
  });
});
