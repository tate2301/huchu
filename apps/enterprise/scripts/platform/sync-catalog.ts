/**
 * Sync the code-defined commercial catalog (features, bundles, tiers) into
 * the database. Idempotent upserts; safe to re-run after any deploy that
 * changes lib/platform/feature-catalog.ts.
 *
 *   npx tsx scripts/platform/sync-catalog.ts
 */
import { syncCommercialCatalog } from "./domain/commercial-service";
import { disconnectPrisma } from "./prisma";

async function main() {
  const result = await syncCommercialCatalog();
  console.log("[catalog:sync]", JSON.stringify(result, null, 2));
}

void main()
  .catch((error) => {
    console.error("[catalog:sync] failed:", error);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
