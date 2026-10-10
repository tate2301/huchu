import { describe, expect, it } from "vitest";

import { betweenWords, daysWords, hoursWords, parseBetween, parseHours } from "./hours";

describe("parseHours", () => {
  it("reads the shapes the field hints at", () => {
    expect(parseHours("Fridays, 17:00 to 19:00")).toEqual({ daysOfWeek: [5], fromTime: "17:00", toTime: "19:00" });
    expect(parseHours("Friday 17:00 to 19:00")).toEqual({ daysOfWeek: [5], fromTime: "17:00", toTime: "19:00" });
    expect(parseHours("Fridays and Saturdays, 17:00 to 19:00")).toEqual({ daysOfWeek: [5, 6], fromTime: "17:00", toTime: "19:00" });
    expect(parseHours("Monday to Friday, 08:00 to 12:00")).toEqual({ daysOfWeek: [1, 2, 3, 4, 5], fromTime: "08:00", toTime: "12:00" });
    expect(parseHours("Every day, 17:00 to 19:00")).toEqual({ daysOfWeek: [1, 2, 3, 4, 5, 6, 7], fromTime: "17:00", toTime: "19:00" });
    expect(parseHours("Saturdays, 16:00 to 18:00")).toEqual({ daysOfWeek: [6], fromTime: "16:00", toTime: "18:00" });
    expect(parseHours("Mondays, Wednesdays and Fridays, 8:00 to 9:30")).toEqual({ daysOfWeek: [1, 3, 5], fromTime: "08:00", toTime: "09:30" });
  });

  it("refuses words it cannot read and an end not after the start", () => {
    expect(parseHours("Friday evening")).toBeNull();
    expect(parseHours("Fridays, 19:00 to 17:00")).toBeNull();
    expect(parseHours("Fridays, 25:00 to 26:00")).toBeNull();
    expect(parseHours("Someday, 17:00 to 19:00")).toBeNull();
  });

  it("says the days back the way the list prints them", () => {
    expect(daysWords([5])).toBe("Fridays");
    expect(daysWords([5, 6])).toBe("Fridays and Saturdays");
    expect(daysWords([1, 2, 3, 4, 5])).toBe("Monday to Friday");
    expect(daysWords([1, 2, 3, 4, 5, 6, 7])).toBe("Every day");
    expect(hoursWords({ daysOfWeek: [5], fromTime: "17:00", toTime: "19:00" })).toBe("Fridays 17:00 to 19:00");
  });
});

describe("parseBetween", () => {
  it("takes this year, or next when the dates are past", () => {
    expect(parseBetween("1 December to 26 December", "2026-10-07")).toEqual({ startsOn: "2026-12-01", endsOn: "2026-12-26" });
    expect(parseBetween("1 March to 5 March", "2026-10-07")).toEqual({ startsOn: "2027-03-01", endsOn: "2027-03-05" });
    expect(parseBetween("20 December to 5 January", "2026-10-07")).toEqual({ startsOn: "2026-12-20", endsOn: "2027-01-05" });
    expect(parseBetween("1 December 2026 to 26 December 2026", "2026-10-07")).toEqual({ startsOn: "2026-12-01", endsOn: "2026-12-26" });
  });

  it("refuses anything else", () => {
    expect(parseBetween("Christmas", "2026-10-07")).toBeNull();
    expect(parseBetween("31 February to 3 March", "2026-10-07")).toBeNull();
    expect(parseBetween("26 December 2026 to 1 December 2026", "2026-10-07")).toBeNull();
  });

  it("says the dates back", () => {
    expect(betweenWords({ startsOn: "2026-12-01", endsOn: "2026-12-26" }, "2026-10-07")).toBe("1 December to 26 December");
    expect(betweenWords({ startsOn: "2026-12-20", endsOn: "2027-01-05" }, "2026-10-07")).toBe("20 December to 5 January 2027");
  });
});
