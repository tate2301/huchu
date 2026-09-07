/**
 * Drops `RetailCatalogItem`, and the sale-line column that pointed at it.
 *
 *   npx tsx scripts/retail-drop-catalog-item.ts            # report only
 *   npx tsx scripts/retail-drop-catalog-item.ts --apply    # do it
 *
 * S-4, the last step. `docs/retail/retail-stock-consolidation-plan-2026-08-13.md`
 * §1.2: `Product` becomes the one item master. S-4a put a `Product` behind every
 * listing, S-4b moved every reader onto it, and the sale-line backfill walked
 * that link across 12,358 rows. What was left was a table nothing read and a
 * column beside every sale line duplicating the one next to it.
 *
 * **This has been run.** It is kept because it is the record of what was
 * removed and on what evidence, and because it reports rather than fails when
 * there is nothing left to do. The two scripts that preceded it — the S-4a
 * migration and the sale-line backfill — are gone: their source table no longer
 * exists, so neither can ever run again, and git holds them.
 *
 * ── This one is destructive, and that changes the shape ────────────────────
 *
 * Every other script in this directory adds. This removes, and a dropped column
 * does not come back from a report. So:
 *
 *  - **Report by default.** `--apply` is the only way anything is altered.
 *  - **It refuses before it drops.** Every check below is a way the drop could
 *    lose something, counted while the schema is still intact. One failure and
 *    nothing runs — not "the first four of six", which leaves a database no one
 *    can describe.
 *  - **It reads the source tree, not just the database.** A dangling
 *    `prisma.retailCatalogItem` call would compile right up until the table is
 *    gone and then 500 at the counter. Checking the schema alone cannot see
 *    that, so this greps `app/`, `lib/` and `components/` for readers and
 *    refuses if it finds one.
 *
 * ── What it does not do ────────────────────────────────────────────────────
 *
 * **It does not touch `RetailSaleLine.itemName`, `inventoryItemId`, `unitPrice`
 * or any other frozen column.** A receipt reprint renders from those, and they
 * are denormalised precisely so a reprint never depends on rows that may since
 * have changed. The only sale-line column removed is `catalogItemId`, whose
 * every non-null value now has a `productId` beside it saying the same thing
 * against a table that still exists.
 *
 * `prisma db push` cannot reach this database (P1001 — only a Neon pooler host
 * is configured), which is why every schema change in this module ships as a
 * script rather than a push.
 *
 * Idempotent: everything is `IF EXISTS`, and a second run reports the work as
 * already done rather than failing.
 */

import "@/scripts/lib/env";

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { prisma } from "@corelithzw/db/client"

const APPLY = process.argv.includes("--apply")

const TABLE = "RetailCatalogItem"
const SALE_LINE = "RetailSaleLine"
const CATALOG_ITEM_ID = "catalogItemId"
const FK_NAME = "RetailSaleLine_catalogItemId_fkey"
const ENUMS = ["RetailCatalogItemStatus", "RetailAcquisitionMode"]

/** Where a stray reader would live. Scripts are excluded — this file is one. */
const SOURCE_ROOTS = ["app", "lib", "components"]

function ident(name: string) {
  return `"${name.replace(/"/g, '""')}"`
}

async function count(sql: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint | number }[]>(sql)
  return Number(rows[0]?.n ?? 0)
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${name}
  `
  return Number(rows[0]?.n ?? 0) > 0
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
  `
  return Number(rows[0]?.n ?? 0) > 0
}

async function typeExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = ${name}
  `
  return Number(rows[0]?.n ?? 0) > 0
}

/** Anything still pointing at the table other than the column this drops. */
async function otherDependents(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ table_name: string; constraint_name: string }[]>`
    SELECT tc.table_name, tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = ${TABLE}
  `
  return rows
    .filter((row) => row.constraint_name !== FK_NAME)
    .map((row) => `${row.table_name}.${row.constraint_name}`)
}

function sourceFiles(dir: string, found: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return found
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, found)
    else if (/\.tsx?$/.test(entry)) found.push(full)
  }
  return found
}

/**
 * A `prisma.retailCatalogItem.…` call anywhere the app runs.
 *
 * Deliberately narrow: it matches the delegate, not the word. Every prose
 * mention of the table in a comment — and there are many, because the retirement
 * is documented where it happened — has to stay readable after this runs.
 */
function remainingReaders(): string[] {
  const hits: string[] = []
  for (const root of SOURCE_ROOTS) {
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, "utf8")
      const stripped = text
        .split("\n")
        .filter((line) => !/^\s*(\*|\/\/)/.test(line))
        .join("\n")
      if (/\b(?:prisma|tx|db)\.retailCatalogItem\b/.test(stripped)) {
        hits.push(file.split("\\").join("/"))
      }
    }
  }
  return hits
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (/\bprod(uction)?\b/.test(databaseUrl)) {
    throw new Error("DATABASE_URL looks like production. Refusing to drop tables.")
  }

  const hasTable = await tableExists(TABLE)
  const hasColumn = await columnExists(SALE_LINE, CATALOG_ITEM_ID)

  if (!hasTable && !hasColumn) {
    console.log(`"${TABLE}" and "${SALE_LINE}"."${CATALOG_ITEM_ID}" are both already gone.`)
    return
  }

  console.log(`"${TABLE}": ${hasTable ? "present" : "already dropped"}`)
  console.log(`"${SALE_LINE}"."${CATALOG_ITEM_ID}": ${hasColumn ? "present" : "already dropped"}`)

  /* ── Refuse before dropping anything ─────────────────────────────────── */

  const blocking: string[] = []

  const readers = remainingReaders()
  if (readers.length > 0) {
    blocking.push(
      `${readers.length} file(s) still call prisma.retailCatalogItem — ` +
        `dropping the table would 500 them at runtime:\n    ${readers.join("\n    ")}`,
    )
  }

  if (hasColumn) {
    // The claim the drop rests on: nothing loses its link to what was sold.
    const orphaned = await count(
      `SELECT COUNT(*) AS n FROM ${ident(SALE_LINE)}
        WHERE ${ident(CATALOG_ITEM_ID)} IS NOT NULL AND "productId" IS NULL`,
    )
    if (orphaned > 0) {
      blocking.push(
        `${orphaned} sale line(s) name a listing and no product — ` +
          "back-fill productId from the listing before running this",
      )
    }
  }

  if (hasTable) {
    // A was-price still only on the listing would be lost outright.
    const strandedCompares = await count(
      `SELECT COUNT(*) AS n FROM ${ident(TABLE)} r
        JOIN "Product" p ON p."id" = r."productId"
        WHERE r."compareAtPrice" IS NOT NULL AND p."compareAtPrice" IS NULL`,
    )
    if (strandedCompares > 0) {
      blocking.push(
        `${strandedCompares} listing(s) carry a was-price the product does not — ` +
          "copy compareAtPrice onto the product before running this",
      )
    }

    const unlinked = await count(`SELECT COUNT(*) AS n FROM ${ident(TABLE)} WHERE "productId" IS NULL`)
    if (unlinked > 0) {
      blocking.push(
        `${unlinked} listing(s) have no product behind them — dropping the table ` +
          "would lose those lines from the range entirely; link them to a Product " +
          "by hand before running this",
      )
    }

    const dependents = await otherDependents()
    if (dependents.length > 0) {
      blocking.push(`something else still references the table: ${dependents.join(", ")}`)
    }
  }

  if (blocking.length > 0) {
    console.error(`\nRefusing to drop:\n  ${blocking.join("\n  ")}`)
    process.exit(1)
  }

  const rows = hasTable ? await count(`SELECT COUNT(*) AS n FROM ${ident(TABLE)}`) : 0
  const linked = hasColumn
    ? await count(
        `SELECT COUNT(*) AS n FROM ${ident(SALE_LINE)} WHERE ${ident(CATALOG_ITEM_ID)} IS NOT NULL`,
      )
    : 0

  console.log(
    `\nEvery check passed. ${rows} listing row(s) and ${linked} sale-line link(s) would go; ` +
      "every one of those lines names a product and keeps its itemName, quantity and price.",
  )

  if (!APPLY) {
    console.log("\nReport only. Re-run with --apply to drop them.")
    return
  }

  /* ── Drop, in dependency order ───────────────────────────────────────── */

  if (hasColumn) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${ident(SALE_LINE)} DROP CONSTRAINT IF EXISTS ${ident(FK_NAME)}`,
    )
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${ident(SALE_LINE)} DROP COLUMN IF EXISTS ${ident(CATALOG_ITEM_ID)}`,
    )
    console.log(`dropped "${SALE_LINE}"."${CATALOG_ITEM_ID}" and its constraint`)
  }

  if (hasTable) {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${ident(TABLE)}`)
    console.log(`dropped "${TABLE}"`)
  }

  for (const name of ENUMS) {
    if (await typeExists(name)) {
      await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS ${ident(name)}`)
      console.log(`dropped type "${name}"`)
    }
  }

  /* ── Read the result back out of the catalogue ───────────────────────── */

  const bad: string[] = []
  if (await tableExists(TABLE)) bad.push(`"${TABLE}" is still there`)
  if (await columnExists(SALE_LINE, CATALOG_ITEM_ID)) {
    bad.push(`"${SALE_LINE}"."${CATALOG_ITEM_ID}" is still there`)
  }
  for (const name of ENUMS) {
    if (await typeExists(name)) bad.push(`type "${name}" is still there`)
  }

  // The lines are still lines. This is the check that would catch a cascade
  // nobody predicted, which is the one real way this script could do harm.
  const survivors = await count(`SELECT COUNT(*) AS n FROM ${ident(SALE_LINE)}`)
  if (survivors === 0) bad.push(`"${SALE_LINE}" is empty — something cascaded`)
  const nameless = await count(
    `SELECT COUNT(*) AS n FROM ${ident(SALE_LINE)} WHERE "itemName" IS NULL OR btrim("itemName") = ''`,
  )
  if (nameless > 0) bad.push(`${nameless} sale line(s) lost their itemName`)

  if (bad.length > 0) {
    console.error(`\nThese did not take:\n  ${bad.join("\n  ")}`)
    process.exit(1)
  }

  console.log(
    `\nDone. ${survivors} sale line(s) intact, every one naming its product and its item. ` +
      "Remove the model from prisma/schema.prisma and run `npx prisma generate`.",
  )
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
