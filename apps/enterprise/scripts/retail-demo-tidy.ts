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
 * S-4 dropped `RetailCatalogItem`, so this reads the range the way everything
 * else does now: a `Product` with a `sku` that matches, and the stock row that
 * claims it. Nothing else about what it does or refuses to do has changed.
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

import "@/scripts/lib/env";

import { prisma } from "@corelithzw/db/client"

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

  const items = await prisma.product.findMany({
    where: { companyId: company.id, code: { in: [...LEFTOVER_SKUS] } },
    select: { id: true, code: true, name: true, barcode: true },
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
    const lines = await prisma.retailSaleLine.count({ where: { productId: item.id } })
    console.log(
      `  ${item.code.padEnd(12)} ${(item.barcode ?? "-").padEnd(14)} ` +
        `${String(lines).padStart(5)} sale line(s)  ${item.name}`,
    )
    if (lines > 0) blocked.push(`${item.code} (${lines} lines)`)
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

  const productIds = items.map((item) => item.id)

  // Order matters. `InventoryItem.productId` is SET NULL and
  // `ProductPrice.productId` cascades, but doing each explicitly means the
  // counts below are real rather than inferred from a cascade nobody watched.
  // The stock rows themselves stay: an `InventoryItem` is a quantity at a site,
  // and unranging a line is not the same as saying the shop never had any.
  const removed = await prisma.$transaction(async (tx) => {
    const unranged = await tx.inventoryItem.updateMany({
      where: { productId: { in: productIds } },
      data: { productId: null },
    })
    const prices = await tx.productPrice.deleteMany({ where: { productId: { in: productIds } } })
    const products = await tx.product.deleteMany({ where: { id: { in: productIds } } })
    return { unranged: unranged.count, prices: prices.count, products: products.count }
  })

  console.log(
    `Removed ${removed.products} product(s) and ${removed.prices} price(s); ` +
      `${removed.unranged} stock row(s) left in place, unranged.`,
  )

  // Read the range back, and prove the collision is gone.
  const remaining = await prisma.product.findMany({
    where: { companyId: company.id, isActive: true, archivedAt: null },
    select: { code: true, barcode: true },
  })
  const seen = new Map<string, string[]>()
  for (const item of remaining) {
    if (!item.barcode) continue
    seen.set(item.barcode, [...(seen.get(item.barcode) ?? []), item.code])
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
