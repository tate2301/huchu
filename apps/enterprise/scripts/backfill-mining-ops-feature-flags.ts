/**
 * Repair mining ops feature flags leaked into non-mining companies.
 *
 * The original mine-focused build shipped ops.shift-report.submit,
 * ops.attendance.mark, ops.plant-report.submit (and their reports.* pages)
 * inside ADDON_OPERATIONS_CORE, which every generic template also bundled.
 * The bundle has since been split (ADDON_MINE_DAILY_OPS is gold-mine only),
 * but companies provisioned before the split still carry explicit
 * CompanyFeatureFlag enables for those keys.
 *
 * A company keeps the mining flags only when it is actually a mine:
 *   - workspaceProfile is GOLD_MINE, or
 *   - it has an enabled gold.* feature flag, or
 *   - it has an enabled ADDON_GOLD_CORE / ADDON_MINE_DAILY_OPS addon.
 * Every other company gets the six mining flags flipped to disabled.
 *
 *   npx tsx scripts/backfill-mining-ops-feature-flags.ts          # report only
 *   npx tsx scripts/backfill-mining-ops-feature-flags.ts --apply  # write rows
 *
 * Idempotent: rows are updated in place; re-running is safe.
 */
import "@/scripts/lib/env";

import { prisma } from "@corelithzw/db/client";

const APPLY = process.argv.includes("--apply");

const MINE_DAILY_OPS_FEATURE_KEYS = [
  "ops.shift-report.submit",
  "ops.attendance.mark",
  "ops.plant-report.submit",
  "reports.shift",
  "reports.attendance",
  "reports.plant",
];

const MINING_BUNDLE_CODES = ["ADDON_GOLD_CORE", "ADDON_MINE_DAILY_OPS"];

async function main() {
  console.log(`[backfill] mode=${APPLY ? "APPLY" : "DRY-RUN"}`);

  const companies = await prisma.company.findMany({
    select: { id: true, name: true, slug: true, workspaceProfile: true },
    orderBy: { createdAt: "asc" },
  });

  const [goldFlagRows, miningAddonRows] = await Promise.all([
    prisma.companyFeatureFlag.findMany({
      where: { isEnabled: true, feature: { key: { startsWith: "gold." } } },
      select: { companyId: true },
    }),
    prisma.companySubscriptionAddon.findMany({
      where: { isEnabled: true, bundle: { code: { in: MINING_BUNDLE_CODES } } },
      select: { companyId: true },
    }),
  ]);

  const miningCompanyIds = new Set<string>([
    ...goldFlagRows.map((row) => row.companyId),
    ...miningAddonRows.map((row) => row.companyId),
  ]);

  let scanned = 0;
  let repaired = 0;

  for (const company of companies) {
    const isMine =
      company.workspaceProfile === "GOLD_MINE" || miningCompanyIds.has(company.id);
    if (isMine) continue;

    const leakedFlags = await prisma.companyFeatureFlag.findMany({
      where: {
        companyId: company.id,
        isEnabled: true,
        feature: { key: { in: MINE_DAILY_OPS_FEATURE_KEYS } },
      },
      select: { id: true, feature: { select: { key: true } } },
    });
    scanned += 1;
    if (leakedFlags.length === 0) continue;

    console.log(
      `[backfill] ${company.slug ?? company.id} (${company.name}): disabling ${leakedFlags
        .map((flag) => flag.feature.key)
        .join(", ")}`,
    );

    if (APPLY) {
      await prisma.companyFeatureFlag.updateMany({
        where: { id: { in: leakedFlags.map((flag) => flag.id) } },
        data: {
          isEnabled: false,
          reason: "Mining daily ops removed from non-mining workspaces (bundle split backfill)",
        },
      });
    }
    repaired += 1;
  }

  console.log(
    `[backfill] done. companies scanned=${scanned}, companies ${APPLY ? "repaired" : "needing repair"}=${repaired}`,
  );
}

main()
  .catch((error) => {
    console.error("[backfill] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
