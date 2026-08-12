/**
 * Turns retail's 29 `double precision` columns into `numeric` at the right scale.
 *
 * **Run this before `pnpm db:push` picks up the schema change:**
 *
 *   npx tsx scripts/retail-money-decimal.ts && pnpm db:push
 *
 * Retail was the last module holding money in a `Float`. Every route rounded it
 * with a local `Number(value.toFixed(2))` — the same mistake the school fee surface
 * made before S-2.1 and HR made before HR-1, where an epsilon fudge turned 8.575
 * into 8.57 and a bursar's tin disagreed with the ledger.
 *
 * Three scales, matching `lib/money.ts`:
 *
 *  - amounts `numeric(14,2)` — `MONEY_SCALE`
 *  - quantities `numeric(12,4)` — `RATE_SCALE`, so a part-received purchase order
 *    line can carry a fraction the cent scale would flatten
 *  - tax rates `numeric(5,2)` — `PERCENT_SCALE`, a percentage and not money
 *
 * ## This script reports before it rounds
 *
 * A `float8` holding 12.345 becomes 12.35 the moment it is cast to `numeric(14,2)`,
 * and a migration that does that quietly is how a cent goes missing with nobody
 * able to say when. So every column is measured first: how many rows change value
 * under the cast, and by how much in total. Nothing is altered until all 29 have
 * been counted and printed, and a value too large for the target scale stops the
 * script outright rather than being truncated.
 */

// First, and before the Prisma client is constructed: `lib/prisma.ts` reads
// `process.env.DATABASE_URL` at import time, and nothing else in a `tsx` script
// loads `.env`.
import "dotenv/config"

import { prisma } from "@/lib/prisma"

type Column = {
  table: string
  column: string
  precision: number
  scale: number
}

const MONEY = { precision: 14, scale: 2 }
const QTY = { precision: 12, scale: 4 }
const PCT = { precision: 5, scale: 2 }

const COLUMNS: readonly Column[] = [
  { table: "RetailCatalogItem", column: "unitPrice", ...MONEY },
  { table: "RetailCatalogItem", column: "compareAtPrice", ...MONEY },
  { table: "RetailCatalogItem", column: "taxPercent", ...PCT },
  { table: "RetailPromotion", column: "value", ...MONEY },
  { table: "RetailPurchaseOrderLine", column: "quantity", ...QTY },
  { table: "RetailPurchaseOrderLine", column: "unitCost", ...MONEY },
  { table: "RetailPurchaseOrderLine", column: "lineTotal", ...MONEY },
  { table: "RetailPurchaseOrderLine", column: "receivedQuantity", ...QTY },
  { table: "RetailGoodsReceiptLine", column: "quantity", ...QTY },
  { table: "RetailGoodsReceiptLine", column: "unitCost", ...MONEY },
  { table: "RetailGoodsReceiptLine", column: "lineTotal", ...MONEY },
  { table: "RetailShift", column: "openingFloat", ...MONEY },
  { table: "RetailShift", column: "expectedCash", ...MONEY },
  { table: "RetailShift", column: "countedCash", ...MONEY },
  { table: "RetailShift", column: "variance", ...MONEY },
  { table: "RetailSale", column: "subtotal", ...MONEY },
  { table: "RetailSale", column: "discountAmount", ...MONEY },
  { table: "RetailSale", column: "taxAmount", ...MONEY },
  { table: "RetailSale", column: "totalAmount", ...MONEY },
  { table: "RetailSale", column: "tenderedAmount", ...MONEY },
  { table: "RetailSale", column: "changeAmount", ...MONEY },
  { table: "RetailSaleLine", column: "quantity", ...QTY },
  { table: "RetailSaleLine", column: "unitPrice", ...MONEY },
  { table: "RetailSaleLine", column: "discountAmount", ...MONEY },
  { table: "RetailSaleLine", column: "taxAmount", ...MONEY },
  { table: "RetailSaleLine", column: "lineTotal", ...MONEY },
  { table: "RetailSaleLine", column: "costUnit", ...MONEY },
  { table: "RetailSaleLine", column: "costTotal", ...MONEY },
  { table: "RetailSalePayment", column: "amount", ...MONEY },
]

/** Identifiers are code-defined here, but SQL is being built by hand. */
function ident(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) {
    throw new Error(`Refusing to build SQL for an unexpected identifier: ${value}`)
  }
  return `"${value}"`
}

async function columnType(table: string, column: string) {
  const rows: Array<{ data_type: string; numeric_precision: number | null; numeric_scale: number | null }> =
    await prisma.$queryRaw`
      SELECT data_type, numeric_precision, numeric_scale FROM information_schema.columns
      WHERE table_name = ${table} AND column_name = ${column}
    `
  return rows[0] ?? null
}

async function main() {
  const pending: Column[] = []

  for (const target of COLUMNS) {
    const label = `"${target.table}"."${target.column}"`
    const current = await columnType(target.table, target.column)

    if (!current) {
      console.error(`No ${label} column found. Wrong database?`)
      process.exit(1)
    }
    if (current.data_type === "numeric") {
      if (current.numeric_precision === target.precision && current.numeric_scale === target.scale) {
        console.log(`${label} is already numeric(${target.precision},${target.scale}).`)
        continue
      }
      console.error(
        `${label} is numeric(${current.numeric_precision},${current.numeric_scale}), not ` +
          `numeric(${target.precision},${target.scale}). Look at it by hand.`,
      )
      process.exit(1)
    }
    if (current.data_type !== "double precision" && current.data_type !== "real") {
      console.error(
        `${label} is ${current.data_type}, which this script does not know how to ` +
          "convert. Look at it by hand.",
      )
      process.exit(1)
    }
    pending.push(target)
  }

  if (pending.length === 0) {
    console.log("\nEvery retail money column is already numeric. Nothing to do.")
    return
  }

  // Pass one: measure. Nothing is altered here — a column that would overflow, or a
  // rounding nobody expected, is worth knowing about before 29 casts have run.
  console.log(`\n${pending.length} column(s) to convert. Measuring first.\n`)
  let overflow = false
  let totalMoved = 0

  for (const target of pending) {
    const table = ident(target.table)
    const column = ident(target.column)
    const cast = `numeric(${target.precision},${target.scale})`

    const rows: Array<{ n: bigint; changed: bigint; drift: string | null; biggest: string | null }> =
      await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS n,
                COUNT(*) FILTER (
                  WHERE ${column} IS NOT NULL AND ${column}::${cast} <> ${column}::numeric
                ) AS changed,
                COALESCE(SUM(ABS(${column}::numeric - ${column}::${cast})), 0)::text AS drift,
                MAX(ABS(${column}))::text AS biggest
         FROM ${table}`,
      )

    const stats = rows[0]
    const changed = Number(stats?.changed ?? 0)
    const drift = Number(stats?.drift ?? 0)
    totalMoved += changed

    // `numeric(p,s)` holds at most `p - s` digits left of the point.
    const limit = 10 ** (target.precision - target.scale)
    const biggest = Number(stats?.biggest ?? 0)
    const label = `"${target.table}"."${target.column}"`

    let note = `${label} — ${Number(stats?.n ?? 0)} row(s) → ${cast}`
    if (changed > 0) note += `, ${changed} value(s) rounded, drift ${drift.toPrecision(3)}`
    console.log(note)

    if (biggest >= limit) {
      overflow = true
      console.error(`  OVERFLOW: largest value ${biggest} does not fit ${cast}`)
    }
  }

  if (overflow) {
    console.error(
      "\nAt least one value is too large for its target scale. No column has been " +
        "changed. Widen the column in the schema or fix the data, then run this again.",
    )
    process.exit(1)
  }

  if (totalMoved > 0) {
    console.log(
      `\n${totalMoved} value(s) will be rounded to their column's scale. That is the ` +
        "point of the migration — a float carrying a third decimal was never a cent — " +
        "but it is printed rather than done quietly.",
    )
  }

  // Pass two: the casts, in one transaction. A half-applied conversion would leave
  // the module part float and part numeric, and arithmetic spanning the two is
  // exactly the disagreement this is meant to end.
  await prisma.$transaction(async (tx) => {
    for (const target of pending) {
      const table = ident(target.table)
      const column = ident(target.column)
      const cast = `numeric(${target.precision},${target.scale})`

      // The default comes off before the cast and goes back on after it, the same
      // dance the enum conversion needed: `ALTER COLUMN … TYPE` will not cast a
      // column out from under a default it cannot also cast.
      const current: Array<{ column_default: string | null }> = await tx.$queryRaw`
        SELECT column_default FROM information_schema.columns
        WHERE table_name = ${target.table} AND column_name = ${target.column}
      `
      const hadDefault = current[0]?.column_default !== null

      if (hadDefault) {
        await tx.$executeRawUnsafe(`ALTER TABLE ${table} ALTER COLUMN ${column} DROP DEFAULT`)
      }
      await tx.$executeRawUnsafe(
        `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE ${cast} USING ${column}::${cast}`,
      )
      if (hadDefault) {
        await tx.$executeRawUnsafe(`ALTER TABLE ${table} ALTER COLUMN ${column} SET DEFAULT 0`)
      }
      console.log(`converted "${target.table}"."${target.column}" → ${cast}`)
    }
  })

  // Read it back from the catalogue, not from the schema file.
  let failed = false
  for (const target of pending) {
    const after = await columnType(target.table, target.column)
    if (
      after?.data_type !== "numeric" ||
      after.numeric_precision !== target.precision ||
      after.numeric_scale !== target.scale
    ) {
      console.error(
        `Conversion did not take: "${target.table}"."${target.column}" is ` +
          `${after?.data_type}(${after?.numeric_precision},${after?.numeric_scale}).`,
      )
      failed = true
    }
  }
  if (failed) process.exit(1)

  console.log("\nAll retail money columns are numeric. Run `pnpm db:push`.")
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
