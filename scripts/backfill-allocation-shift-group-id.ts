/**
 * Backfill GoldShiftAllocation.shiftGroupId from ShiftReport.shiftGroupId.
 *
 * Run after migration 20260510000001_add_shift_group_id_to_allocation.
 *
 *   npx tsx scripts/backfill-allocation-shift-group-id.ts          # dry-run
 *   npx tsx scripts/backfill-allocation-shift-group-id.ts --apply  # write rows
 *
 * Idempotent: only touches rows where shiftGroupId IS NULL.
 */
import "dotenv/config";

import { prisma } from "@/lib/prisma";

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`[backfill] mode=${APPLY ? "APPLY" : "DRY-RUN"}`);

  const allocations = await prisma.goldShiftAllocation.findMany({
    where: { shiftGroupId: null },
    select: {
      id: true,
      shiftReport: { select: { shiftGroupId: true } },
    },
  });

  let updated = 0;
  let skippedNoGroup = 0;

  for (const a of allocations) {
    const sgId = a.shiftReport?.shiftGroupId;
    if (!sgId) {
      skippedNoGroup += 1;
      continue;
    }
    if (APPLY) {
      await prisma.goldShiftAllocation.update({
        where: { id: a.id },
        data: { shiftGroupId: sgId },
      });
    }
    updated += 1;
  }

  console.log("[backfill] allocations inspected:", allocations.length);
  console.log(APPLY ? "[backfill] rows updated:" : "[backfill] rows would update:", updated);
  console.log("[backfill] skipped (ShiftReport.shiftGroupId is null):", skippedNoGroup);
  if (!APPLY) {
    console.log("[backfill] DRY-RUN — re-run with --apply to write.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
