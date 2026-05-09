/**
 * Backfill GoldLedgerEntry.companyId from import.companyId.
 *
 * Run dry-run first:  npx tsx scripts/backfill-gold-ledger-entry-company-id.ts
 * Apply:              npx tsx scripts/backfill-gold-ledger-entry-company-id.ts --apply
 *
 * Idempotent: skips rows that already have companyId set.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  const missing = await prisma.goldLedgerEntry.findMany({
    where: { companyId: null },
    select: {
      id: true,
      importId: true,
      import: { select: { companyId: true } },
    },
  });

  console.log(
    `Found ${missing.length} GoldLedgerEntry rows with null companyId`
  );

  if (missing.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  const valid = missing
    .map((r) => ({ id: r.id, companyId: r.import?.companyId ?? null }))
    .filter(
      (u): u is { id: string; companyId: string } => !!u.companyId
    );

  const unresolved = missing.length - valid.length;
  if (unresolved > 0) {
    console.warn(
      `WARNING: ${unresolved} GoldLedgerEntry rows have no import with companyId`
    );
  }

  console.log(`Will update ${valid.length} rows`);

  if (!apply) {
    console.log("Dry run — pass --apply to write changes");
    return;
  }

  let updated = 0;
  for (const { id, companyId } of valid) {
    await prisma.goldLedgerEntry.update({ where: { id }, data: { companyId } });
    updated++;
  }

  console.log(`Updated ${updated} GoldLedgerEntry rows`);
  const remaining = await prisma.goldLedgerEntry.count({
    where: { companyId: null },
  });
  console.log(`Remaining null companyId: ${remaining}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
