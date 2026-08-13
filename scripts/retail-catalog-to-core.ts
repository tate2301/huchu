/**
 * S-4a — populate core `Product` / `PriceList` / `ProductPrice` from
 * `RetailCatalogItem`. Data only, additive, reversible.
 *
 *   npx tsx scripts/retail-catalog-to-core.ts            # report only, writes nothing
 *   npx tsx scripts/retail-catalog-to-core.ts --apply    # write
 *
 * `docs/retail/retail-stock-consolidation-plan-2026-08-13.md` §1.1 and §1.2 make
 * core the single author of a shelf price and the single item master. §0.1
 * measured the gap: retail has **never once** referenced `Product`, `PriceList`
 * or `ProductPrice`, and `RetailCatalogItem.productId` exists as a column that no
 * code has ever written. The bottle store has no `Product` rows at all. So before
 * anything can read a price out of core, core has to hold the data.
 *
 * ## What this is not
 *
 * It does not change how a price is *resolved*. After this runs the till still
 * reads `RetailCatalogItem.unitPrice` exactly as it did this morning, and no sale
 * line is repointed and no column is dropped. What changes is that core now holds
 * the same prices, and `lib/inventory/retail-price-parity.test.ts` asserts the two
 * agree — which is the only thing that makes flipping the read path in the next
 * ticket defensible. A cutover with nothing proving the old and new answers match
 * is a cutover you find out about at the counter.
 *
 * Everything it writes is additive: new `Product`, `PriceList` and `ProductPrice`
 * rows, and three previously-null foreign keys (`RetailCatalogItem.productId`,
 * `InventoryItem.productId`). Reversing it is deleting what it created.
 *
 * ## Idempotent, by natural key
 *
 * `Product` keys on `@@unique([companyId, code])`, `PriceList` on
 * `@@unique([companyId, name])`, `ProductPrice` on
 * `@@unique([priceListId, productId, minQuantity])`. Every write is preceded by a
 * comparison against what is already there, so a second run reports
 * `unchanged` for everything and issues no `UPDATE` at all — not "writes the same
 * values again", which looks identical in a count and is not the same claim.
 *
 * Money is compared with `Prisma.Decimal.equals`, never `===` on a float and
 * never an epsilon. `lib/money.ts` exists to retire those.
 *
 * ## Refuses rather than half-applies
 *
 * Every ambiguity is counted before a single row is written, and the whole
 * migration runs in one transaction across all tenants. The checks are listed in
 * `preflight()`; each one is a case where this script would otherwise have to
 * guess which of two rows a human meant.
 */

import "dotenv/config"

import { Prisma } from "@prisma/client"

import { money, moneyOrNull, percent, resolveBaseCurrency } from "@/lib/money"
import { prisma } from "@/lib/prisma"

/** The name a shop would recognise on the list its shelf prices come from. */
const PRICE_LIST_NAME = "Shelf prices"

/**
 * The shelf price is what the customer pays — VAT at 15% is already inside it.
 * That is what `taxInclusive` records, and it is why the figure this script
 * copies into `ProductPrice.unitPrice` is `RetailCatalogItem.unitPrice`
 * unmodified rather than an ex-VAT number derived from it.
 */
const TAX_INCLUSIVE = true

/** One entry per product. Volume breaks are a merchandising decision, not a migration's. */
const MIN_QUANTITY = new Prisma.Decimal(1)

// ---------------------------------------------------------------------------
// The retail profile
// ---------------------------------------------------------------------------

/**
 * Age restriction, decided from the seeded names in the database and nothing
 * else.
 *
 * Two layers, because the range needs both:
 *
 *  1. **Category words**, which is the durable half — `lager`, `whisky`, `gin`,
 *     `cabernet`, `scud` and so on. A shop that adds "Bells Whisky 750ml"
 *     tomorrow is caught without anybody editing this list.
 *  2. **Brands whose name carries no category word.** `Amarula Cream 750ml`,
 *     `Johnnie Walker Black 750ml`, `Bohlinger's 330ml`, `Hunter's Gold 330ml`
 *     and `Savanna Dry 330ml` say nothing about what is in the bottle. There is
 *     no signal in the data other than the name — `category` is `CONSUMABLES`
 *     for every row, `unit` is "bottle" for Coca-Cola as well as for gin — so a
 *     brand list is the only honest way to reach them.
 *
 * Matched on word boundaries, case-insensitively. That matters more than it
 * looks: a bare substring match on `gin` restricts *ginger* beer, and on `ale`
 * it restricts ginger *ale*, which is a soft drink. `ale`/`stout` are left out
 * of the category list for that reason — nothing in the range needs them and
 * both are one plausible product name away from a false positive that would put
 * an ID prompt on a child's cooldrink.
 *
 * The classification of every row is printed on every run, so this is auditable
 * rather than trusted.
 */
const ALCOHOL_CATEGORY_WORDS = [
  "lager",
  "beer",
  "cider",
  "wine",
  "whisky",
  "whiskey",
  "bourbon",
  "gin",
  "vodka",
  "rum",
  "brandy",
  "tequila",
  "liqueur",
  "cabernet",
  "merlot",
  "shiraz",
  "chardonnay",
  "sauvignon",
  "pinotage",
  "chibuku",
  "scud",
] as const

const ALCOHOL_BRANDS = [
  "amarula",
  "bohlinger",
  "hunter's gold",
  "hunters gold",
  "johnnie walker",
  "savanna",
] as const

function isAlcohol(name: string): boolean {
  const haystack = name.toLowerCase()
  const word = (term: string) =>
    new RegExp(`(^|[^a-z])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z])`).test(haystack)
  return ALCOHOL_CATEGORY_WORDS.some(word) || ALCOHOL_BRANDS.some(word)
}

/**
 * `returnable` and `depositAmount` are deliberately **not** set.
 *
 * A Chibuku scud coming back and the empty being worth money is ordinary
 * Zimbabwean bottle-store trade, and it is exactly what those two columns were
 * added for. It is also not in this database. There is no deposit figure
 * anywhere in `RetailCatalogItem`, `InventoryItem` or the seed: every
 * `description` is null, every `compareAtPrice` on the liquor range is null, and
 * `unit` reads "bottle" for Coca-Cola 500ml and Gordon's Gin alike, so it carries
 * no signal about a returnable glass bottle either. The one Chibuku line the seed
 * has is `unit: "carton"`.
 *
 * Inventing a deposit would put a number on a receipt that the shop never agreed
 * to charge, and inventing `returnable: true` without an amount would put an
 * empties prompt on the counter for a line nobody takes back. Both stay at their
 * schema defaults (`false` / null) until a human sets them, and — because they
 * are not derived here — this script also never *overwrites* them on a re-run.
 */
const RETURNABLE_NOTE =
  "returnable/depositAmount left at their defaults: no deposit or empties data exists in " +
  "RetailCatalogItem, InventoryItem or the seed, and this script does not invent money."

// ---------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------

type Tally = { created: number; updated: number; unchanged: number }

const tally = (): Tally => ({ created: 0, updated: 0, unchanged: 0 })

function totalOf(t: Tally) {
  return t.created + t.updated + t.unchanged
}

function line(label: string, t: Tally) {
  return `    ${label.padEnd(16)} ${String(t.created).padStart(3)} created  ${String(
    t.updated,
  ).padStart(3)} updated  ${String(t.unchanged).padStart(3)} unchanged`
}

type CompanyReport = {
  companyId: string
  slug: string
  name: string
  currency: string
  products: Tally
  priceLists: Tally
  prices: Tally
  catalogueLinks: Tally
  inventoryLinks: Tally
  ageRestricted: number
  rows: number
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

type Loaded = Awaited<ReturnType<typeof loadCatalogue>>
type CatalogueRow = Loaded["rows"][number]
type StockRow = NonNullable<ReturnType<Loaded["stock"]["get"]>>

/**
 * The catalogue, and the stock rows it points at — fetched **separately** and
 * joined in memory rather than with an `include`.
 *
 * `RetailCatalogItem.inventoryItemId` is `NOT NULL` and the relation is required,
 * so Prisma would throw "Field inventoryItem is required to return data, got null
 * instead" on the whole query if a single row pointed at a deleted stock row —
 * and the point of this script's preflight is to *name* those rows, not to die on
 * the first one. R-1.4 added the foreign key that should make it impossible; the
 * check stays because "should be impossible" is not a migration guarantee.
 */
async function loadCatalogue() {
  const rows = await prisma.retailCatalogItem.findMany({
    orderBy: [{ companyId: "asc" }, { sku: "asc" }],
    select: {
      id: true,
      companyId: true,
      catalogCode: true,
      sku: true,
      name: true,
      barcode: true,
      unitPrice: true,
      taxPercent: true,
      status: true,
      productId: true,
      inventoryItemId: true,
      company: { select: { id: true, slug: true, name: true } },
    },
  })

  const stockRows = await prisma.inventoryItem.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.inventoryItemId))] } },
    select: {
      id: true,
      unitCost: true,
      productId: true,
      site: { select: { companyId: true } },
    },
  })

  return { rows, stock: new Map(stockRows.map((item) => [item.id, item])) }
}

/** `sku` is the till's identifier; `catalogCode` is the fallback the schema guarantees. */
function deriveCode(row: { sku: string; catalogCode: string }): string {
  return row.sku.trim() || row.catalogCode.trim()
}

// ---------------------------------------------------------------------------
// Refuse before writing
// ---------------------------------------------------------------------------

/**
 * Everything that would make the migration guess, counted before it starts.
 *
 * Returns blocking problems. Non-blocking observations are printed here and
 * returned to nobody — `barcode` collisions are the known case: the column is
 * indexed and not unique precisely so they do not block this backfill, but
 * copying them into `Product` silently would hide a real data problem in the
 * seed, so they are named.
 */
async function preflight(rows: readonly CatalogueRow[], stock: ReadonlyMap<string, StockRow>) {
  const blocking: string[] = []

  // ---- The schema this ticket depends on is actually in the database --------
  const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE (table_name = 'Product'
             AND column_name IN ('barcode', 'ageRestricted', 'returnable', 'depositAmount'))
       OR (table_name = 'PriceList' AND column_name = 'taxInclusive')
       OR (table_name = 'RetailCatalogItem' AND column_name = 'productId')
       OR (table_name = 'InventoryItem' AND column_name = 'productId')
  `
  const present = new Set(columns.map((c) => `${c.table_name}.${c.column_name}`))
  for (const required of [
    "Product.barcode",
    "Product.ageRestricted",
    "Product.returnable",
    "Product.depositAmount",
    "PriceList.taxInclusive",
    "RetailCatalogItem.productId",
    "InventoryItem.productId",
  ]) {
    if (!present.has(required)) blocking.push(`"${required}" does not exist in this database`)
  }

  const kinds = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
    SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PriceListKind'
  `
  if (!kinds.some((k) => k.enumlabel === "RETAIL")) {
    blocking.push("PriceListKind has no RETAIL label — run scripts/retail-price-engine-schema.ts")
  }

  // ---- The rows themselves ---------------------------------------------------
  const seen = new Map<string, string[]>()
  for (const row of rows) {
    const code = deriveCode(row)
    if (!code) {
      blocking.push(`catalogue row ${row.id} derives an empty code from sku/catalogCode`)
      continue
    }
    const key = `${row.companyId} ${code}`
    seen.set(key, [...(seen.get(key) ?? []), `${row.company.slug}/${row.sku}`])
  }
  for (const [key, members] of seen) {
    if (members.length > 1) {
      blocking.push(
        `${members.length} catalogue rows derive the same (companyId, code) "${key.split(" ")[1]}": ` +
          members.join(", "),
      )
    }
  }

  for (const row of rows) {
    const label = `${row.company.slug}/${row.sku}`
    const item = stock.get(row.inventoryItemId)

    // A row pointing at nothing has no cost price and no stock row to link, and
    // quietly skipping it would leave a product core cannot value.
    if (!item) {
      blocking.push(`${label}: inventoryItemId ${row.inventoryItemId} points at no InventoryItem`)
      continue
    }
    if (item.site.companyId !== row.companyId) {
      blocking.push(`${label}: its InventoryItem belongs to another company`)
    }
    // `InventoryItem.productId` already naming someone else is only ambiguous if
    // it is not the product this row is about to (re)create. A second run leaves
    // it pointing exactly where the first run put it.
    if (item.productId && item.productId !== row.productId) {
      blocking.push(
        `${label}: InventoryItem ${item.id} is already linked to product ${item.productId}, ` +
          "which is not the product this catalogue row names",
      )
    }
  }

  // An InventoryItem sold under two catalogue codes cannot carry one productId.
  const byInventoryItem = new Map<string, string[]>()
  for (const row of rows) {
    byInventoryItem.set(row.inventoryItemId, [
      ...(byInventoryItem.get(row.inventoryItemId) ?? []),
      `${row.company.slug}/${row.sku}`,
    ])
  }
  for (const [itemId, members] of byInventoryItem) {
    if (members.length > 1) {
      blocking.push(
        `InventoryItem ${itemId} is sold under ${members.length} catalogue codes ` +
          `(${members.join(", ")}); InventoryItem.productId can only name one`,
      )
    }
  }

  // An existing product on the target code that some *other* catalogue row has
  // already claimed. Rare, but it would silently merge two listings into one.
  const existing = await prisma.product.findMany({
    where: {
      OR: [...new Set(rows.map((row) => row.companyId))].map((companyId) => ({
        companyId,
        code: { in: rows.filter((row) => row.companyId === companyId).map(deriveCode) },
      })),
    },
    select: { id: true, companyId: true, code: true, retailListings: { select: { id: true } } },
  })
  for (const product of existing) {
    const mine = rows.filter(
      (row) => row.companyId === product.companyId && deriveCode(row) === product.code,
    )
    const foreign = product.retailListings.filter(
      (listing) => !mine.some((row) => row.id === listing.id),
    )
    if (foreign.length > 0) {
      blocking.push(
        `Product ${product.code} in company ${product.companyId} is already the product for ` +
          `${foreign.length} other catalogue row(s)`,
      )
    }
  }

  // ---- Observations. Reported, never acted on --------------------------------
  const collisions = await prisma.$queryRaw<
    Array<{ slug: string; barcode: string; n: bigint; names: string }>
  >`
    SELECT c.slug, r.barcode, COUNT(*) AS n, string_agg(r.name, ' + ' ORDER BY r.name) AS names
    FROM "RetailCatalogItem" r JOIN "Company" c ON c.id = r."companyId"
    WHERE r.barcode IS NOT NULL AND btrim(r.barcode) <> ''
    GROUP BY 1, 2 HAVING COUNT(*) > 1
    ORDER BY 1, 2
  `
  if (collisions.length > 0) {
    const rowCount = collisions.reduce((sum, c) => sum + Number(c.n), 0)
    console.log(
      `\nBarcode collisions: ${collisions.length} (companyId, barcode) pair(s) over ` +
        `${rowCount} catalogue row(s). Copied across as-is — \`Product.barcode\` is indexed and ` +
        `deliberately not unique, so these do not block the backfill, and silently renumbering a ` +
        `barcode would hide a scanner that rings up the wrong item.`,
    )
    for (const c of collisions) {
      console.log(`  ${c.slug.padEnd(14)} ${c.barcode}  ×${Number(c.n)}  ${c.names}`)
    }
  }

  return blocking
}

// ---------------------------------------------------------------------------
// The migration
// ---------------------------------------------------------------------------

async function main() {
  const apply = process.argv.includes("--apply")
  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (/\bprod(uction)?\b/.test(databaseUrl)) {
    throw new Error("DATABASE_URL looks like production. Refusing to write.")
  }

  const { rows, stock } = await loadCatalogue()
  if (rows.length === 0) {
    console.log("No RetailCatalogItem rows in this database. Nothing to migrate.")
    return
  }

  const companyIds = [...new Set(rows.map((row) => row.companyId))]
  console.log(
    `${rows.length} catalogue row(s) across ${companyIds.length} compan${
      companyIds.length === 1 ? "y" : "ies"
    }.`,
  )

  const blocking = await preflight(rows, stock)
  if (blocking.length > 0) {
    console.error(
      `\nRefusing to migrate. ${blocking.length} thing(s) would make this ambiguous:\n  ` +
        blocking.join("\n  ") +
        `\n\nNothing has been written. Migrating the rows that happen to be unambiguous and ` +
        `skipping the rest leaves core holding a catalogue nobody can reconcile against retail.`,
    )
    process.exit(1)
  }

  // Currency is resolved outside the transaction: `resolveBaseCurrency` reads
  // `AccountingSettings` on the global client and would otherwise read from a
  // connection the transaction does not hold.
  //
  // `RetailCatalogItem` has no currency column of its own — the catalogue is
  // denominated in whatever the company keeps its books in, which is what the
  // till already assumes and what `lib/money.ts` already knows how to answer.
  const currencyByCompany = new Map<string, string>()
  for (const companyId of companyIds) {
    currencyByCompany.set(companyId, await resolveBaseCurrency(companyId))
  }

  const reports: CompanyReport[] = []

  const run = async (tx: Prisma.TransactionClient) => {
    for (const companyId of companyIds) {
      const companyRows = rows.filter((row) => row.companyId === companyId)
      const company = companyRows[0].company
      const currency = currencyByCompany.get(companyId) ?? "USD"

      const report: CompanyReport = {
        companyId,
        slug: company.slug,
        name: company.name,
        currency,
        products: tally(),
        priceLists: tally(),
        prices: tally(),
        catalogueLinks: tally(),
        inventoryLinks: tally(),
        ageRestricted: 0,
        rows: companyRows.length,
      }

      // ---- The shelf-price list ---------------------------------------------
      const existingList = await tx.priceList.findUnique({
        where: { companyId_name: { companyId, name: PRICE_LIST_NAME } },
      })

      let priceListId: string
      if (!existingList) {
        // Default only where the company has none. Stealing the default from a
        // list a tenant already relies on would reprice every other module.
        const otherDefault = await tx.priceList.count({ where: { companyId, isDefault: true } })
        const created = await tx.priceList.create({
          data: {
            companyId,
            name: PRICE_LIST_NAME,
            kind: "RETAIL",
            taxInclusive: TAX_INCLUSIVE,
            isDefault: otherDefault === 0,
            currency,
            isActive: true,
          },
        })
        priceListId = created.id
        report.priceLists.created += 1
      } else {
        priceListId = existingList.id
        // `isDefault` is deliberately absent: whether this list is the default is
        // a decision that may have been changed by a human since, and re-asserting
        // it on every run would undo them.
        const changes: Prisma.PriceListUpdateInput = {}
        if (existingList.kind !== "RETAIL") changes.kind = "RETAIL"
        if (existingList.taxInclusive !== TAX_INCLUSIVE) changes.taxInclusive = TAX_INCLUSIVE
        if (existingList.currency !== currency) changes.currency = currency
        if (!existingList.isActive) changes.isActive = true

        if (Object.keys(changes).length > 0) {
          await tx.priceList.update({ where: { id: priceListId }, data: changes })
          report.priceLists.updated += 1
        } else {
          report.priceLists.unchanged += 1
        }
      }

      // ---- A product per listing ---------------------------------------------
      for (const row of companyRows) {
        const code = deriveCode(row)
        const shelfPrice = money(row.unitPrice)
        const taxRate = percent(row.taxPercent)
        const inventoryItem = stock.get(row.inventoryItemId)
        const costPrice = moneyOrNull(inventoryItem?.unitCost ?? null)
        const ageRestricted = isAlcohol(row.name)
        const isActive = row.status === "ACTIVE"
        if (ageRestricted) report.ageRestricted += 1

        const existingProduct = await tx.product.findUnique({
          where: { companyId_code: { companyId, code } },
        })

        let productId: string
        if (!existingProduct) {
          // `returnable` and `depositAmount` are omitted, not set to false/null:
          // see RETURNABLE_NOTE. They take their schema defaults.
          const created = await tx.product.create({
            data: {
              companyId,
              code,
              name: row.name,
              kind: "GOODS",
              barcode: row.barcode,
              standardPrice: shelfPrice,
              costPrice,
              defaultTaxRate: taxRate,
              currency,
              ageRestricted,
              isActive,
            },
          })
          productId = created.id
          report.products.created += 1
        } else {
          productId = existingProduct.id
          const changes: Prisma.ProductUpdateInput = {}
          if (existingProduct.name !== row.name) changes.name = row.name
          if ((existingProduct.barcode ?? null) !== (row.barcode ?? null)) {
            changes.barcode = row.barcode
          }
          if (!existingProduct.standardPrice.equals(shelfPrice)) changes.standardPrice = shelfPrice
          if (!existingProduct.defaultTaxRate.equals(taxRate)) changes.defaultTaxRate = taxRate
          if (
            costPrice === null
              ? existingProduct.costPrice !== null
              : existingProduct.costPrice === null || !existingProduct.costPrice.equals(costPrice)
          ) {
            changes.costPrice = costPrice
          }
          if (existingProduct.currency !== currency) changes.currency = currency
          if (existingProduct.ageRestricted !== ageRestricted) changes.ageRestricted = ageRestricted
          if (existingProduct.isActive !== isActive) changes.isActive = isActive

          if (Object.keys(changes).length > 0) {
            await tx.product.update({ where: { id: productId }, data: changes })
            report.products.updated += 1
          } else {
            report.products.unchanged += 1
          }
        }

        // ---- The three rows point at each other ------------------------------
        if (row.productId !== productId) {
          await tx.retailCatalogItem.update({ where: { id: row.id }, data: { productId } })
          report.catalogueLinks[row.productId ? "updated" : "created"] += 1
        } else {
          report.catalogueLinks.unchanged += 1
        }

        if (inventoryItem && inventoryItem.productId !== productId) {
          await tx.inventoryItem.update({ where: { id: inventoryItem.id }, data: { productId } })
          report.inventoryLinks[inventoryItem.productId ? "updated" : "created"] += 1
        } else if (inventoryItem) {
          report.inventoryLinks.unchanged += 1
        }

        // ---- The price on the list -------------------------------------------
        const existingPrice = await tx.productPrice.findUnique({
          where: {
            priceListId_productId_minQuantity: {
              priceListId,
              productId,
              minQuantity: MIN_QUANTITY,
            },
          },
        })
        if (!existingPrice) {
          await tx.productPrice.create({
            data: {
              companyId,
              priceListId,
              productId,
              minQuantity: MIN_QUANTITY,
              unitPrice: shelfPrice,
            },
          })
          report.prices.created += 1
        } else if (!existingPrice.unitPrice.equals(shelfPrice)) {
          await tx.productPrice.update({
            where: { id: existingPrice.id },
            data: { unitPrice: shelfPrice },
          })
          report.prices.updated += 1
        } else {
          report.prices.unchanged += 1
        }
      }

      reports.push(report)
    }
  }

  if (apply) {
    // One transaction across every tenant. A migration that leaves one company's
    // catalogue in core and another's out is a state nobody can describe, and the
    // whole point of S-4a is that the parity test can be trusted afterwards.
    await prisma.$transaction(run, { timeout: 120_000, maxWait: 20_000 })
  } else {
    // Dry run: the same code, on a transaction that is thrown away. Counting a
    // migration by re-implementing it is how the count and the migration drift.
    await prisma
      .$transaction(
        async (tx) => {
          await run(tx)
          throw new DryRun()
        },
        { timeout: 120_000, maxWait: 20_000 },
      )
      .catch((error: unknown) => {
        if (!(error instanceof DryRun)) throw error
      })
  }

  // ---- Report ---------------------------------------------------------------
  console.log(`\n${apply ? "Applied" : "Would apply"}:`)
  for (const report of reports) {
    console.log(
      `\n  ${report.name} (${report.slug}) — ${report.rows} catalogue row(s), ${report.currency}, ` +
        `${report.ageRestricted} age-restricted`,
    )
    console.log(line("Product", report.products))
    console.log(line("PriceList", report.priceLists))
    console.log(line("ProductPrice", report.prices))
    console.log(line("catalogue link", report.catalogueLinks))
    console.log(line("stock link", report.inventoryLinks))
  }

  const totals = { products: tally(), priceLists: tally(), prices: tally() }
  for (const report of reports) {
    for (const key of ["created", "updated", "unchanged"] as const) {
      totals.products[key] += report.products[key]
      totals.priceLists[key] += report.priceLists[key]
      totals.prices[key] += report.prices[key]
    }
  }
  console.log("\n  All tenants")
  console.log(line("Product", totals.products))
  console.log(line("PriceList", totals.priceLists))
  console.log(line("ProductPrice", totals.prices))

  const changed =
    totals.products.created +
    totals.products.updated +
    totals.priceLists.created +
    totals.priceLists.updated +
    totals.prices.created +
    totals.prices.updated +
    reports.reduce(
      (sum, r) =>
        sum +
        r.catalogueLinks.created +
        r.catalogueLinks.updated +
        r.inventoryLinks.created +
        r.inventoryLinks.updated,
      0,
    )
  console.log(`\n  ${changed} row(s) ${apply ? "written" : "would be written"}.`)

  // ---- The age-restriction decision, in full, every run ----------------------
  console.log("\nAge restriction, as classified:")
  for (const report of reports) {
    const companyRows = rows.filter((row) => row.companyId === report.companyId)
    for (const row of companyRows) {
      console.log(
        `  ${(isAlcohol(row.name) ? "18+" : "   ").padEnd(4)}${report.slug.padEnd(14)}${row.name}`,
      )
    }
  }
  console.log(`\n${RETURNABLE_NOTE}`)

  if (!apply) {
    console.log("\nReport only. Nothing was written. Re-run with --apply.")
    return
  }

  // ---- Read it back out of the database, not out of the counters -------------
  const bad: string[] = []
  const unlinked = await prisma.retailCatalogItem.count({ where: { productId: null } })
  if (unlinked > 0) bad.push(`${unlinked} catalogue row(s) still have no productId`)

  for (const companyId of companyIds) {
    const list = await prisma.priceList.findUnique({
      where: { companyId_name: { companyId, name: PRICE_LIST_NAME } },
      select: { id: true, kind: true, taxInclusive: true, isActive: true },
    })
    if (!list) {
      bad.push(`company ${companyId} has no "${PRICE_LIST_NAME}" list`)
      continue
    }
    if (list.kind !== "RETAIL") bad.push(`company ${companyId}: list kind is ${list.kind}`)
    if (!list.taxInclusive) bad.push(`company ${companyId}: list is not taxInclusive`)
    if (!list.isActive) bad.push(`company ${companyId}: list is inactive`)

    const expected = rows.filter((row) => row.companyId === companyId).length
    const priced = await prisma.productPrice.count({ where: { priceListId: list.id } })
    if (priced !== expected) {
      bad.push(`company ${companyId}: ${priced} price(s) on the list, expected ${expected}`)
    }
  }

  // The claim this whole ticket exists to make: core and retail agree, exactly.
  const drifted = await prisma.$queryRaw<Array<{ slug: string; sku: string; a: string; b: string }>>`
    SELECT c.slug, r.sku, pp."unitPrice"::text AS a, r."unitPrice"::text AS b
    FROM "RetailCatalogItem" r
    JOIN "Company" c ON c.id = r."companyId"
    JOIN "ProductPrice" pp ON pp."productId" = r."productId"
    JOIN "PriceList" pl ON pl.id = pp."priceListId" AND pl."companyId" = r."companyId"
    WHERE pl.name = ${PRICE_LIST_NAME} AND pp."unitPrice" <> r."unitPrice"
  `
  for (const row of drifted) {
    bad.push(`${row.slug}/${row.sku}: list says ${row.a}, catalogue says ${row.b}`)
  }

  if (bad.length > 0) {
    console.error(`\nThese did not take:\n  ${bad.join("\n  ")}`)
    process.exit(1)
  }

  console.log(
    `\nCore holds every shelf price. ${totalOf(totals.products)} product(s) on ` +
      `${totalOf(totals.priceLists)} "${PRICE_LIST_NAME}" list(s). Nothing reads them yet — ` +
      "run `npx vitest run lib/inventory/retail-price-parity.test.ts` before S-4b flips the till.",
  )
}

/** Rolls a dry run back without pretending an error happened. */
class DryRun extends Error {
  constructor() {
    super("dry run")
    this.name = "DryRun"
  }
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
