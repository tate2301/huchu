import { describe, expect, it } from "vitest";

import { describeWhen, dueSchedules, nextRunAt, scheduleQuery } from "./schedule";

// Harare is UTC+2 all year: 07:00 there is 05:00Z.
const at = (iso: string) => new Date(iso);

describe("nextRunAt", () => {
  it("sends daily at the time, today if it is still to come, else tomorrow", () => {
    const when = { frequency: "DAILY" as const, day: null, time: "07:00" };
    expect(nextRunAt(when, at("2026-10-13T04:00:00Z")).toISOString()).toBe("2026-10-13T05:00:00.000Z");
    expect(nextRunAt(when, at("2026-10-13T05:00:00Z")).toISOString()).toBe("2026-10-14T05:00:00.000Z");
    expect(nextRunAt(when, at("2026-10-13T09:00:00Z")).toISOString()).toBe("2026-10-14T05:00:00.000Z");
  });

  it("reads the day on the workspace's clock, not UTC's", () => {
    // 23:30Z on the 13th is already 01:30 on the 14th in Harare.
    const when = { frequency: "DAILY" as const, day: null, time: "00:15" };
    expect(nextRunAt(when, at("2026-10-13T23:30:00Z")).toISOString()).toBe("2026-10-14T22:15:00.000Z");
  });

  it("sends weekly on its weekday", () => {
    const monday = { frequency: "WEEKLY" as const, day: 1, time: "07:00" };
    // Tuesday 13 October 2026 → Monday 19 October.
    expect(nextRunAt(monday, at("2026-10-13T08:00:00Z")).toISOString()).toBe("2026-10-19T05:00:00.000Z");
    // On the Monday itself, before and after the time.
    expect(nextRunAt(monday, at("2026-10-19T04:59:00Z")).toISOString()).toBe("2026-10-19T05:00:00.000Z");
    expect(nextRunAt(monday, at("2026-10-19T05:00:00Z")).toISOString()).toBe("2026-10-26T05:00:00.000Z");
    const sunday = { frequency: "WEEKLY" as const, day: 7, time: "18:30" };
    expect(nextRunAt(sunday, at("2026-10-13T08:00:00Z")).toISOString()).toBe("2026-10-18T16:30:00.000Z");
  });

  it("sends monthly on its date", () => {
    const first = { frequency: "MONTHLY" as const, day: 1, time: "07:00" };
    expect(nextRunAt(first, at("2026-10-13T08:00:00Z")).toISOString()).toBe("2026-11-01T05:00:00.000Z");
    const fifteenth = { frequency: "MONTHLY" as const, day: 15, time: "07:00" };
    expect(nextRunAt(fifteenth, at("2026-10-13T08:00:00Z")).toISOString()).toBe("2026-10-15T05:00:00.000Z");
    expect(nextRunAt(fifteenth, at("2026-12-15T06:00:00Z")).toISOString()).toBe("2027-01-15T05:00:00.000Z");
  });

  it("sends on the month's last day when the month is shorter", () => {
    const end = { frequency: "MONTHLY" as const, day: 31, time: "17:00" };
    expect(nextRunAt(end, at("2026-10-13T08:00:00Z")).toISOString()).toBe("2026-10-31T15:00:00.000Z");
    expect(nextRunAt(end, at("2026-10-31T15:00:00Z")).toISOString()).toBe("2026-11-30T15:00:00.000Z");
    expect(nextRunAt(end, at("2027-02-01T08:00:00Z")).toISOString()).toBe("2027-02-28T15:00:00.000Z");
    // A leap year's February has 29 days.
    expect(nextRunAt(end, at("2028-02-01T08:00:00Z")).toISOString()).toBe("2028-02-29T15:00:00.000Z");
    const thirtieth = { frequency: "MONTHLY" as const, day: 30, time: "17:00" };
    expect(nextRunAt(thirtieth, at("2027-02-28T15:00:00Z")).toISOString()).toBe("2027-03-30T15:00:00.000Z");
  });
});

describe("dueSchedules", () => {
  const now = at("2026-10-19T05:02:00Z");
  const schedules = [
    { id: "due", active: true, nextRunAt: at("2026-10-19T05:00:00Z") },
    { id: "exactly-now", active: true, nextRunAt: now },
    { id: "later", active: true, nextRunAt: at("2026-10-19T05:03:00Z") },
    { id: "stopped", active: false, nextRunAt: at("2026-10-18T05:00:00Z") },
    { id: "never-set", active: true, nextRunAt: null },
    { id: "missed-last-week", active: true, nextRunAt: at("2026-10-12T05:00:00Z") },
  ];

  it("picks the schedules that are on and whose time has come, missed ones included", () => {
    expect(dueSchedules(schedules, now).map((schedule) => schedule.id)).toEqual(["due", "exactly-now", "missed-last-week"]);
  });

  it("picks nothing a second time once each has moved on", () => {
    const moved = dueSchedules(schedules, now).map((schedule) => ({ ...schedule, nextRunAt: at("2026-10-26T05:00:00Z") }));
    expect(dueSchedules(moved, now)).toEqual([]);
  });
});

describe("in words", () => {
  it("says when it goes", () => {
    expect(describeWhen({ frequency: "WEEKLY", day: 1, time: "07:00" })).toBe("Every Monday at 07:00");
    expect(describeWhen({ frequency: "DAILY", day: null, time: "18:00" })).toBe("Every day at 18:00");
    expect(describeWhen({ frequency: "MONTHLY", day: 31, time: "07:00" })).toBe("On the 31st of each month (or its last day) at 07:00");
  });

  it("keeps the choices and the view, never the dates", () => {
    expect(scheduleQuery({ from: "2026-01-01", to: "2026-12-31", site: "msasa" }, ["from", "to"], "abc")).toBe("site=msasa&v=abc");
  });
});
