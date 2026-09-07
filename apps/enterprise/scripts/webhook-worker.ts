/**
 * The webhook worker: deliver the outbox forever.
 *
 * The house shape (`scripts/fiscal-worker.ts`): read the interval from the
 * environment, do one pass, sleep, log what happened, finish the pass in
 * flight on SIGTERM, back off after a failing pass. Rows are claimed, not
 * selected, so running more than one of these is expected and safe. One
 * worker serves every host: the outbox is per workspace, not per product.
 *
 *   pnpm enterprise worker:webhooks
 */
import { WEBHOOK_DELIVERY_DEFAULTS, deliverDueWebhooks } from "@corelithzw/platform/outbox";

function envNumber(key: string, fallback: number) {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const intervalMs = envNumber("WEBHOOK_WORKER_INTERVAL_MS", 2000);
  const idleMs = envNumber("WEBHOOK_WORKER_IDLE_MS", 15000);
  const errorMs = envNumber("WEBHOOK_WORKER_ERROR_MS", 60000);
  const batchSize = envNumber("WEBHOOK_WORKER_BATCH_SIZE", WEBHOOK_DELIVERY_DEFAULTS.batchSize);
  const maxAttempts = envNumber("WEBHOOK_WORKER_MAX_ATTEMPTS", WEBHOOK_DELIVERY_DEFAULTS.maxAttempts);

  let running = true;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (!running) return;
      running = false;
      console.log(`[webhook-worker] ${signal} received, finishing the pass in flight`);
    });
  }

  console.log(`[webhook-worker] starting (interval=${intervalMs}ms idle=${idleMs}ms batch=${batchSize} maxAttempts=${maxAttempts})`);

  while (running) {
    try {
      const result = await deliverDueWebhooks({ batchSize, maxAttempts });
      if (result.claimed === 0) {
        await sleep(idleMs);
        continue;
      }
      console.log(
        `[webhook-worker] pass claimed=${result.claimed} delivered=${result.delivered} retrying=${result.retried} gaveUp=${result.gaveUp} skipped=${result.skipped}`,
      );
      for (const outcome of result.outcomes) {
        if (outcome.outcome === "GAVE_UP") {
          console.error(`[webhook-worker] gave up on delivery ${outcome.deliveryId}: ${outcome.error ?? "no reason recorded"}`);
        }
      }
      await sleep(intervalMs);
    } catch (error) {
      console.error("[webhook-worker] loop error", error);
      await sleep(errorMs);
    }
  }

  console.log("[webhook-worker] stopped");
}

void main();
