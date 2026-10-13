/**
 * Migration witness for `20261013130000_scheduled_job_runs`, and the runner on
 * top of it: a job runs once a slot however many ticks come, overlapping ticks
 * never run it twice, a failed job is tried again, and a tick out of time
 * leaves the rest for the next one.
 */
import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { LEASE_MS, runDueJobs } from "./run";
import type { ScheduledJob } from "./schedule";

const suffix = randomUUID().slice(0, 8);
const names: string[] = [];

function job(label: string, when: ScheduledJob["when"], run: ScheduledJob["run"]): ScheduledJob {
  const name = `test-${label}-${suffix}`;
  names.push(name);
  return { name, when, run };
}

const at = (iso: string) => () => new Date(iso);

afterAll(async () => {
  await prisma.scheduledJobRun.deleteMany({ where: { name: { in: names } } });
});

describe("the ScheduledJobRun table", () => {
  it("has the columns the runner needs", async () => {
    const columns = await prisma.$queryRaw<Array<{ column_name: string; is_nullable: string }>>`
      SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'ScheduledJobRun' ORDER BY column_name`;
    expect(columns).toEqual([
      { column_name: "claimedUntil", is_nullable: "YES" },
      { column_name: "lastRunAt", is_nullable: "YES" },
      { column_name: "name", is_nullable: "NO" },
      { column_name: "updatedAt", is_nullable: "NO" },
    ]);
  });
});

describe("running the due jobs", () => {
  it("runs a job once a slot, however many ticks come", async () => {
    let runs = 0;
    const often = job("often", { everyMinutes: 5 }, async () => `run ${++runs}`);

    expect(await runDueJobs([often], { now: at("2026-10-13T10:00:05Z"), budgetMs: 60_000 })).toEqual([
      { job: often.name, result: "ran", said: "run 1" },
    ]);
    expect(await runDueJobs([often], { now: at("2026-10-13T10:01:05Z"), budgetMs: 60_000 })).toEqual([]);
    expect(await runDueJobs([often], { now: at("2026-10-13T10:05:01Z"), budgetMs: 60_000 })).toHaveLength(1);
    expect(runs).toBe(2);
  });

  it("runs a daily job after its time, not before", async () => {
    let runs = 0;
    const daily = job("daily", { dailyAt: "06:00" }, async () => `run ${++runs}`);

    expect(await runDueJobs([daily], { now: at("2026-10-13T05:59:00+02:00"), budgetMs: 60_000 })).toEqual([]);
    expect(await runDueJobs([daily], { now: at("2026-10-13T09:00:00+02:00"), budgetMs: 60_000 })).toHaveLength(1);
    expect(await runDueJobs([daily], { now: at("2026-10-13T18:00:00+02:00"), budgetMs: 60_000 })).toEqual([]);
    expect(runs).toBe(1);
  });

  it("never runs a job twice when two ticks overlap", async () => {
    let runs = 0;
    const slow = job("slow", { everyMinutes: 1 }, async () => {
      runs += 1;
      await new Promise((resolve) => setTimeout(resolve, 300));
      return "done";
    });

    const now = at("2026-10-13T11:00:10Z");
    const [first, second] = await Promise.all([
      runDueJobs([slow], { now, budgetMs: 60_000 }),
      runDueJobs([slow], { now, budgetMs: 60_000 }),
    ]);
    expect(runs).toBe(1);
    expect(first.length + second.length).toBe(1);
  });

  it("tries a failed job again on the next tick, and still runs the others", async () => {
    let attempts = 0;
    const flaky = job("flaky", { everyMinutes: 5 }, async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("WhatsApp did not answer");
      return "sent";
    });
    const steady = job("steady", { everyMinutes: 5 }, async () => "fine");

    expect(await runDueJobs([flaky, steady], { now: at("2026-10-13T12:00:00Z"), budgetMs: 60_000 })).toEqual([
      { job: flaky.name, result: "failed", error: "WhatsApp did not answer" },
      { job: steady.name, result: "ran", said: "fine" },
    ]);
    expect(await runDueJobs([flaky, steady], { now: at("2026-10-13T12:01:00Z"), budgetMs: 60_000 })).toEqual([
      { job: flaky.name, result: "ran", said: "sent" },
    ]);
  });

  it("takes over a job whose tick died, once its lease has run out", async () => {
    let runs = 0;
    const orphan = job("orphan", { everyMinutes: 5 }, async () => `run ${++runs}`);
    const claimedAt = new Date("2026-10-13T13:00:00Z");
    await prisma.scheduledJobRun.create({
      data: { name: orphan.name, claimedUntil: new Date(claimedAt.getTime() + LEASE_MS) },
    });

    expect(await runDueJobs([orphan], { now: at("2026-10-13T13:01:00Z"), budgetMs: 60_000 })).toEqual([]);
    expect(
      await runDueJobs([orphan], { now: () => new Date(claimedAt.getTime() + LEASE_MS + 1_000), budgetMs: 60_000 }),
    ).toHaveLength(1);
    expect(runs).toBe(1);
  });

  it("leaves the jobs it has no time for to the next tick", async () => {
    let clock = new Date("2026-10-13T14:00:00Z").getTime();
    const long = job("long", { everyMinutes: 5 }, async () => {
      clock += 100_000;
      return "took a while";
    });
    const waiting = job("waiting", { everyMinutes: 5 }, async () => "ran next tick");

    expect(await runDueJobs([long, waiting], { now: () => new Date(clock), budgetMs: 90_000 })).toEqual([
      { job: long.name, result: "ran", said: "took a while" },
    ]);
    expect(await runDueJobs([long, waiting], { now: () => new Date(clock), budgetMs: 90_000 })).toEqual([
      { job: waiting.name, result: "ran", said: "ran next tick" },
    ]);
  });
});
