import { describe, expect, it } from "vitest";

import { addDays, dateFilterRange, dayIn, presetDays, safeTimeZone, startOfDay } from "./dates";

describe("days in a zone", () => {
  it("starts a Harare day two hours before UTC's", () => {
    expect(startOfDay("2026-09-27", "Africa/Harare").toISOString()).toBe("2026-09-26T22:00:00.000Z");
  });

  it("puts a late-evening UTC instant on the next Harare day", () => {
    expect(dayIn(new Date("2026-09-26T23:30:00Z"), "Africa/Harare")).toBe("2026-09-27");
    expect(dayIn(new Date("2026-09-26T21:30:00Z"), "Africa/Harare")).toBe("2026-09-26");
  });

  it("follows a daylight-saving change", () => {
    // London moves to summer time on 29 March 2026.
    expect(startOfDay("2026-03-29", "Europe/London").toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(startOfDay("2026-03-30", "Europe/London").toISOString()).toBe("2026-03-29T23:00:00.000Z");
  });

  it("falls back to the platform zone for a zone it does not know", () => {
    expect(safeTimeZone("Not/AZone")).toBe("Africa/Harare");
    expect(safeTimeZone(undefined)).toBe("Africa/Harare");
    expect(safeTimeZone("Europe/London")).toBe("Europe/London");
  });

  it("moves days across months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("presets", () => {
  // 27 September 2026 is a Sunday.
  const today = "2026-09-27";

  it("runs a week Monday to Monday", () => {
    expect(presetDays("this-week", today)).toEqual({ from: "2026-09-21", until: "2026-09-28" });
    expect(presetDays("this-week", "2026-09-21")).toEqual({ from: "2026-09-21", until: "2026-09-28" });
  });

  it("runs a month to the first of the next", () => {
    expect(presetDays("this-month", today)).toEqual({ from: "2026-09-01", until: "2026-10-01" });
    expect(presetDays("this-month", "2026-12-15")).toEqual({ from: "2026-12-01", until: "2027-01-01" });
  });

  it("counts today in the last and the next days", () => {
    expect(presetDays("last-7d", today)).toEqual({ from: "2026-09-21", until: "2026-09-28" });
    expect(presetDays("last-30d", today)).toEqual({ from: "2026-08-29", until: "2026-09-28" });
    expect(presetDays("next-7d", today)).toEqual({ from: "2026-09-27", until: "2026-10-04" });
    expect(presetDays("today", today)).toEqual({ from: "2026-09-27", until: "2026-09-28" });
  });

  it("makes overdue everything before today", () => {
    expect(presetDays("overdue", today)).toEqual({ until: "2026-09-27" });
  });
});

describe("dateFilterRange", () => {
  const context = { now: new Date("2026-09-27T08:00:00Z"), tz: "Africa/Harare" };

  it("includes the last day of a typed range", () => {
    expect(dateFilterRange({ from: "2026-09-01", to: "2026-09-30" }, context)).toEqual({
      gte: new Date("2026-08-31T22:00:00Z"),
      lt: new Date("2026-09-30T22:00:00Z"),
    });
  });

  it("resolves a preset against the asker's today", () => {
    expect(dateFilterRange({ preset: "today" }, context)).toEqual({
      gte: new Date("2026-09-26T22:00:00Z"),
      lt: new Date("2026-09-27T22:00:00Z"),
    });
  });

  it("narrows nothing for an empty or foreign value", () => {
    expect(dateFilterRange(undefined, context)).toBeUndefined();
    expect(dateFilterRange(["a"], context)).toBeUndefined();
    expect(dateFilterRange({}, context)).toBeUndefined();
    expect(dateFilterRange(true, context)).toBeUndefined();
  });
});
