/**
 * Backfill GoldPour.companyId from site.companyId.
 *
 * Run dry-run first:  npx tsx scripts/backfill-gold-pour-company-id.ts
 * Apply:              npx tsx scripts/backfill-gold-pour-company-id.ts --apply
 *
 * Idempotent: skips rows that already have companyId set.
 */

import "dotenv/config";
import { prisma } from "@/lib/prisma";
const apply = process.argv.includes("--apply");

async function main() {
  const missing = await prisma.goldPour.findMany({
    where: { companyId: null },
    select: { id: true, siteId: true },
  });

  console.log(`Found ${missing.length} GoldPour rows with null companyId`);

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

  const updates = missing.map((r) => ({
    id: r.id,
    companyId: siteMap.get(r.siteId),
  }));

  const unmapped = updates.filter((u) => !u.companyId);
  if (unmapped.length > 0) {
    console.warn(
      `WARNING: ${unmapped.length} GoldPour rows have siteId with no matching site`,
    );
  }

  const valid = updates.filter(
    (u): u is { id: string; companyId: string } => !!u.companyId,
  );
  console.log(`Will update ${valid.length} rows`);

  if (!apply) {
    console.log("Dry run — pass --apply to write changes");
    return;
  }

  let updated = 0;
  for (const { id, companyId } of valid) {
    await prisma.goldPour.update({ where: { id }, data: { companyId } });
    updated++;
  }

  console.log(`Updated ${updated} GoldPour rows`);
  const remaining = await prisma.goldPour.count({ where: { companyId: null } });
  console.log(`Remaining null companyId: ${remaining}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
