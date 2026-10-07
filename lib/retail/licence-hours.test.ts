import { describe, expect, it } from "vitest";

import {
  alcoholVerdict,
  clockLabel,
  harareClock,
  licenceWeekText,
  parseClock,
  parseWindow,
  windowText,
} from "./licence-hours";

// Friday 2 October 2026. Harare is UTC+2 all year.
const at = (utcHHMM: string, day = "02") => new Date(`2026-10-${day}T${utcHHMM}:00Z`);
const FRIDAY = 5;
const WEEK = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, alcoholFrom: 8 * 60, alcoholUntil: 22 * 60 }));

describe("licence hours", () => {
  it("reads the clock in Harare", () => {
    expect(harareClock(at("19:40"))).toEqual({ weekday: FRIDAY, minutes: 21 * 60 + 40 });
  });

  it("sells inside the window and stops at its end", () => {
    expect(alcoholVerdict(WEEK, at("17:40")).sellable).toBe(true); // 19:40 in Harare
    expect(alcoholVerdict(WEEK, at("20:04"))).toEqual({ sellable: false, stoppedAt: 22 * 60, startsAt: 8 * 60 }); // 22:04
  });

  it("says when it starts again before the window opens", () => {
    expect(alcoholVerdict(WEEK, at("04:30"))).toEqual({ sellable: false, stoppedAt: 22 * 60, startsAt: 8 * 60 }); // 06:30
  });

  it("sells all day on a weekday with no window", () => {
    expect(alcoholVerdict([], at("23:00")).sellable).toBe(true);
  });

  it("runs a window past midnight", () => {
    const late = [{ weekday: FRIDAY, alcoholFrom: 10 * 60, alcoholUntil: 2 * 60 }];
    expect(alcoholVerdict(late, at("22:30")).sellable).toBe(true); // Saturday 00:30 in Harare, still inside Friday's window
    expect(alcoholVerdict(late, at("00:30", "03")).sellable).toBe(true); // Saturday 02:30: no Saturday row, so all day
  });

  it("sells none on a day whose window is empty, and says when tomorrow starts", () => {
    const closed = [
      { weekday: FRIDAY, alcoholFrom: 0, alcoholUntil: 0 },
      { weekday: FRIDAY + 1, alcoholFrom: 9 * 60, alcoholUntil: 23 * 60 },
    ];
    expect(alcoholVerdict(closed, at("10:00"))).toEqual({ sellable: false, stoppedAt: 0, startsAt: 9 * 60 });
  });

  it("writes and reads times as the till shows them", () => {
    expect(clockLabel(22 * 60)).toBe("22:00");
    expect(parseClock("08:00")).toBe(480);
    expect(parseClock("24:00")).toBeNull();
  });

  it("reads a window as a manager writes it", () => {
    expect(parseWindow("08:00 to 22:00")).toEqual({ alcoholFrom: 480, alcoholUntil: 1320 });
    expect(parseWindow("10:00 - 2:00")).toEqual({ alcoholFrom: 600, alcoholUntil: 120 });
    expect(parseWindow("08:00 to 08:00")).toBeNull();
    expect(parseWindow("8am to 10pm")).toBeNull();
    expect(windowText(480, 1320)).toBe("08:00 to 22:00");
  });

  it("puts a week in one line, Monday first", () => {
    expect(licenceWeekText([])).toBe("All day, every day");
    expect(
      licenceWeekText([
        { weekday: 0, alcoholFrom: 0, alcoholUntil: 0 },
        { weekday: 1, alcoholFrom: 480, alcoholUntil: 1320 },
      ]),
    ).toBe("Mon 08:00 to 22:00, Sun not at all");
  });
});
