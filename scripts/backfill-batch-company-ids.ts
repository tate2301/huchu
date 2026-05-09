/**
 * Backfill GoldDispatchBatch.companyId and BuyerReceiptBatch.companyId
 * from their parent dispatch/receipt companyId.
 *
 * Run dry-run first:  npx tsx scripts/backfill-batch-company-ids.ts
 * Apply:              npx tsx scripts/backfill-batch-company-ids.ts --apply
 *
 * Idempotent: skips rows that already have companyId set.
 * Must run AFTER backfill-gold-dispatch-company-id and backfill-buyer-receipt-company-id.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function backfillDispatchBatches() {
  const missing = await prisma.goldDispatchBatch.findMany({
    where: { companyId: null },
    select: {
      id: true,
      dispatch: { select: { companyId: true } },
    },
  });

  console.log(
    `Found ${missing.length} GoldDispatchBatch rows with null companyId`
  );

  const valid = missing
    .map((r) => ({ id: r.id, companyId: r.dispatch?.companyId ?? null }))
    .filter(
      (u): u is { id: string; companyId: string } => !!u.companyId
    );

  const unresolved = missing.length - valid.length;
  if (unresolved > 0) {
    console.warn(
      `WARNING: ${unresolved} GoldDispatchBatch rows have dispatch with null companyId — run dispatch backfill first`
    );
  }

  console.log(`GoldDispatchBatch: will update ${valid.length} rows`);

  if (!apply) return valid.length;

  let updated = 0;
  for (const { id, companyId } of valid) {
    await prisma.goldDispatchBatch.update({ where: { id }, data: { companyId } });
    updated++;
  }
  console.log(`Updated ${updated} GoldDispatchBatch rows`);
  return updated;
}

async function backfillReceiptBatches() {
  const missing = await prisma.buyerReceiptBatch.findMany({
    where: { companyId: null },
    select: {
      id: true,
      buyerReceipt: { select: { companyId: true } },
    },
  });

  console.log(
    `Found ${missing.length} BuyerReceiptBatch rows with null companyId`
  );

  const valid = missing
    .map((r) => ({ id: r.id, companyId: r.buyerReceipt?.companyId ?? null }))
    .filter(
      (u): u is { id: string; companyId: string } => !!u.companyId
    );

  const unresolved = missing.length - valid.length;
  if (unresolved > 0) {
    console.warn(
      `WARNING: ${unresolved} BuyerReceiptBatch rows have receipt with null companyId — run receipt backfill first`
    );
  }

  console.log(`BuyerReceiptBatch: will update ${valid.length} rows`);

  if (!apply) return valid.length;

  let updated = 0;
  for (const { id, companyId } of valid) {
    await prisma.buyerReceiptBatch.update({ where: { id }, data: { companyId } });
    updated++;
  }
  console.log(`Updated ${updated} BuyerReceiptBatch rows`);
  return updated;
}

async function main() {
  await backfillDispatchBatches();
  await backfillReceiptBatches();

  if (!apply) {
    console.log("Dry run — pass --apply to write changes");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
