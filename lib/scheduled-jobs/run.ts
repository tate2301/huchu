import { prisma } from "@/lib/prisma";

import { jobSlot, type ScheduledJob } from "./schedule";

/**
 * Runs every job that is due, one after another, for one tick.
 *
 * A job is claimed before it runs: one `UPDATE` sets its lease, and only if it
 * has not run since its current slot began and nobody else holds it. Two ticks
 * that overlap therefore never run the same job, and a tick that dies mid-job
 * hands it to the first tick after the lease ends. A job that throws is
 * released without a new `lastRunAt`, so the next tick tries it again; the
 * other jobs still run.
 *
 * Jobs not reached before `budgetMs` wait for the next tick, still due, so a
 * slow job never runs the tick past its time limit.
 */

/** How long a claim holds. Longer than any tick can live (the route's `maxDuration`). */
export const LEASE_MS = 5 * 60_000;

export type JobOutcome = { job: string; result: "ran"; said: string } | { job: string; result: "failed"; error: string };

export async function runDueJobs(
  jobs: readonly ScheduledJob[],
  options: { now?: () => Date; budgetMs: number },
): Promise<JobOutcome[]> {
  const clock = options.now ?? (() => new Date());
  const startedAt = clock().getTime();

  await prisma.scheduledJobRun.createMany({ data: jobs.map((job) => ({ name: job.name })), skipDuplicates: true });

  const outcomes: JobOutcome[] = [];
  for (const job of jobs) {
    const now = clock();
    if (now.getTime() - startedAt >= options.budgetMs) break;

    const slot = jobSlot(job.when, now);
    if (!slot) continue;

    const { count } = await prisma.scheduledJobRun.updateMany({
      where: {
        name: job.name,
        OR: [{ lastRunAt: null }, { lastRunAt: { lt: slot } }],
        AND: [{ OR: [{ claimedUntil: null }, { claimedUntil: { lt: now } }] }],
      },
      data: { claimedUntil: new Date(now.getTime() + LEASE_MS) },
    });
    if (count === 0) continue;

    try {
      const said = await job.run(now);
      await prisma.scheduledJobRun.update({ where: { name: job.name }, data: { lastRunAt: now, claimedUntil: null } });
      console.log(`[scheduled-jobs] ${job.name}: ${said}`);
      outcomes.push({ job: job.name, result: "ran", said });
    } catch (error) {
      console.error(`[scheduled-jobs] ${job.name} failed`, error);
      await prisma.scheduledJobRun.update({ where: { name: job.name }, data: { claimedUntil: null } });
      outcomes.push({ job: job.name, result: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  }
  return outcomes;
}
