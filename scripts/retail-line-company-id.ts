/**
 * Puts `companyId` on the four retail line tables.
 *
 *   npx tsx scripts/retail-line-company-id.ts
 *
 * R-1.3. `RetailSaleLine`, `RetailSalePayment`, `RetailPurchaseOrderLine` and
 * `RetailGoodsReceiptLine` are the four retail tables with no tenant column of
 * their own — and they are precisely the four holding the money and the cost.
 * All four are reached by direct queries today, which is the condition
 * `building-a-vertical.md` §1a names: if a table can be reached by a query, it
 * carries its own `companyId`. Until it does, every one of those queries is one
 * forgotten join away from serving another tenant's margins.
 *
 * `prisma db push` cannot run against this database (P1001 — only a Neon pooler
 * host is configured) and would refuse a required column on a populated table
 * regardless. So: add nullable, backfill from the parent, then promote to NOT
 * NULL, which is the only order that works on a table with rows in it.
 *
 * The promotion is guarded. If any line has no parent to inherit from, the
 * backfill leaves a NULL behind and `SET NOT NULL` would fail halfway through
 * the run; this script counts the orphans first and refuses before it alters
 * anything, so a partial migration is not a state you can reach.
 *
 * Idempotent: `ADD COLUMN IF NOT EXISTS`, a backfill that only touches NULLs,
 * and `SET NOT NULL` is skipped when the column is already NOT NULL.
 */

import "dotenv/config"

import { prisma } from "@/lib/prisma"

type LineSpec = {
  /** The table gaining the column. */
  table: string
  /** The FK on `table` pointing at its parent. */
  parentKey: string
  /** The table the tenant is inherited from. */
  parentTable: string
  /** Indexes to create once the column is populated. */
  indexes: readonly (readonly string[])[]
}

const LINES: readonly LineSpec[] = [
  {
    table: "RetailSaleLine",
    parentKey: "saleId",
    parentTable: "RetailSale",
    // The product-level reports (best sellers, margin by line) filter on the
    // tenant and group by item; without the composite they scan every line in
    // the table, and this is the largest of the four by an order of magnitude.
    indexes: [["companyId", "inventoryItemId"]],
  },
  {
    table: "RetailSalePayment",
    parentKey: "saleId",
    parentTable: "RetailSale",
    // Cash-up sums a day's takings per tender. Same reasoning.
    indexes: [["companyId", "tenderType"]],
  },
  {
    table: "RetailPurchaseOrderLine",
    parentKey: "purchaseOrderId",
    parentTable: "RetailPurchaseOrder",
    indexes: [["companyId"]],
  },
  {
    table: "RetailGoodsReceiptLine",
    parentKey: "receiptId",
    parentTable: "RetailGoodsReceipt",
    indexes: [["companyId"]],
  },
]

const COLUMN = "companyId"

function ident(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) {
    throw new Error(`Refusing to build SQL for an unexpected identifier: ${value}`)
  }
  return `"${value}"`
}

/**
 * Index names carry underscores by Prisma's own convention
 * (`Table_col_col_idx`), which `ident` rejects. Same guard, one more character —
 * still no quotes, no spaces, nothing that could close the identifier early.
 */
function indexIdent(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Refusing to build SQL for an unexpected index name: ${value}`)
  }
  return `"${value}"`
}

async function count(sql: string) {
  const rows: Array<{ n: bigint }> = await prisma.$queryRawUnsafe(sql)
  return Number(rows[0]?.n ?? 0)
}

async function columnExists(table: string, column: string) {
  const rows: Array<{ n: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
  `
  return Number(rows[0]?.n ?? 0) > 0
}

async function columnIsNullable(table: string, column: string) {
  const rows: Array<{ is_nullable: string }> = await prisma.$queryRaw`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
  `
  return rows[0]?.is_nullable === "YES"
}

/**
 * Lines whose parent row does not exist. These cannot be given a tenant, so
 * they block the NOT NULL promotion. Counted before anything is altered.
 */
async function orphanCount(spec: LineSpec) {
  return count(
    `SELECT COUNT(*) AS n FROM ${ident(spec.table)} child
     LEFT JOIN ${ident(spec.parentTable)} parent ON parent."id" = child.${ident(spec.parentKey)}
     WHERE parent."id" IS NULL`,
  )
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (/\bprod(uction)?\b/.test(databaseUrl)) {
    throw new Error("DATABASE_URL looks like production. Refusing to alter tables.")
  }

  // ---- Refuse before altering anything --------------------------------------
  const orphans: string[] = []
  for (const spec of LINES) {
    const n = await orphanCount(spec)
    console.log(`${spec.table}: ${n} orphan(s) with no ${spec.parentTable}`)
    if (n > 0) orphans.push(`${spec.table} (${n})`)
  }
  if (orphans.length > 0) {
    console.error(
      `\nRefusing to migrate. These tables hold rows with no parent to inherit a tenant from: ` +
        `${orphans.join(", ")}. Delete or repair them first — promoting the column to NOT NULL ` +
        `would fail partway through and leave the schema half-migrated.`,
    )
    process.exit(1)
  }

  // ---- Add, backfill, promote, index ----------------------------------------
  for (const spec of LINES) {
    const label = `"${spec.table}"."${COLUMN}"`

    if (await columnExists(spec.table, COLUMN)) {
      console.log(`\n${label} already exists.`)
    } else {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE ${ident(spec.table)} ADD COLUMN IF NOT EXISTS ${ident(COLUMN)} TEXT`,
      )
      console.log(`\nadded ${label} TEXT (nullable, for now)`)
    }

    const filled = await count(
      `WITH updated AS (
         UPDATE ${ident(spec.table)} child
         SET ${ident(COLUMN)} = parent.${ident(COLUMN)}
         FROM ${ident(spec.parentTable)} parent
         WHERE parent."id" = child.${ident(spec.parentKey)}
           AND child.${ident(COLUMN)} IS NULL
         RETURNING 1
       ) SELECT COUNT(*) AS n FROM updated`,
    )
    console.log(`  backfilled ${filled} row(s) from ${spec.parentTable}`)

    const stillNull = await count(
      `SELECT COUNT(*) AS n FROM ${ident(spec.table)} WHERE ${ident(COLUMN)} IS NULL`,
    )
    if (stillNull > 0) {
      console.error(`  ${stillNull} row(s) still NULL after backfill. Stopping.`)
      process.exit(1)
    }

    if (await columnIsNullable(spec.table, COLUMN)) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE ${ident(spec.table)} ALTER COLUMN ${ident(COLUMN)} SET NOT NULL`,
      )
      console.log(`  promoted to NOT NULL`)
    } else {
      console.log(`  already NOT NULL`)
    }

    for (const columns of spec.indexes) {
      const name = `${spec.table}_${columns.join("_")}_idx`
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS ${indexIdent(name)} ON ${ident(spec.table)} (${columns
          .map(ident)
          .join(", ")})`,
      )
      console.log(`  index ${name}`)
    }
  }

  // ---- Read it back from the catalogue, not the schema file ------------------
  const bad: string[] = []
  for (const spec of LINES) {
    if (!(await columnExists(spec.table, COLUMN))) {
      bad.push(`"${spec.table}"."${COLUMN}" missing`)
      continue
    }
    if (await columnIsNullable(spec.table, COLUMN)) {
      bad.push(`"${spec.table}"."${COLUMN}" is still nullable`)
    }
  }
  if (bad.length > 0) {
    console.error(`\nThese did not take: ${bad.join(", ")}`)
    process.exit(1)
  }
  console.log(`\nAll four retail line tables carry a NOT NULL companyId.`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
