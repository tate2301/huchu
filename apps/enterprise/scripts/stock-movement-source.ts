/**
 * Gives `StockMovement` its own provenance.
 *
 *   npx tsx scripts/stock-movement-source.ts
 *
 * S-2. `recordStockMovement` (and `recordRetailInventoryMovement` before it) has
 * always accepted `sourceType`/`sourceId` and forwarded them to accounting only.
 * The movement row itself could not say what caused it: a stock take, a sale and
 * a goods receipt all landed as bare `ADJUSTMENT`/`ISSUE`/`RECEIPT` rows, and the
 * only way back to the causing document was through the journal — which is not
 * written at all when a movement is worth nothing, so for those the trail simply
 * stopped.
 *
 * `sourceType` reuses the existing `AccountingSourceType` Postgres enum rather
 * than minting a second vocabulary for the same idea. `sourceId` is plain text
 * and deliberately not a foreign key: it points at a dozen different tables, and
 * some callers key a line within a document (`<receiptId>:<itemId>`).
 *
 * `prisma db push` cannot run against this database — only a Neon pooler host is
 * configured, so it dies with P1001 before it compares anything. Both columns are
 * additive and nullable, which is the safe shape on a populated table: existing
 * rows keep a NULL, which is the truth about them (nobody recorded a source).
 * There is nothing to backfill — the causing document was never stored anywhere
 * on the row, so inventing one would be fabricating an audit trail.
 *
 * Idempotent: `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.
 */

import "@/scripts/lib/env";

import { prisma } from "@corelithzw/db/client"

const TABLE = "StockMovement"
const ENUM_TYPE = "AccountingSourceType"

type ColumnSpec = {
  column: string
  definition: string
}

const COLUMNS: readonly ColumnSpec[] = [
  { column: "sourceType", definition: `"${ENUM_TYPE}"` },
  { column: "sourceId", definition: "TEXT" },
]

const INDEX_COLUMNS = ["sourceType", "sourceId"] as const
const INDEX_NAME = `${TABLE}_${INDEX_COLUMNS.join("_")}_idx`

function ident(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) {
    throw new Error(`Refusing to build SQL for an unexpected identifier: ${value}`)
  }
  return `"${value}"`
}

/**
 * Index names carry underscores by Prisma's own convention
 * (`Table_col_col_idx`), which `ident` rejects. Same guard, one more character.
 */
function indexIdent(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Refusing to build SQL for an unexpected index name: ${value}`)
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

async function columnType(table: string, column: string) {
  const rows: Array<{ data_type: string; udt_name: string; is_nullable: string }> = await prisma.$queryRaw`
    SELECT data_type, udt_name, is_nullable FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
  `
  return rows[0] ?? null
}

async function enumTypeExists(name: string) {
  const rows: Array<{ n: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM pg_type WHERE typname = ${name} AND typtype = 'e'
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

  // The column borrows an enum type that must already be in the database. If the
  // schema has drifted, say so here rather than emitting SQL that fails halfway.
  if (!(await enumTypeExists(ENUM_TYPE))) {
    console.error(
      `The "${ENUM_TYPE}" enum type is not in this database, so "${TABLE}"."sourceType" ` +
        `has nothing to be typed as. Sync the accounting enums first.`,
    )
    process.exit(1)
  }
  console.log(`enum type "${ENUM_TYPE}" is present.`)

  let added = 0
  for (const spec of COLUMNS) {
    const label = `"${TABLE}"."${spec.column}"`
    if (await columnExists(TABLE, spec.column)) {
      console.log(`${label} already exists.`)
      continue
    }
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${ident(TABLE)} ADD COLUMN IF NOT EXISTS ${ident(spec.column)} ${spec.definition}`,
    )
    console.log(`added ${label} ${spec.definition} (nullable)`)
    added += 1
  }

  if (await indexExists(INDEX_NAME)) {
    console.log(`index ${INDEX_NAME} already exists.`)
  } else {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS ${indexIdent(INDEX_NAME)} ON ${ident(TABLE)} (${INDEX_COLUMNS.map(
        ident,
      ).join(", ")})`,
    )
    console.log(`created index ${INDEX_NAME}`)
  }

  const total: Array<{ n: bigint }> = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM ${ident(TABLE)}`,
  )
  const unsourced: Array<{ n: bigint }> = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM ${ident(TABLE)} WHERE "sourceType" IS NULL`,
  )
  console.log(
    `\n${added} column(s) added. ${Number(unsourced[0]?.n ?? 0)} of ${Number(
      total[0]?.n ?? 0,
    )} existing movement(s) carry no source — nothing to backfill from, so they stay NULL.`,
  )

  // ---- Read it back from the catalogue, not the schema file ------------------
  const bad: string[] = []
  for (const spec of COLUMNS) {
    const found = await columnType(TABLE, spec.column)
    if (!found) {
      bad.push(`"${TABLE}"."${spec.column}" missing`)
      continue
    }
    if (found.is_nullable !== "YES") {
      bad.push(`"${TABLE}"."${spec.column}" is NOT NULL — history has no source to give it`)
    }
    console.log(`"${TABLE}"."${spec.column}" -> ${found.data_type} (${found.udt_name}), nullable=${found.is_nullable}`)
  }
  if (!(await indexExists(INDEX_NAME))) {
    bad.push(`index ${INDEX_NAME} missing`)
  } else {
    console.log(`index ${INDEX_NAME} -> present`)
  }

  if (bad.length > 0) {
    console.error(`\nThese did not take: ${bad.join(", ")}`)
    process.exit(1)
  }
  console.log(`\nStockMovement carries its own sourceType/sourceId.`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
