/**
 * S-1 (additive half) — the columns the retail price engine needs on core.
 *
 *   npx tsx scripts/retail-price-engine-schema.ts && pnpm db:push
 *
 * `docs/retail/retail-stock-consolidation-plan-2026-08-13.md` §1.1 and §1.2 make
 * core `PriceList` / `ProductPrice` / `Product` the single author of a shelf
 * price and the single item master. Both need attributes core has never carried,
 * because until now the only module that wanted them kept a private copy on
 * `RetailCatalogItem`.
 *
 * This script is **additive only**. It adds an enum value and five columns and
 * removes nothing: `RetailCatalogItem` keeps its own `unitPrice`, `taxPercent`
 * and `barcode`, and no sale line is repointed. Retiring that table is S-4 and
 * it needs a backfill this ticket has not written. Nothing here changes how a
 * price is *resolved* either — that is S-3. Columns only.
 *
 * ## What it adds, and why each one exists
 *
 * 1. **`PriceListKind.RETAIL`.** A shelf-price list, distinct from
 *    STANDARD/WHOLESALE/TRADE/VIP/REGIONAL — the till needs to be able to ask
 *    for "the list a customer at the counter is charged from" without guessing
 *    which of the trade lists was meant.
 *
 * 2. **`PriceList.taxInclusive`.** Says how `ProductPrice.unitPrice` is meant.
 *    A Zimbabwean shelf price is what the customer pays: VAT at 15% is already
 *    in it, and adding 15% again at the till prints a number nobody at the
 *    counter recognises. Defaults to `false` so every list that exists today
 *    keeps meaning exactly what it meant this morning; a retail list is created
 *    with it `true`.
 *
 * 3. **`Product.barcode`.** The till scans on this. Indexed, not unique — see
 *    the collision study below, which this script runs and prints.
 *
 * 4. **`Product.ageRestricted`.** A liquor licence is not optional. The counter
 *    has to be told to check, and a bottle store's range is mostly things it
 *    applies to.
 *
 * 5. **`Product.returnable` / `Product.depositAmount`.** A Chibuku scud comes
 *    back and the empty is worth money. Ordinary Zimbabwean bottle-store trade,
 *    modelled nowhere in this repo before now.
 *
 * ## Why `barcode` is indexed and not unique
 *
 * `@@unique([companyId, barcode])` is the right instinct and it is wrong here.
 * `Product.barcode` is empty today, so the constraint would apply cleanly — and
 * then fail on the S-4 backfill, because `RetailCatalogItem` already holds
 * distinct products sharing a barcode inside one company *and one site*. The
 * counts are printed on every run so the decision can be revisited when the data
 * says it can be.
 *
 * ## Enum values and transactions
 *
 * `ALTER TYPE … ADD VALUE` cannot run inside a transaction block on Postgres
 * before 12, and even on 12+ the new label is not usable until the adding
 * transaction commits. So it is issued on its own, outside the `$transaction`
 * that carries the column additions, and read back out of `pg_enum` afterwards.
 *
 * Idempotent: `ADD VALUE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
 * `CREATE INDEX IF NOT EXISTS`. A second run reports and changes nothing.
 */

import "dotenv/config"

import type { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { ident } from "@/scripts/lib/decimal-cast"

/**
 * The client the catalogue lookups run on. Inside the transaction they must run
 * on `tx`, or the "does this already exist?" check answers from a snapshot that
 * cannot see what the same transaction just added.
 */
type Db = Prisma.TransactionClient

type NewColumn = {
  table: string
  column: string
  /** The SQL type, written out. */
  type: string
  /** Omitted means nullable — every column here is either nullable or defaulted. */
  notNull?: true
  /** A SQL literal. Required alongside `notNull` on a populated table. */
  default?: string
  /** What `information_schema.columns.data_type` must read afterwards. */
  expectDataType: string
}

const ENUM_TYPE = "PriceListKind"
const ENUM_VALUE = "RETAIL"

const COLUMNS: readonly NewColumn[] = [
  {
    table: "PriceList",
    column: "taxInclusive",
    type: "BOOLEAN",
    notNull: true,
    default: "false",
    expectDataType: "boolean",
  },
  { table: "Product", column: "barcode", type: "TEXT", expectDataType: "text" },
  {
    table: "Product",
    column: "ageRestricted",
    type: "BOOLEAN",
    notNull: true,
    default: "false",
    expectDataType: "boolean",
  },
  {
    table: "Product",
    column: "returnable",
    type: "BOOLEAN",
    notNull: true,
    default: "false",
    expectDataType: "boolean",
  },
  {
    table: "Product",
    column: "depositAmount",
    type: "NUMERIC(14,2)",
    expectDataType: "numeric",
  },
]

/** Prisma's own naming convention, so a later `db push` recognises it. */
const INDEXES: ReadonlyArray<{ table: string; columns: readonly string[] }> = [
  { table: "Product", columns: ["companyId", "barcode"] },
]

/**
 * Index names carry underscores by Prisma's convention (`Table_col_col_idx`),
 * which `ident` rejects. Same guard, one more character.
 */
function indexIdent(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Refusing to build SQL for an unexpected index name: ${value}`)
  }
  return `"${value}"`
}

async function enumLabels(db: Db, type: string) {
  const rows: Array<{ enumlabel: string }> = await db.$queryRaw`
    SELECT e.enumlabel FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = ${type}
    ORDER BY e.enumsortorder
  `
  return rows.map((row) => row.enumlabel)
}

async function columnFacts(db: Db, table: string, column: string) {
  const rows: Array<{ data_type: string; is_nullable: string; column_default: string | null }> =
    await db.$queryRaw`
      SELECT data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_name = ${table} AND column_name = ${column}
    `
  return rows[0] ?? null
}

async function tableExists(db: Db, table: string) {
  const rows: Array<{ n: bigint }> = await db.$queryRaw`
    SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_name = ${table}
  `
  return Number(rows[0]?.n ?? 0) > 0
}

async function indexExists(db: Db, name: string) {
  const rows: Array<{ n: bigint }> = await db.$queryRaw`
    SELECT COUNT(*) AS n FROM pg_indexes WHERE indexname = ${name}
  `
  return Number(rows[0]?.n ?? 0) > 0
}

/**
 * What a `@@unique([companyId, barcode])` on `Product` would cost, measured
 * against both the column itself and the table S-4 will backfill it from.
 * Printed, never acted on — this script does not create the constraint.
 */
async function barcodeCollisionStudy() {
  console.log("\nBarcode uniqueness study — would @@unique([companyId, barcode]) hold?")

  for (const table of ["Product", "RetailCatalogItem"] as const) {
    if (!(await tableExists(prisma, table))) {
      console.log(`  ${table}: no such table`)
      continue
    }
    if (!(await columnFacts(prisma, table, "barcode"))) {
      console.log(`  ${table}: no barcode column yet`)
      continue
    }

    const rows: Array<{ total: bigint; filled: bigint; blank: bigint; colliding: bigint; pairs: bigint }> =
      await prisma.$queryRawUnsafe(
        `WITH dupes AS (
           SELECT "companyId", barcode, COUNT(*) AS n FROM ${ident(table)}
           WHERE barcode IS NOT NULL AND btrim(barcode) <> ''
           GROUP BY 1, 2 HAVING COUNT(*) > 1
         )
         SELECT (SELECT COUNT(*) FROM ${ident(table)}) AS total,
                (SELECT COUNT(*) FROM ${ident(table)}
                  WHERE barcode IS NOT NULL AND btrim(barcode) <> '') AS filled,
                (SELECT COUNT(*) FROM ${ident(table)}
                  WHERE barcode IS NOT NULL AND btrim(barcode) = '') AS blank,
                COALESCE((SELECT SUM(n) FROM dupes), 0) AS colliding,
                (SELECT COUNT(*) FROM dupes) AS pairs`,
      )
    const s = rows[0]
    console.log(
      `  ${table}: ${Number(s?.total ?? 0)} row(s), ${Number(s?.filled ?? 0)} with a barcode, ` +
        `${Number(s?.blank ?? 0)} empty-string, ${Number(s?.pairs ?? 0)} colliding ` +
        `(companyId, barcode) pair(s) over ${Number(s?.colliding ?? 0)} row(s)`,
    )
  }

  console.log(
    "  Verdict: plain index. `Product.barcode` is clean because it is new, but S-4 " +
      "backfills it from `RetailCatalogItem`, where distinct SKUs already share a " +
      "barcode inside one company. A unique constraint added now would pass today " +
      "and block that migration.",
  )
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (/\bprod(uction)?\b/.test(databaseUrl)) {
    throw new Error("DATABASE_URL looks like production. Refusing to alter tables.")
  }

  // ---- Refuse before altering anything --------------------------------------
  const missingTables = new Set<string>()
  for (const spec of [...COLUMNS, ...INDEXES.map((index) => ({ table: index.table }))]) {
    if (!(await tableExists(prisma, spec.table))) missingTables.add(spec.table)
  }
  if (missingTables.size > 0) {
    console.error(
      `No ${[...missingTables].join(", ")} table in this database. Wrong database? ` +
        "Nothing has been altered.",
    )
    process.exit(1)
  }
  if ((await enumLabels(prisma, ENUM_TYPE)).length === 0) {
    console.error(`No ${ENUM_TYPE} type in this database. Nothing has been altered.`)
    process.exit(1)
  }

  // ---- The enum value, on its own connection, outside any transaction --------
  const before = await enumLabels(prisma, ENUM_TYPE)
  if (before.includes(ENUM_VALUE)) {
    console.log(`${ENUM_TYPE} already carries ${ENUM_VALUE}.`)
  } else {
    await prisma.$executeRawUnsafe(
      `ALTER TYPE ${ident(ENUM_TYPE)} ADD VALUE IF NOT EXISTS '${ENUM_VALUE}'`,
    )
    console.log(`added ${ENUM_VALUE} to ${ENUM_TYPE}`)
  }

  // ---- The columns, in one transaction ---------------------------------------
  await prisma.$transaction(async (tx) => {
    for (const spec of COLUMNS) {
      const label = `"${spec.table}"."${spec.column}"`
      const existing = await columnFacts(tx, spec.table, spec.column)
      if (existing) {
        console.log(`${label} already exists (${existing.data_type}, nullable ${existing.is_nullable}).`)
        continue
      }

      // NOT NULL with a default is safe on a populated table — Postgres 11+ fills
      // it in without rewriting. NOT NULL without one would fail on the first
      // existing row, which is why every non-null column here carries a default.
      const clauses = [
        `ALTER TABLE ${ident(spec.table)} ADD COLUMN IF NOT EXISTS ${ident(spec.column)} ${spec.type}`,
      ]
      if (spec.default !== undefined) clauses.push(`DEFAULT ${spec.default}`)
      if (spec.notNull) clauses.push("NOT NULL")
      await tx.$executeRawUnsafe(clauses.join(" "))
      console.log(`added ${label} ${spec.type}${spec.notNull ? " NOT NULL" : ""}`)
    }

    for (const index of INDEXES) {
      const name = `${index.table}_${index.columns.join("_")}_idx`
      if (await indexExists(tx, name)) {
        console.log(`index ${name} already exists.`)
        continue
      }
      await tx.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS ${indexIdent(name)} ON ${ident(index.table)} ` +
          `(${index.columns.map(ident).join(", ")})`,
      )
      console.log(`index ${name}`)
    }
  })

  await barcodeCollisionStudy()

  // ---- Read it back out of the catalogue, not the schema file ----------------
  const bad: string[] = []

  if (!(await enumLabels(prisma, ENUM_TYPE)).includes(ENUM_VALUE)) {
    bad.push(`${ENUM_TYPE} still has no ${ENUM_VALUE}`)
  }
  for (const spec of COLUMNS) {
    const label = `"${spec.table}"."${spec.column}"`
    const facts = await columnFacts(prisma, spec.table, spec.column)
    if (!facts) {
      bad.push(`${label} missing`)
      continue
    }
    if (facts.data_type !== spec.expectDataType) {
      bad.push(`${label} is ${facts.data_type}, expected ${spec.expectDataType}`)
    }
    const wantNullable = spec.notNull ? "NO" : "YES"
    if (facts.is_nullable !== wantNullable) {
      bad.push(`${label} is_nullable=${facts.is_nullable}, expected ${wantNullable}`)
    }
  }
  for (const index of INDEXES) {
    const name = `${index.table}_${index.columns.join("_")}_idx`
    if (!(await indexExists(prisma, name))) bad.push(`index ${name} missing`)
  }

  if (bad.length > 0) {
    console.error(`\nThese did not take: ${bad.join(", ")}`)
    process.exit(1)
  }

  console.log(
    `\n${ENUM_TYPE}.${ENUM_VALUE}, PriceList.taxInclusive and the Product retail ` +
      "profile are all in place. Run `pnpm db:push`.",
  )
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
