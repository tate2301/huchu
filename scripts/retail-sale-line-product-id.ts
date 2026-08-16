/**
 * S-4b — points every sale line at a `Product`, and moves the was-price with it.
 *
 *   npx tsx scripts/retail-sale-line-product-id.ts
 *
 * `docs/retail/retail-stock-consolidation-plan-2026-08-13.md` §1.2: `Product`
 * becomes the one item master and `RetailSaleLine.catalogItemId` becomes
 * `productId`. S-4a put a `Product` behind every `RetailCatalogItem` and wrote
 * `RetailCatalogItem.productId`; this walks that link once, for the sale lines,
 * so that retail can stop reading the listing table entirely.
 *
 * ## What it does not do
 *
 * **It does not rewrite history.** Every existing line keeps its
 * `inventoryItemId` and its `itemName` — those are what a receipt reprint
 * renders, and they are denormalised precisely so a reprint does not depend on
 * rows that may since have changed. `productId` is a link being *added* beside
 * them, never a restatement of what was sold.
 *
 * **It does not drop `catalogItemId`, and it does not drop
 * `RetailCatalogItem`.** After this runs, nothing in the application reads that
 * table; the column and the table stay as a frozen shadow, and removing them is
 * `scripts/retail-drop-catalog-item.ts`, reviewed and run on its own.
 *
 * ## Two columns, one script
 *
 * `Product.compareAtPrice` comes along because the pricing screen edits the
 * was-price in the same row as the sell price. Leaving it behind on
 * `RetailCatalogItem` would have meant one editable table writing to two item
 * masters, which is the exact thing S-4 exists to end.
 *
 * ## Why a script
 *
 * `prisma db push` cannot run against this database (P1001 — only a Neon pooler
 * host is configured), and adding a foreign key to a table with 12,600 rows in it
 * is not a safe blind operation: one row pointing at something that is gone and
 * the `ALTER TABLE` fails halfway through. So, in the order
 * `scripts/retail-line-company-id.ts` established: count the orphans and refuse
 * *before* altering anything, then add nullable, backfill, index, constrain, and
 * read the result back out of `information_schema` rather than out of the
 * counters this script kept.
 *
 * Idempotent: `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, a
 * constraint skipped by name when it is already there, and backfills that only
 * touch NULLs. A second run reports zero written and changes nothing.
 */

import "dotenv/config"

import { prisma } from "@/lib/prisma"

const SALE_LINE_TABLE = "RetailSaleLine"
const PRODUCT_ID = "productId"
const INDEX_NAME = "RetailSaleLine_companyId_productId_idx"
const FK_NAME = "RetailSaleLine_productId_fkey"

function ident(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) {
    throw new Error(`Refusing to build SQL for an unexpected identifier: ${value}`)
  }
  return `"${value}"`
}

/** Prisma names indexes and constraints with underscores; `ident` rejects those. */
function underscoreIdent(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Refusing to build SQL for an unexpected object name: ${value}`)
  }
  return `"${value}"`
}

async function count(sql: string) {
  const rows: Array<{ n: bigint }> = await prisma.$queryRawUnsafe(sql)
  return Number(rows[0]?.n ?? 0)
}

async function column(table: string, name: string) {
  const rows: Array<{ data_type: string; is_nullable: string; numeric_precision: number | null; numeric_scale: number | null }> =
    await prisma.$queryRaw`
      SELECT data_type, is_nullable, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_name = ${table} AND column_name = ${name}
    `
  return rows[0] ?? null
}

async function indexExists(name: string) {
  const rows: Array<{ n: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM pg_indexes WHERE indexname = ${name}
  `
  return Number(rows[0]?.n ?? 0) > 0
}

/** The constraint and, when it is there, what it does on delete. */
async function foreignKey(name: string) {
  const rows: Array<{ delete_rule: string }> = await prisma.$queryRaw`
    SELECT rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
     AND rc.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_name = ${name} AND tc.constraint_type = 'FOREIGN KEY'
  `
  return rows[0]?.delete_rule ?? null
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (/\bprod(uction)?\b/.test(databaseUrl)) {
    throw new Error("DATABASE_URL looks like production. Refusing to alter tables.")
  }

  // ---- Refuse before altering anything --------------------------------------
  //
  // Each of these is a row the backfill would have to guess about, and each one
  // is counted while the schema is still exactly as it was this morning.
  const blocking: string[] = []

  // A listing with no product behind it is a sale line that cannot be linked.
  // S-4a is supposed to have left none, and `retail-price-parity.test.ts`
  // asserts it — "should be impossible" is not a migration guarantee.
  const unlinkedListings = await count(
    `SELECT COUNT(*) AS n FROM "RetailCatalogItem" WHERE "productId" IS NULL`,
  )
  if (unlinkedListings > 0) {
    blocking.push(
      `${unlinkedListings} RetailCatalogItem row(s) still have no productId — ` +
        "run scripts/retail-catalog-to-core.ts --apply first",
    )
  }

  // A listing naming a product that is gone. This is what would make the
  // ALTER TABLE ... ADD CONSTRAINT fail, after the column had already been added.
  const danglingProducts = await count(
    `SELECT COUNT(*) AS n FROM "RetailCatalogItem" r
     LEFT JOIN "Product" p ON p."id" = r."productId"
     WHERE r."productId" IS NOT NULL AND p."id" IS NULL`,
  )
  if (danglingProducts > 0) {
    blocking.push(`${danglingProducts} RetailCatalogItem row(s) name a Product that no longer exists`)
  }

  // A product already carrying a productId that came from somewhere else, and
  // disagrees with the listing. Nothing writes this column yet, so a non-zero
  // count means a partial earlier run or a hand edit; either way, guessing which
  // of the two is right is not this script's decision to make.
  const columnAlready = await column(SALE_LINE_TABLE, PRODUCT_ID)
  if (columnAlready) {
    const disagreeing = await count(
      `SELECT COUNT(*) AS n FROM "RetailSaleLine" l
       JOIN "RetailCatalogItem" r ON r."id" = l."catalogItemId"
       WHERE l."productId" IS NOT NULL
         AND r."productId" IS NOT NULL
         AND l."productId" <> r."productId"`,
    )
    if (disagreeing > 0) {
      blocking.push(
        `${disagreeing} sale line(s) already carry a productId that disagrees with their listing`,
      )
    }
  }

  if (blocking.length > 0) {
    console.error(
      `Refusing to migrate. ${blocking.length} thing(s) would make this ambiguous:\n  ` +
        blocking.join("\n  ") +
        "\n\nNothing has been altered.",
    )
    process.exit(1)
  }

  // ---- Product.compareAtPrice ------------------------------------------------
  const compareBefore = await column("Product", "compareAtPrice")
  if (compareBefore) {
    console.log(`"Product"."compareAtPrice" already exists.`)
  } else {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${ident("Product")} ADD COLUMN IF NOT EXISTS ${ident("compareAtPrice")} DECIMAL(14,2)`,
    )
    console.log(`added "Product"."compareAtPrice" DECIMAL(14,2)`)
  }

  const comparesFilled = await count(
    `WITH updated AS (
       UPDATE "Product" p
       SET "compareAtPrice" = r."compareAtPrice"
       FROM "RetailCatalogItem" r
       WHERE r."productId" = p."id"
         AND r."compareAtPrice" IS NOT NULL
         AND p."compareAtPrice" IS NULL
       RETURNING 1
     ) SELECT COUNT(*) AS n FROM updated`,
  )
  const comparesAvailable = await count(
    `SELECT COUNT(*) AS n FROM "RetailCatalogItem"
     WHERE "compareAtPrice" IS NOT NULL AND "productId" IS NOT NULL`,
  )
  console.log(
    `  backfilled ${comparesFilled} was-price(s) from RetailCatalogItem ` +
      `(${comparesAvailable} listing(s) carry one)`,
  )

  // ---- RetailSaleLine.productId ----------------------------------------------
  if (columnAlready) {
    console.log(`\n"RetailSaleLine"."productId" already exists.`)
  } else {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${ident(SALE_LINE_TABLE)} ADD COLUMN IF NOT EXISTS ${ident(PRODUCT_ID)} TEXT`,
    )
    console.log(`\nadded "RetailSaleLine"."productId" TEXT (nullable, and staying that way)`)
  }

  const linesFilled = await count(
    `WITH updated AS (
       UPDATE "RetailSaleLine" l
       SET "productId" = r."productId"
       FROM "RetailCatalogItem" r
       WHERE r."id" = l."catalogItemId"
         AND r."productId" IS NOT NULL
         AND l."productId" IS NULL
       RETURNING 1
     ) SELECT COUNT(*) AS n FROM updated`,
  )
  console.log(`  backfilled ${linesFilled} sale line(s) from their listing`)

  const totalLines = await count(`SELECT COUNT(*) AS n FROM "RetailSaleLine"`)
  const withCatalog = await count(
    `SELECT COUNT(*) AS n FROM "RetailSaleLine" WHERE "catalogItemId" IS NOT NULL`,
  )
  const withProduct = await count(
    `SELECT COUNT(*) AS n FROM "RetailSaleLine" WHERE "productId" IS NOT NULL`,
  )
  const unreachable = await count(
    `SELECT COUNT(*) AS n FROM "RetailSaleLine"
     WHERE "catalogItemId" IS NOT NULL AND "productId" IS NULL`,
  )
  console.log(
    `  ${totalLines} sale line(s): ${withCatalog} name a listing, ${withProduct} now name a product`,
  )
  // Not fatal. A line whose listing was deleted years ago has nothing to link to
  // and never will; it keeps `itemName` and `inventoryItemId`, which is what a
  // reprint needs. Named rather than silently tolerated.
  if (unreachable > 0) {
    console.log(
      `  ${unreachable} line(s) name a listing that has no product — left null, they keep ` +
        "itemName and inventoryItemId",
    )
  }

  // ---- Index, then the constraint --------------------------------------------
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS ${underscoreIdent(INDEX_NAME)} ` +
      `ON ${ident(SALE_LINE_TABLE)} (${ident("companyId")}, ${ident(PRODUCT_ID)})`,
  )
  console.log(`  index ${INDEX_NAME}`)

  const existingRule = await foreignKey(FK_NAME)
  if (existingRule) {
    console.log(`  constraint ${FK_NAME} already exists (ON DELETE ${existingRule})`)
  } else {
    const orphans = await count(
      `SELECT COUNT(*) AS n FROM "RetailSaleLine" l
       LEFT JOIN "Product" p ON p."id" = l."productId"
       WHERE l."productId" IS NOT NULL AND p."id" IS NULL`,
    )
    if (orphans > 0) {
      console.error(
        `\nRefusing to add ${FK_NAME}: ${orphans} line(s) point at a Product that is not there. ` +
          "The column and its backfill are in place; clean those rows and re-run.",
      )
      process.exit(1)
    }
    // SET NULL, matching `scripts/retail-foreign-keys.ts`'s reasoning for the
    // cashier and the source line: losing the link is bad, blocking the parent's
    // deletion because of it is worse, and the column is nullable so Postgres can
    // actually honour the rule instead of failing at delete time.
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${ident(SALE_LINE_TABLE)} ADD CONSTRAINT ${underscoreIdent(FK_NAME)} ` +
        `FOREIGN KEY (${ident(PRODUCT_ID)}) REFERENCES ${ident("Product")} ("id") ` +
        `ON DELETE SET NULL ON UPDATE CASCADE`,
    )
    console.log(`  added ${FK_NAME} (ON DELETE SET NULL)`)
  }

  // ---- Read it back out of the catalogue, not out of the counters -------------
  const bad: string[] = []

  const compareColumn = await column("Product", "compareAtPrice")
  if (!compareColumn) {
    bad.push(`"Product"."compareAtPrice" is missing`)
  } else if (compareColumn.numeric_precision !== 14 || compareColumn.numeric_scale !== 2) {
    bad.push(
      `"Product"."compareAtPrice" is numeric(${compareColumn.numeric_precision},` +
        `${compareColumn.numeric_scale}), expected numeric(14,2)`,
    )
  }

  const productColumn = await column(SALE_LINE_TABLE, PRODUCT_ID)
  if (!productColumn) {
    bad.push(`"RetailSaleLine"."productId" is missing`)
  } else if (productColumn.is_nullable !== "YES") {
    bad.push(`"RetailSaleLine"."productId" is NOT NULL — history has lines with no product`)
  }

  if (!(await indexExists(INDEX_NAME))) bad.push(`index ${INDEX_NAME} is missing`)

  const rule = await foreignKey(FK_NAME)
  if (!rule) bad.push(`constraint ${FK_NAME} is missing`)
  else if (rule !== "SET NULL") bad.push(`${FK_NAME} deletes with ${rule}, expected SET NULL`)

  // The claim the ticket rests on: every line that knew its listing now knows its
  // product, and no line lost anything on the way.
  const stillNamed = await count(
    `SELECT COUNT(*) AS n FROM "RetailSaleLine" WHERE "itemName" IS NULL OR btrim("itemName") = ''`,
  )
  if (stillNamed > 0) bad.push(`${stillNamed} sale line(s) lost their itemName`)

  if (bad.length > 0) {
    console.error(`\nThese did not take:\n  ${bad.join("\n  ")}`)
    process.exit(1)
  }

  console.log(
    `\n"RetailSaleLine"."productId" is in place, indexed, and constrained ON DELETE SET NULL. ` +
      `${withProduct} of ${totalLines} line(s) name a product; every line keeps its itemName and ` +
      "its inventoryItemId.",
  )
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
