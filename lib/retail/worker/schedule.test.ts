import { describe, expect, it } from "vitest";

import { dailySlot, dueJobs, isJobDue, type RetailJob } from "./schedule";

const harare = (iso: string) => new Date(`${iso}+02:00`);

describe("when the retail worker's jobs run", () => {
  it("places a daily time on the shop's clock", () => {
    expect(dailySlot(harare("2026-10-05T09:30:00"), "06:00").toISOString()).toBe("2026-10-05T04:00:00.000Z");
    // 01:00 in Harare is still the 4th in UTC; the slot is the shop's day.
    expect(dailySlot(harare("2026-10-05T01:00:00"), "23:00").toISOString()).toBe("2026-10-05T21:00:00.000Z");
    expect(() => dailySlot(new Date(), "6am")).toThrow();
  });

  it("runs a daily job once after its time, and again the next day", () => {
    const daily = { dailyAt: "06:00" };
    expect(isJobDue(daily, null, harare("2026-10-05T05:59:00"))).toBe(false);
    expect(isJobDue(daily, null, harare("2026-10-05T06:00:00"))).toBe(true);
    expect(isJobDue(daily, harare("2026-10-05T06:00:30"), harare("2026-10-05T18:00:00"))).toBe(false);
    expect(isJobDue(daily, harare("2026-10-05T06:00:30"), harare("2026-10-06T06:01:00"))).toBe(true);
    // Down at six, back at nine: it runs once on the way up.
    expect(isJobDue(daily, harare("2026-10-04T06:00:30"), harare("2026-10-05T09:00:00"))).toBe(true);
  });

  it("runs an interval job when it has waited long enough", () => {
    const often = { everyMinutes: 5 };
    expect(isJobDue(often, null, harare("2026-10-05T10:00:00"))).toBe(true);
    expect(isJobDue(often, harare("2026-10-05T10:00:00"), harare("2026-10-05T10:04:59"))).toBe(false);
    expect(isJobDue(often, harare("2026-10-05T10:00:00"), harare("2026-10-05T10:05:00"))).toBe(true);
  });

  it("lists the due jobs in order", () => {
    const job = (name: string, when: RetailJob["when"]): RetailJob => ({ name, when, run: async () => name });
    const jobs = [job("posting", { dailyAt: "23:00" }), job("reminder", { dailyAt: "06:00" }), job("outbox", { everyMinutes: 5 })];
    const lastRuns = new Map([["outbox", harare("2026-10-05T09:58:00")]]);
    expect(dueJobs(jobs, lastRuns, harare("2026-10-05T10:00:00")).map((due) => due.name)).toEqual(["reminder"]);
  });
});
