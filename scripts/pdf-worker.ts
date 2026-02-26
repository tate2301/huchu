import { processNextDocumentRenderJob } from "@/lib/documents/service";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const intervalMs = Number(process.env.PDF_WORKER_INTERVAL_MS ?? 5000);
  const idleMs = Number(process.env.PDF_WORKER_IDLE_MS ?? 3000);

  console.log(`[pdf-worker] starting (interval=${intervalMs}ms idle=${idleMs}ms)`);

  while (true) {
    try {
      const result = await processNextDocumentRenderJob();
      if (!result.processed) {
        await sleep(idleMs);
        continue;
      }

      if ("status" in result && result.status === "FAILED") {
        console.error("[pdf-worker] job failed", result);
      } else {
        console.log("[pdf-worker] job processed", result);
      }

      await sleep(intervalMs);
    } catch (error) {
      console.error("[pdf-worker] loop error", error);
      await sleep(intervalMs);
    }
  }
}

void main();
