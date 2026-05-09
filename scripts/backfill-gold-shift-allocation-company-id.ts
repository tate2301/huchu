/**
 * Backfill GoldShiftAllocation.companyId from site.companyId.
 *
 * Run dry-run first:  npx tsx scripts/backfill-gold-shift-allocation-company-id.ts
 * Apply:              npx tsx scripts/backfill-gold-shift-allocation-company-id.ts --apply
 *
 * Idempotent: skips rows that already have companyId set.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  const missing = await prisma.goldShiftAllocation.findMany({
    where: { companyId: null },
    select: { id: true, siteId: true },
  });

  console.log(
    `Found ${missing.length} GoldShiftAllocation rows with null companyId`
  );

  if (missing.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  const siteIds = [...new Set(missing.map((r) => r.siteId))];
  const sites = await prisma.site.findMany({
    where: { id: { in: siteIds } },
    select: { id: true, companyId: true },
  });
  const siteMap = new Map(sites.map((s) => [s.id, s.companyId]));

  const valid = missing
    .map((r) => ({ id: r.id, companyId: siteMap.get(r.siteId) }))
    .filter(
      (u): u is { id: string; companyId: string } => !!u.companyId
    );

  console.log(`Will update ${valid.length} rows`);

  if (!apply) {
    console.log("Dry run — pass --apply to write changes");
    return;
  }

  let updated = 0;
  for (const { id, companyId } of valid) {
    await prisma.goldShiftAllocation.update({
      where: { id },
      data: { companyId },
    });
    updated++;
  }

  console.log(`Updated ${updated} GoldShiftAllocation rows`);
  const remaining = await prisma.goldShiftAllocation.count({
    where: { companyId: null },
  });
  console.log(`Remaining null companyId: ${remaining}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
