import "@/scripts/lib/env";

import { prisma } from "@corelithzw/db/client";
import { provisionRetail, retailTradingBlockers } from "@corelithzw/module-sell/provision";

/**
 * Open a shop on a tenant that has already been provisioned as a company.
 *
 *   pnpm tsx scripts/provision-retail.ts --company-id <uuid>
 *                                        [--site-code MAIN] [--site-name "Main Branch"]
 *                                        [--register-name "Till 1"] [--starter-range]
 *                                        [--check] [--dry-run]
 *
 * R-5.1. Applying `TEMPLATE_RETAIL` now calls `provisionRetail` itself, so this
 * exists for the tenants that were provisioned before it did — and for the
 * support case, which is the more common one: somebody says their cashier
 * cannot open a till, and `--check` answers why in one command without writing
 * anything.
 *
 * Idempotent: re-running adds what is missing and leaves everything else alone,
 * including a default register the shop has since chosen for itself.
 */

function parseArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

async function main() {
  const companyId = parseArg("--company-id");
  if (!companyId) {
    console.error("--company-id is required");
    process.exitCode = 1;
    return;
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, slug: true },
  });
  if (!company) {
    console.error(`No company with id ${companyId}`);
    process.exitCode = 1;
    return;
  }

  console.log(`${company.name} (${company.slug})`);

  /* ── Report only ─────────────────────────────────────────────────────── */

  if (hasFlag("--check") || hasFlag("--dry-run")) {
    const blockers = await retailTradingBlockers(companyId);
    if (blockers.length === 0) {
      console.log("\nThis shop can trade. Nothing stands between it and a sale.");
      return;
    }
    console.log(`\n${blockers.length} thing(s) stand between this shop and a sale:`);
    for (const blocker of blockers) console.log(`  - ${blocker}`);
    console.log("\nRe-run without --check to fix what provisioning can fix.");
    return;
  }

  /* ── Open the shop ───────────────────────────────────────────────────── */

  const result = await provisionRetail({
    companyId,
    siteCode: parseArg("--site-code"),
    siteName: parseArg("--site-name"),
    registerName: parseArg("--register-name"),
    registerCode: parseArg("--register-code"),
    starterRange: hasFlag("--starter-range"),
  });

  const was = (created: boolean) => (created ? "created" : "already there");
  console.log(`\n  branch    ${result.site.code} — ${result.site.name} (${was(result.site.created)})`);
  console.log(`  location  ${result.location.code} (${was(result.location.created)})`);
  console.log(`  till      ${result.register.code} — ${result.register.name} (${was(result.register.created)})`);
  console.log(`  defaults  ${result.setupProfileWritten ? "written" : "left as the shop set them"}`);
  console.log(
    `  ledger    ${result.accounting.accountsCreated} account(s), ` +
      `${result.accounting.taxCodesCreated} tax code(s), ` +
      `${result.accounting.postingRulesCreated} posting rule(s) created`,
  );
  if (result.productsRanged > 0) {
    console.log(`  range     ${result.productsRanged} starter line(s) ranged`);
  }

  /*
    The blockers are read back out of the database, not inferred from what the
    run above thinks it did. A shop handed over unable to trade should be told
    so here rather than at a counter.
  */
  if (result.blockers.length === 0) {
    console.log("\nThis shop can trade.");
    return;
  }

  console.log(`\nStill standing between this shop and a sale:`);
  for (const blocker of result.blockers) console.log(`  - ${blocker}`);
  console.log(
    "\nProvisioning does not decide what a shop sells. Add a catalogue item, or " +
      "re-run with --starter-range for a small Zimbabwean bottle-store range.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
