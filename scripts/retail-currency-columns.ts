/**
 * Adds the currency trio to retail sales and payments.
 *
 *   npx tsx scripts/retail-currency-columns.ts
 *
 * R-1.5. Retail had no currency anywhere, in a country that prices in USD and
 * takes ZWG and EcoCash across the same counter all day.
 * `normalizeRetailPostingPayments` already accepted a per-payment currency and
 * dropped it, because there was no column to write it to.
 *
 * `prisma db push` cannot run against this database — only a Neon pooler host is
 * configured, so it dies with P1001 before it compares anything — and it would
 * refuse a required column on a populated table regardless. These are additive
 * columns with defaults, which is the safe shape: existing rows become USD at a
 * rate of 1, which is what they always were implicitly, and `baseAmount` is
 * backfilled from `totalAmount` rather than left at zero so historical takings
 * still sum.
 *
 * Idempotent: `ADD COLUMN IF NOT EXISTS`, and the backfill only touches rows that
 * still hold the default.
 */

import "dotenv/config"

import { prisma } from "@/lib/prisma"

type ColumnSpec = {
  table: string
  column: string
  definition: string
}

const COLUMNS: readonly ColumnSpec[] = [
  { table: "RetailSale", column: "currency", definition: `TEXT NOT NULL DEFAULT 'USD'` },
  { table: "RetailSale", column: "exchangeRate", definition: "NUMERIC(12,4) NOT NULL DEFAULT 1" },
  { table: "RetailSale", column: "baseAmount", definition: "NUMERIC(14,2) NOT NULL DEFAULT 0" },
  { table: "RetailSalePayment", column: "currency", definition: `TEXT NOT NULL DEFAULT 'USD'` },
  { table: "RetailSalePayment", column: "exchangeRate", definition: "NUMERIC(12,4) NOT NULL DEFAULT 1" },
  { table: "RetailSalePayment", column: "baseAmount", definition: "NUMERIC(14,2) NOT NULL DEFAULT 0" },
]

function ident(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) {
    throw new Error(`Refusing to build SQL for an unexpected identifier: ${value}`)
  }
  return `"${value}"`
}

async function columnExists(table: string, column: string) {
  const rows: Array<{ n: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
  `
  return Number(rows[0]?.n ?? 0) > 0
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (/\bprod(uction)?\b/.test(databaseUrl)) {
    throw new Error("DATABASE_URL looks like production. Refusing to alter tables.")
  }

  let added = 0
  for (const spec of COLUMNS) {
    const label = `"${spec.table}"."${spec.column}"`
    if (await columnExists(spec.table, spec.column)) {
      console.log(`${label} already exists.`)
      continue
    }
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${ident(spec.table)} ADD COLUMN IF NOT EXISTS ${ident(spec.column)} ${spec.definition}`,
    )
    console.log(`added ${label} ${spec.definition}`)
    added += 1
  }

  // Backfill `baseAmount` from the amount already on the row. Every existing sale
  // was implicitly in the base currency at a rate of 1, so its base amount is its
  // total — leaving these at zero would make historical takings vanish from any
  // report that sums the base column.
  const sales: Array<{ n: bigint }> = await prisma.$queryRawUnsafe(
    `WITH updated AS (
       UPDATE "RetailSale" SET "baseAmount" = "totalAmount"
       WHERE "baseAmount" = 0 AND "totalAmount" <> 0
       RETURNING 1
     ) SELECT COUNT(*) AS n FROM updated`,
  )
  const payments: Array<{ n: bigint }> = await prisma.$queryRawUnsafe(
    `WITH updated AS (
       UPDATE "RetailSalePayment" SET "baseAmount" = "amount"
       WHERE "baseAmount" = 0 AND "amount" <> 0
       RETURNING 1
     ) SELECT COUNT(*) AS n FROM updated`,
  )

  console.log(
    `\n${added} column(s) added. Backfilled baseAmount on ${Number(sales[0]?.n ?? 0)} sale(s) ` +
      `and ${Number(payments[0]?.n ?? 0)} payment(s).`,
  )

  // Read it back from the catalogue, not the schema file.
  const missing: string[] = []
  for (const spec of COLUMNS) {
    if (!(await columnExists(spec.table, spec.column))) {
      missing.push(`"${spec.table}"."${spec.column}"`)
    }
  }
  if (missing.length > 0) {
    console.error(`These columns did not take: ${missing.join(", ")}`)
    process.exit(1)
  }
  console.log("All currency columns are in place.")
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
