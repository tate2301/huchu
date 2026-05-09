/**
 * Backfill BuyerReceipt.companyId.
 *
 * Resolution order (first non-null wins):
 *  1. goldPour.site.companyId  (via legacy goldPourId FK)
 *  2. goldDispatch.goldPour.site.companyId (via legacy goldDispatchId FK)
 *  3. batches[0].goldPour.site.companyId  (via BuyerReceiptBatch join)
 *
 * Run dry-run first:  npx tsx scripts/backfill-buyer-receipt-company-id.ts
 * Apply:              npx tsx scripts/backfill-buyer-receipt-company-id.ts --apply
 *
 * Idempotent: skips rows that already have companyId set.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  const missing = await prisma.buyerReceipt.findMany({
    where: { companyId: null },
    select: {
      id: true,
      goldPourId: true,
      goldDispatchId: true,
      batches: { select: { goldPour: { select: { site: { select: { companyId: true } } } } }, take: 1 },
      goldPour: { select: { site: { select: { companyId: true } } } },
      goldDispatch: { select: { goldPour: { select: { site: { select: { companyId: true } } } } } },
    },
  });

  console.log(`Found ${missing.length} BuyerReceipt rows with null companyId`);

  if (missing.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  const valid: { id: string; companyId: string }[] = [];
  const unresolved: string[] = [];

  for (const r of missing) {
    const companyId =
      r.goldPour?.site?.companyId ??
      r.goldDispatch?.goldPour?.site?.companyId ??
      r.batches[0]?.goldPour?.site?.companyId ??
      null;

    if (companyId) {
      valid.push({ id: r.id, companyId });
    } else {
      unresolved.push(r.id);
    }
  }

  if (unresolved.length > 0) {
    console.warn(
      `WARNING: ${unresolved.length} BuyerReceipt rows cannot be resolved (no pour/dispatch/batch link)`
    );
  }

  console.log(`Will update ${valid.length} rows`);

  if (!apply) {
    console.log("Dry run — pass --apply to write changes");
    return;
  }

  let updated = 0;
  for (const { id, companyId } of valid) {
    await prisma.buyerReceipt.update({ where: { id }, data: { companyId } });
    updated++;
  }

  console.log(`Updated ${updated} BuyerReceipt rows`);
  const remaining = await prisma.buyerReceipt.count({
    where: { companyId: null },
  });
  console.log(`Remaining null companyId: ${remaining}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
