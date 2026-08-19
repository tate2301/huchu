/**
 * Adds `RetailSale.clientRef` and its unique index.
 *
 *   npx tsx scripts/retail-sale-client-ref.ts
 *
 * S-7.7. Splits the till's idempotency key away from the receipt number.
 *
 * ── Why this column has to exist ───────────────────────────────────────────
 *
 * The POS generated `RSL-${Date.now()}${random}` and sent it as the sale's
 * `saleNo`, so every receipt a customer was handed read
 * `RSL-1787005857220984` instead of the `S-005080` that `reserveIdentifier`
 * allocates. That is not a cosmetic complaint: a shop reconciles a day's
 * takings by receipt number, and a 19-digit key nobody can read aloud over the
 * counter is not a receipt number.
 *
 * The obvious fix — stop sending it — is wrong, and this is the whole reason
 * the column is here. That key is doing real work. If the POST commits and the
 * response is lost, `saleMutation.onError` treats it as a network failure and
 * queues the sale, and `pos/sync` replays it later. With a client-supplied key
 * the replay collides on `@@unique([companyId, saleNo])` and
 * `createRetailSaleTransaction` returns the sale that already exists. Without
 * one, the shop charges the customer twice. On a Harare connection that is not
 * a hypothetical.
 *
 * So the two jobs get two columns: the server numbers the receipt for the
 * human, the till keys the attempt for the machine.
 *
 * ── Nullable, deliberately ─────────────────────────────────────────────────
 *
 * Every sale rung before today has no key, and the back office posts sales that
 * never had one. Postgres treats NULLs as distinct inside a unique index, so
 * thousands of them sit under `@@unique([companyId, clientRef])` without
 * colliding — which is exactly the semantics wanted: "unkeyed sales are never
 * duplicates of one another."
 *
 * Idempotent: `ADD COLUMN IF NOT EXISTS` and a guarded index create, so a
 * second run is a no-op and a half-finished first run completes.
 */

// First, and before the Prisma client is constructed: `lib/prisma.ts` reads
// `process.env.DATABASE_URL` at import time, and nothing else in a `tsx` script
// loads `.env`.
import "dotenv/config"

import { prisma } from "@/lib/prisma"

const TABLE = "RetailSale"
const COLUMN = "clientRef"
/** Prisma's own name for `@@unique([companyId, clientRef])`. */
const INDEX = "RetailSale_companyId_clientRef_key"

function ident(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) {
    throw new Error(`Refusing to build SQL for an unexpected object name: ${value}`)
  }
  return `"${value}"`
}

function underscoreIdent(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Refusing to build SQL for an unexpected object name: ${value}`)
  }
  return `"${value}"`
}

async function columnExists(table: string, name: string) {
  const rows: Array<{ n: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${name}
  `
  return Number(rows[0]?.n ?? 0) > 0
}

async function indexExists(name: string) {
  const rows: Array<{ n: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM pg_indexes WHERE indexname = ${name}
  `
  return Number(rows[0]?.n ?? 0) > 0
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (/\bprod(uction)?\b/.test(databaseUrl)) {
    throw new Error("DATABASE_URL looks like production. Refusing to alter tables.")
  }

  if (await columnExists(TABLE, COLUMN)) {
    console.log(`  ${TABLE}.${COLUMN} already present`)
  } else {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${ident(TABLE)} ADD COLUMN IF NOT EXISTS ${ident(COLUMN)} TEXT`,
    )
    console.log(`  added ${TABLE}.${COLUMN}`)
  }

  if (await indexExists(INDEX)) {
    console.log(`  ${INDEX} already present`)
  } else {
    /*
      A plain UNIQUE index, not a partial one. Prisma models
      `@@unique([companyId, clientRef])` as an ordinary unique index and would
      see `WHERE clientRef IS NOT NULL` as drift on the next introspection —
      and it buys nothing here, because Postgres already skips NULL rows when
      enforcing uniqueness.
    */
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${underscoreIdent(INDEX)} ` +
        `ON ${ident(TABLE)} (${ident("companyId")}, ${ident(COLUMN)})`,
    )
    console.log(`  created ${INDEX}`)
  }

  const [{ n }]: Array<{ n: bigint }> = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM ${ident(TABLE)} WHERE ${ident(COLUMN)} IS NOT NULL`,
  )
  console.log(`  ${Number(n)} sale(s) currently carry a client reference`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
