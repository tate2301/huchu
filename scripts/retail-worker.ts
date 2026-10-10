/**
 * The retail worker: the shop's scheduled jobs, run forever (10-setup §4.1).
 *
 * The house shape of `scripts/fiscal-worker.ts`: wake every minute, run what
 * is due (`lib/retail/worker/schedule.ts`), log one line per job, finish the
 * pass in flight on SIGTERM, and never let a thrown error end the process. A
 * job that throws is logged and tried again on the next pass that finds it
 * due; the others still run.
 *
 *   pnpm worker:retail
 */
import { RETAIL_JOBS } from "@/lib/retail/worker/jobs";
import { dueJobs } from "@/lib/retail/worker/schedule";

function envNumber(key: string, fallback: number) {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const intervalMs = envNumber("RETAIL_WORKER_INTERVAL_MS", 60_000);
  const lastRuns = new Map<string, Date>();

  let running = true;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (!running) return;
      running = false;
      console.log(`[retail-worker] ${signal} received, finishing the pass in flight`);
    });
  }

  console.log(
    `[retail-worker] starting (interval=${intervalMs}ms, jobs: ${RETAIL_JOBS.map((job) => job.name).join(", ") || "none"})`,
  );

  while (running) {
    const now = new Date();
    for (const job of dueJobs(RETAIL_JOBS, lastRuns, now)) {
      try {
        const said = await job.run(now);
        lastRuns.set(job.name, now);
        console.log(`[retail-worker] ${job.name}: ${said}`);
      } catch (error) {
        console.error(`[retail-worker] ${job.name} failed`, error);
      }
    }
    await sleep(intervalMs);
  }

  console.log("[retail-worker] stopped");
}

void main();
