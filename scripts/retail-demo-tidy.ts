/**
 * Removes the leftover grocery lines from the bottle-store demo tenant.
 *
 *   npx tsx scripts/retail-demo-tidy.ts            # report only
 *   npx tsx scripts/retail-demo-tidy.ts --apply
 *
 * `scripts/seed-retail-demo.ts` seeds fifteen liquor SKUs. The demo tenant
 * carries twenty-three, because eight rows from an older generic seed — bread,
 * candles, cooking oil, mealie meal, rice, soap, sugar, tea — were still
 * sitting there when the bottle store was written on top of them.
 *
 * Two reasons they have to go, and the second is the serious one:
 *
 *  1. A Harare bottle store whose range includes mealie meal and bath soap does
 *     not read as a bottle store.
 *  2. **They collide on barcode.** `SOAP-BAR` and `BREAD-STD` both carry
 *     `600000000000`; `COOKOIL-2` and `SUGAR-2` both carry `600000000002`.
 *     Scan one at the till and you may ring up the other. That is why
 *     `Product.barcode` could only be given an index and not a unique
 *     constraint — the constraint would have passed on an empty table and
 *     failed the moment this data was copied across.
 *
 * All eight have **zero sale lines** against them, which is what makes deleting
 * them safe rather than merely tidy: nothing in six months of trade refers to
 * them, so no receipt can be reprinted wrong and no report can lose a row. The
 * fifteen real SKUs have between 113 and 2,531 lines each.
 *
 * This refuses to delete anything with a sale against it, so it cannot be
 * pointed at a real range by accident. Deactivating instead of deleting was the
 * alternative; it was rejected because an inactive row still appears in the
 * catalogue screen, and the point is that the demo's range should look like the
 * shop's range.
 */

import "dotenv/config"

import { prisma } from "@/lib/prisma"

/** The tenant the bottle-store demo runs on. */
const COMPANY_SLUG = "acme"

/**
 * Named explicitly rather than inferred. A rule like "delete anything with no
 * sales" would take out a genuine new line the shop added this morning, and a
 * rule keyed on the placeholder barcode would miss the ones that do not share.
 */
const LEFTOVER_SKUS = [
  "BREAD-STD",
  "CANDLE-6",
  "COOKOIL-2",
  "MEALIE-10",
  "RICE-5",
  "SOAP-BAR",
  "SUGAR-2",
  "TEA-250",
] as const

async function main() {
  const apply = process.argv.includes("--apply")
  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (/\bprod(uction)?\b/.test(databaseUrl)) {
    throw new Error("DATABASE_URL looks like production. Refusing to delete anything.")
  }

  const company = await prisma.company.findFirst({
    where: { slug: COMPANY_SLUG },
    select: { id: true, name: true },
  })
  if (!company) {
    console.error(`No company with slug "${COMPANY_SLUG}".`)
    process.exit(1)
  }

  const items = await prisma.retailCatalogItem.findMany({
    where: { companyId: company.id, sku: { in: [...LEFTOVER_SKUS] } },
    select: { id: true, sku: true, name: true, barcode: true, productId: true },
  })

  if (items.length === 0) {
    console.log(`${company.name}: nothing to remove — the range is already clean.`)
    return
  }

  // Refuse on anything that has traded. A sale line is history; history is not
  // demo data and this script must never be the reason a receipt cannot be
  // reprinted.
  const blocked: string[] = []
  for (const item of items) {
    const lines = await prisma.retailSaleLine.count({ where: { catalogItemId: item.id } })
    console.log(
      `  ${(item.sku ?? "?").padEnd(12)} ${(item.barcode ?? "-").padEnd(14)} ` +
        `${String(lines).padStart(5)} sale line(s)  ${item.name}`,
    )
    if (lines > 0) blocked.push(`${item.sku} (${lines} lines)`)
  }

  if (blocked.length > 0) {
    console.error(
      `\nRefusing to delete. These have traded: ${blocked.join(", ")}. ` +
        `A line with sales against it is history, not seed data.`,
    )
    process.exit(1)
  }

  console.log(`\n${items.length} leftover line(s), none of them traded.`)
  if (!apply) {
    console.log("Report only. Re-run with --apply to remove them.")
    return
  }

  const productIds = items.map((item) => item.productId).filter((id): id is string => Boolean(id))

  // Order matters. `RetailCatalogItem.productId` is SET NULL and
  // `ProductPrice.productId` cascades, but doing it explicitly means the counts
  // below are real rather than inferred from a cascade nobody watched.
  const removed = await prisma.$transaction(async (tx) => {
    const listings = await tx.retailCatalogItem.deleteMany({
      where: { id: { in: items.map((item) => item.id) } },
    })
    const prices = await tx.productPrice.deleteMany({ where: { productId: { in: productIds } } })
    const products = await tx.product.deleteMany({ where: { id: { in: productIds } } })
    return { listings: listings.count, prices: prices.count, products: products.count }
  })

  console.log(
    `Removed ${removed.listings} listing(s), ${removed.prices} price(s), ` +
      `${removed.products} product(s).`,
  )

  // Read the range back, and prove the collision is gone.
  const remaining = await prisma.retailCatalogItem.findMany({
    where: { companyId: company.id },
    select: { sku: true, barcode: true },
  })
  const seen = new Map<string, string[]>()
  for (const item of remaining) {
    if (!item.barcode) continue
    seen.set(item.barcode, [...(seen.get(item.barcode) ?? []), item.sku ?? "?"])
  }
  const collisions = [...seen.entries()].filter(([, skus]) => skus.length > 1)

  console.log(`\n${company.name} now ranges ${remaining.length} line(s).`)
  if (collisions.length > 0) {
    console.error(
      `Still colliding on barcode: ` +
        collisions.map(([code, skus]) => `${code} (${skus.join(", ")})`).join("; "),
    )
    process.exit(1)
  }
  console.log("No two lines share a barcode.")
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
