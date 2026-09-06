/**
 * FD-6.1 — the fiscal worker: run the drainer forever.
 *
 * Modelled on `scripts/pdf-worker.ts`, which is the house shape for a
 * long-running loop: read the interval from the environment, do one unit of
 * work, sleep, log what happened, and never let a thrown error end the process.
 * Two things are added on top of that precedent because this loop talks to
 * ZIMRA and to money:
 *
 *   * **It shuts down gracefully.** A redeploy sends SIGTERM. Dying mid-attempt
 *     is safe — the claim in `fiscal-drain.ts` is a lease that expires, so the
 *     receipt comes back on its own — but finishing the pass in flight means
 *     the outcome is recorded rather than re-attempted, which is one fewer
 *     duplicate submission against FDGA per deploy.
 *   * **It backs off after a failing pass.** A pass only throws when the
 *     database itself is unreachable; retrying that at the normal interval
 *     turns one outage into a log flood.
 *
 * Running more than one of these is expected and safe: rows are claimed, not
 * selected. See the module comment in `lib/accounting/fiscal-drain.ts`.
 *
 *   pnpm worker:fiscal
 */
import { drainDueFiscalReceipts, FISCAL_DRAIN_DEFAULTS } from "@corelithzw/module-books/fiscal-drain";

function envNumber(key: string, fallback: number) {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const intervalMs = envNumber("FISCAL_WORKER_INTERVAL_MS", 5000);
  const idleMs = envNumber("FISCAL_WORKER_IDLE_MS", 30000);
  const errorMs = envNumber("FISCAL_WORKER_ERROR_MS", 60000);
  const batchSize = envNumber("FISCAL_WORKER_BATCH_SIZE", FISCAL_DRAIN_DEFAULTS.batchSize);
  const maxAttempts = envNumber("FISCAL_WORKER_MAX_ATTEMPTS", FISCAL_DRAIN_DEFAULTS.maxAttempts);

  let running = true;
  // Named so both signals log which one arrived; a worker that stopped for an
  // unknown reason is the thing you cannot debug at 2am.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (!running) return;
      running = false;
      console.log(`[fiscal-worker] ${signal} received, finishing the pass in flight`);
    });
  }

  console.log(
    `[fiscal-worker] starting (interval=${intervalMs}ms idle=${idleMs}ms batch=${batchSize} maxAttempts=${maxAttempts})`,
  );

  while (running) {
    try {
      const result = await drainDueFiscalReceipts({ batchSize, maxAttempts });

      if (result.claimed === 0) {
        await sleep(idleMs);
        continue;
      }

      console.log(
        `[fiscal-worker] pass claimed=${result.claimed} succeeded=${result.succeeded} retrying=${result.retryScheduled} gaveUp=${result.gaveUp} deferred=${result.deferred} skipped=${result.skipped}`,
      );
      // A receipt nobody is going to retry again is the one line an operator
      // has to see, so it is logged individually and at error level.
      for (const receipt of result.receipts) {
        if (receipt.outcome === "GAVE_UP") {
          console.error(
            `[fiscal-worker] gave up on receipt ${receipt.receiptId} (company ${receipt.companyId}) after ${receipt.attemptCount} attempts: ${receipt.error ?? "no reason recorded"}`,
          );
        }
      }
      for (const companyId of result.notified) {
        console.warn(`[fiscal-worker] sustained fiscalisation failure notified for ${companyId}`);
      }

      await sleep(intervalMs);
    } catch (error) {
      console.error("[fiscal-worker] loop error", error);
      await sleep(errorMs);
    }
  }

  console.log("[fiscal-worker] stopped");
}

void main();
