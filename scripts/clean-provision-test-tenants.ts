/**
 * Removes the throwaway tenants `lib/retail/provision.test.ts` left behind.
 *
 *   npx tsx scripts/clean-provision-test-tenants.ts            # report only
 *   npx tsx scripts/clean-provision-test-tenants.ts --apply
 *
 * ## What went wrong
 *
 * The provisioning test creates a company per scenario and deletes it in
 * teardown, with `.catch(() => {})` on the delete. That swallow was written to
 * keep a cleanup failure from turning a green run red — and it hid the fact
 * that the delete **always** failed.
 *
 * R-1.4 gave the retail tables real foreign keys, and `Site` is deliberately
 * `onDelete: Restrict`: a branch with sales against it must not vanish. So
 * `company.delete` refuses on the first provisioned site, the `catch` eats the
 * refusal, and every run leaves its tenants behind. Forty accumulated on a
 * shared database in one afternoon.
 *
 * The second-order damage is what made it visible:
 * `lib/inventory/shelf-price-integrity.test.ts` prices every ranged line in the
 * database through the resolver, in parallel. The ranged set went from about
 * thirty to eighty, the fan-out exhausted the connection pool, and the suite
 * started failing with *timeout exceeded when trying to connect* — an error
 * about the network, caused by test litter.
 *
 * ## The order matters
 *
 * Deleting a company means unwinding what provisioning built, innermost first:
 * price entries, then the price list, then the stock rows, then the locations,
 * then the products, then the registers, then the site, then the accounting
 * scaffolding. Each is a `Restrict` or a required relation that refuses while
 * anything still points at it.
 *
 * ## Narrow on purpose
 *
 * Only slugs matching `provision-<word>-<digits>-<digits>` — the exact shape
 * the test generates. A prefix match alone would be one badly-named real tenant
 * away from deleting a shop. Report by default; `--apply` is the only way
 * anything goes.
 */

import "dotenv/config"

import { prisma } from "@/lib/prisma"

const APPLY = process.argv.includes("--apply")

/** The shape `freshCompany()` generates, and nothing else. */
const TEST_SLUG = /^provision-[a-z]+-\d+-\d+$/

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (/\bprod(uction)?\b/.test(databaseUrl)) {
    throw new Error("DATABASE_URL looks like production. Refusing to delete tenants.")
  }

  const candidates = await prisma.company.findMany({
    where: { slug: { startsWith: "provision-" } },
    select: { id: true, slug: true, name: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })

  const targets = candidates.filter((company) => TEST_SLUG.test(company.slug))
  const skipped = candidates.filter((company) => !TEST_SLUG.test(company.slug))

  if (skipped.length > 0) {
    console.log(`Leaving ${skipped.length} company/companies alone — the slug is not the test shape:`)
    for (const company of skipped) console.log(`  ${company.slug}`)
    console.log("")
  }

  if (targets.length === 0) {
    console.log("No throwaway provisioning tenants. Nothing to do.")
    return
  }

  console.log(`${targets.length} throwaway tenant(s):`)
  for (const company of targets) {
    console.log(`  ${company.slug}  (${company.createdAt.toISOString()})`)
  }

  if (!APPLY) {
    console.log("\nReport only. Re-run with --apply to remove them.")
    return
  }

  let removed = 0
  const stubborn: string[] = []

  for (const company of targets) {
    try {
      await prisma.$transaction(async (tx) => {
        const companyId = company.id

        await tx.productPrice.deleteMany({ where: { companyId } })
        await tx.priceList.deleteMany({ where: { companyId } })

        const sites = await tx.site.findMany({ where: { companyId }, select: { id: true } })
        const siteIds = sites.map((site) => site.id)

        if (siteIds.length > 0) {
          await tx.stockMovement.deleteMany({ where: { item: { siteId: { in: siteIds } } } })
          await tx.inventoryItem.deleteMany({ where: { siteId: { in: siteIds } } })
          await tx.stockLocation.deleteMany({ where: { siteId: { in: siteIds } } })
        }

        await tx.product.deleteMany({ where: { companyId } })
        await tx.retailRegister.deleteMany({ where: { companyId } })
        await tx.site.deleteMany({ where: { companyId } })

        /*
          The accounting scaffolding, and it is far deeper than a chart of
          accounts. `runAccountingSeedPack` writes thirteen models, several of
          which reference each other: tax rules point at templates, template
          lines point at tax codes, posting rules and tender mappings point at
          accounts. Deleting the company refuses on whichever it reaches first,
          and the constraint it names — `TaxRule_templateId_fkey` — says nothing
          about provisioning a shop.

          Ordered innermost first rather than discovered one failed run at a
          time, which is how the first three attempts went.
        */
        await tx.taxRule.deleteMany({ where: { template: { companyId } } })
        await tx.taxTemplateLine.deleteMany({ where: { template: { companyId } } })
        await tx.taxTemplate.deleteMany({ where: { companyId } })
        await tx.taxCode.deleteMany({ where: { companyId } })
        await tx.taxCategory.deleteMany({ where: { companyId } })
        await tx.tenderAccountMapping.deleteMany({ where: { companyId } })
        await tx.postingRule.deleteMany({ where: { companyId } })
        await tx.bankAccount.deleteMany({ where: { companyId } })
        await tx.accountingPeriod.deleteMany({ where: { companyId } })
        await tx.accountingSettings.deleteMany({ where: { companyId } })
        await tx.accountingSeedExecution.deleteMany({ where: { companyId } })
        await tx.currencyRate.deleteMany({ where: { companyId } })
        await tx.currencyDefinition.deleteMany({ where: { companyId } })
        await tx.chartOfAccount.deleteMany({ where: { companyId } })

        // `deleteMany`: an already-removed tenant is a no-op, not a throw.
        await tx.company.deleteMany({ where: { id: companyId } })
      })
      removed += 1
    } catch (error) {
      /*
        The whole message, not its first line. Prisma puts the interesting
        part — the constraint that refused — several lines down, under a
        rendering of the call site. Taking line one printed an empty string
        against every failure and cost a round of guessing.
      */
      const detail =
        error instanceof Error
          ? (error.message.split("\n").find((line) => /constraint|required|violat/i.test(line)) ??
            error.message.split("\n").filter(Boolean).slice(-1)[0] ??
            error.message)
          : String(error)
      stubborn.push(`${company.slug}: ${detail.trim()}`)
    }
  }

  console.log(`\nRemoved ${removed} tenant(s).`)

  if (stubborn.length > 0) {
    console.error(`\n${stubborn.length} would not go:`)
    for (const line of stubborn) console.error(`  ${line}`)
    console.error("\nSomething still points at them that this script does not know about.")
    process.exit(1)
  }

  const left = (
    await prisma.company.findMany({
      where: { slug: { startsWith: "provision-" } },
      select: { slug: true },
    })
  ).filter((company) => TEST_SLUG.test(company.slug))

  if (left.length > 0) {
    console.error(`\n${left.length} survived the delete: ${left.map((c) => c.slug).join(", ")}`)
    process.exit(1)
  }

  console.log("None left.")
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
