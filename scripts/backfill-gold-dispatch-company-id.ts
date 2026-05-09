/**
 * Backfill GoldDispatch.companyId from goldPour.site.companyId.
 *
 * Run dry-run first:  npx tsx scripts/backfill-gold-dispatch-company-id.ts
 * Apply:              npx tsx scripts/backfill-gold-dispatch-company-id.ts --apply
 *
 * Idempotent: skips rows that already have companyId set.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  const missing = await prisma.goldDispatch.findMany({
    where: { companyId: null },
    select: {
      id: true,
      goldPour: { select: { site: { select: { companyId: true } } } },
    },
  });

  console.log(`Found ${missing.length} GoldDispatch rows with null companyId`);

  if (missing.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  const valid = missing
    .map((r) => ({ id: r.id, companyId: r.goldPour?.site?.companyId ?? null }))
    .filter(
      (u): u is { id: string; companyId: string } => !!u.companyId
    );

  const unresolved = missing.length - valid.length;
  if (unresolved > 0) {
    console.warn(
      `WARNING: ${unresolved} GoldDispatch rows have no goldPour/site link`
    );
  }

  console.log(`Will update ${valid.length} rows`);

  if (!apply) {
    console.log("Dry run — pass --apply to write changes");
    return;
  }

  let updated = 0;
  for (const { id, companyId } of valid) {
    await prisma.goldDispatch.update({ where: { id }, data: { companyId } });
    updated++;
  }

  console.log(`Updated ${updated} GoldDispatch rows`);
  const remaining = await prisma.goldDispatch.count({
    where: { companyId: null },
  });
  console.log(`Remaining null companyId: ${remaining}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
