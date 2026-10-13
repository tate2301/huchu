import { describe, expect, it } from "vitest";

import { dailySlot, jobSlot } from "./schedule";

const harare = (iso: string) => new Date(`${iso}+02:00`);

describe("when the scheduled jobs run", () => {
  it("places a daily time on the shop's clock", () => {
    expect(dailySlot(harare("2026-10-05T09:30:00"), "06:00").toISOString()).toBe("2026-10-05T04:00:00.000Z");
    // 01:00 in Harare is still the 4th in UTC; the slot is the shop's day.
    expect(dailySlot(harare("2026-10-05T01:00:00"), "23:00").toISOString()).toBe("2026-10-05T21:00:00.000Z");
    expect(() => dailySlot(new Date(), "6am")).toThrow();
  });

  it("gives a daily job today's time as its slot, and none before it", () => {
    const daily = { dailyAt: "06:00" };
    expect(jobSlot(daily, harare("2026-10-05T05:59:00"))).toBeNull();
    expect(jobSlot(daily, harare("2026-10-05T06:00:00"))).toEqual(harare("2026-10-05T06:00:00"));
    expect(jobSlot(daily, harare("2026-10-05T18:00:00"))).toEqual(harare("2026-10-05T06:00:00"));
    expect(jobSlot(daily, harare("2026-10-06T06:01:00"))).toEqual(harare("2026-10-06T06:00:00"));
  });

  it("cuts the clock into stretches for an interval job, so an early or late tick lands in the right one", () => {
    const often = { everyMinutes: 5 };
    expect(jobSlot(often, harare("2026-10-05T10:00:00"))).toEqual(harare("2026-10-05T10:00:00"));
    expect(jobSlot(often, harare("2026-10-05T10:04:59"))).toEqual(harare("2026-10-05T10:00:00"));
    expect(jobSlot(often, harare("2026-10-05T10:05:00"))).toEqual(harare("2026-10-05T10:05:00"));
    // A minute job whose ticks drift by a few seconds still gets one slot a minute.
    const minute = { everyMinutes: 1 };
    expect(jobSlot(minute, harare("2026-10-05T10:00:59.900"))).toEqual(harare("2026-10-05T10:00:00"));
    expect(jobSlot(minute, harare("2026-10-05T10:01:00.300"))).toEqual(harare("2026-10-05T10:01:00"));
  });
});
