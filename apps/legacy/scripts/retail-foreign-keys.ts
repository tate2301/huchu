/**
 * Gives the retail tables real referential integrity.
 *
 *   npx tsx scripts/retail-foreign-keys.ts            # report only
 *   npx tsx scripts/retail-foreign-keys.ts --apply    # add the constraints
 *
 * R-1.4. Not one of the twelve retail models has a `Company` relation, and
 * `siteId`, `cashierId`, `inventoryItemId` and `catalogItemId` are plain
 * `String` columns with an index and nothing behind them. Access is enforced
 * procedurally — `ensureInventoryItemAccess` on every call — which works right
 * up until somebody deletes an inventory item, at which point the sale lines
 * that referenced it are silently orphaned and the margin report starts lying.
 *
 * This is the change that also collapses the hand-rolled joins: `catalog/route.ts`
 * fetches items, then fetches inventory items and sites by id list and stitches
 * them together with `Map`s, because there is no relation to `include`.
 *
 * ── Why a script ───────────────────────────────────────────────────────────
 *
 * `prisma db push` cannot run against this database (P1001 — only a Neon pooler
 * host is configured). More to the point, adding a foreign key to a populated
 * table is not a safe blind operation: if a single row points at something that
 * no longer exists, the `ALTER TABLE` fails and you learn about it halfway
 * through a list of thirty constraints.
 *
 * So this runs in report mode by default. It counts the orphans behind every
 * constraint it intends to add and prints them. `--apply` refuses outright if
 * any constraint would fail, rather than adding the twenty that would work and
 * leaving the schema in a state no one can describe.
 *
 * Idempotent: a constraint that already exists is skipped by name.
 */

import "@/scripts/lib/env";

import { prisma } from "@corelithzw/db/client"

/**
 * `SET NULL` needs a nullable column; `RESTRICT` refuses the delete instead.
 *
 * The choices below are deliberate and they are not uniform:
 *
 * - **Company → CASCADE.** Removing a tenant removes its trade. Nothing else
 *   makes sense, and it is what every other module does.
 * - **Site → RESTRICT.** A branch with sales against it must not be deletable.
 *   The shop closing is a status change, not a row disappearing.
 * - **User → SET NULL** where the column allows it. A cashier leaving must never
 *   erase the sales they rang up; the row keeps `cashierName`, which is what a
 *   reprinted slip needs anyway. Where the column is NOT NULL (a shift has a
 *   cashier by definition) it is RESTRICT.
 * - **InventoryItem → RESTRICT.** Deleting a stocked item that has been sold is
 *   the exact silent-orphan case this ticket exists to close.
 * - **Self-references (`sourceSaleId`, `sourceLineId`) → SET NULL.** A refund
 *   points back at the sale it reverses. Losing that link is bad; blocking the
 *   parent's deletion because of it is worse, and both are already nullable.
 */
type Fk = {
  table: string
  column: string
  refTable: string
  refColumn?: string
  onDelete: "CASCADE" | "RESTRICT" | "SET NULL"
}

const FOREIGN_KEYS: readonly Fk[] = [
  // Every retail table is a tenant's.
  ...(
    [
      "RetailRegister",
      "RetailCatalogItem",
      "RetailPromotion",
      "RetailPurchaseOrder",
      "RetailPurchaseOrderLine",
      "RetailGoodsReceipt",
      "RetailGoodsReceiptLine",
      "RetailShift",
      "RetailHeldCart",
      "RetailSale",
      "RetailSaleLine",
      "RetailSalePayment",
    ] as const
  ).map((table): Fk => ({ table, column: "companyId", refTable: "Company", onDelete: "CASCADE" })),

  // Branches.
  { table: "RetailRegister", column: "siteId", refTable: "Site", onDelete: "RESTRICT" },
  { table: "RetailCatalogItem", column: "siteId", refTable: "Site", onDelete: "RESTRICT" },
  { table: "RetailPurchaseOrder", column: "siteId", refTable: "Site", onDelete: "RESTRICT" },
  { table: "RetailGoodsReceipt", column: "siteId", refTable: "Site", onDelete: "RESTRICT" },
  { table: "RetailShift", column: "siteId", refTable: "Site", onDelete: "RESTRICT" },
  { table: "RetailSale", column: "siteId", refTable: "Site", onDelete: "RESTRICT" },

  // People.
  { table: "RetailPurchaseOrder", column: "createdById", refTable: "User", onDelete: "SET NULL" },
  { table: "RetailGoodsReceipt", column: "receivedById", refTable: "User", onDelete: "SET NULL" },
  { table: "RetailSale", column: "cashierId", refTable: "User", onDelete: "SET NULL" },
  { table: "RetailShift", column: "cashierId", refTable: "User", onDelete: "RESTRICT" },
  { table: "RetailHeldCart", column: "cashierId", refTable: "User", onDelete: "RESTRICT" },

  // Stock. The silent-orphan case.
  {
    table: "RetailCatalogItem",
    column: "inventoryItemId",
    refTable: "InventoryItem",
    onDelete: "RESTRICT",
  },
  {
    table: "RetailPurchaseOrderLine",
    column: "inventoryItemId",
    refTable: "InventoryItem",
    onDelete: "RESTRICT",
  },
  {
    table: "RetailGoodsReceiptLine",
    column: "inventoryItemId",
    refTable: "InventoryItem",
    onDelete: "RESTRICT",
  },
  {
    table: "RetailSaleLine",
    column: "inventoryItemId",
    refTable: "InventoryItem",
    onDelete: "RESTRICT",
  },

  // Documents pointing at documents.
  { table: "RetailHeldCart", column: "shiftId", refTable: "RetailShift", onDelete: "CASCADE" },
  { table: "RetailSale", column: "shiftId", refTable: "RetailShift", onDelete: "SET NULL" },
  { table: "RetailSale", column: "sourceSaleId", refTable: "RetailSale", onDelete: "SET NULL" },
  { table: "RetailSaleLine", column: "sourceLineId", refTable: "RetailSaleLine", onDelete: "SET NULL" },
  {
    table: "RetailSaleLine",
    column: "catalogItemId",
    refTable: "RetailCatalogItem",
    onDelete: "SET NULL",
  },
]

function ident(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) {
    throw new Error(`Refusing to build SQL for an unexpected identifier: ${value}`)
  }
  return `"${value}"`
}

function constraintIdent(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Refusing to build SQL for an unexpected constraint name: ${value}`)
  }
  return `"${value}"`
}

/** Prisma's own naming convention, so a later `db push` recognises these. */
function constraintName(fk: Fk) {
  return `${fk.table}_${fk.column}_fkey`
}

async function count(sql: string) {
  const rows: Array<{ n: bigint }> = await prisma.$queryRawUnsafe(sql)
  return Number(rows[0]?.n ?? 0)
}

async function constraintExists(name: string) {
  const rows: Array<{ n: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM information_schema.table_constraints
    WHERE constraint_name = ${name} AND constraint_type = 'FOREIGN KEY'
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

/** Rows pointing at a parent that is not there. NULLs are fine and excluded. */
async function orphanCount(fk: Fk) {
  const refColumn = fk.refColumn ?? "id"
  return count(
    `SELECT COUNT(*) AS n FROM ${ident(fk.table)} child
     LEFT JOIN ${ident(fk.refTable)} parent ON parent.${ident(refColumn)} = child.${ident(fk.column)}
     WHERE child.${ident(fk.column)} IS NOT NULL AND parent.${ident(refColumn)} IS NULL`,
  )
}

async function main() {
  const apply = process.argv.includes("--apply")
  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (/\bprod(uction)?\b/.test(databaseUrl)) {
    throw new Error("DATABASE_URL looks like production. Refusing to alter tables.")
  }

  const pending: Fk[] = []
  const blocked: string[] = []
  const misdeclared: string[] = []

  for (const fk of FOREIGN_KEYS) {
    const name = constraintName(fk)
    const label = `${fk.table}.${fk.column} -> ${fk.refTable} (${fk.onDelete})`

    if (await constraintExists(name)) {
      console.log(`  exists   ${label}`)
      continue
    }

    // SET NULL on a NOT NULL column is a constraint Postgres accepts and then
    // fails on at delete time, which is the worst of both. Catch it here.
    if (fk.onDelete === "SET NULL" && !(await columnIsNullable(fk.table, fk.column))) {
      misdeclared.push(`${label} — SET NULL declared on a NOT NULL column`)
      continue
    }

    const orphans = await orphanCount(fk)
    if (orphans > 0) {
      console.log(`  BLOCKED  ${label} — ${orphans} orphan(s)`)
      blocked.push(`${label}: ${orphans}`)
      continue
    }

    console.log(`  ready    ${label}`)
    pending.push(fk)
  }

  console.log(
    `\n${pending.length} constraint(s) ready, ${blocked.length} blocked, ` +
      `${misdeclared.length} misdeclared.`,
  )

  if (misdeclared.length > 0) {
    console.error(`\nFix these declarations before running again:`)
    for (const line of misdeclared) console.error(`  ${line}`)
    process.exit(1)
  }

  if (blocked.length > 0) {
    console.error(
      `\nRefusing to apply. These would fail on rows that point at nothing:\n  ` +
        `${blocked.join("\n  ")}\n\nClean the orphans first. Adding the constraints that happen ` +
        `to work and skipping the rest leaves a schema nobody can describe.`,
    )
    process.exit(1)
  }

  if (!apply) {
    console.log(`\nReport only. Re-run with --apply to add them.`)
    return
  }

  for (const fk of pending) {
    const name = constraintName(fk)
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${ident(fk.table)} ADD CONSTRAINT ${constraintIdent(name)} ` +
        `FOREIGN KEY (${ident(fk.column)}) REFERENCES ${ident(fk.refTable)} ` +
        `(${ident(fk.refColumn ?? "id")}) ON DELETE ${fk.onDelete} ON UPDATE CASCADE`,
    )
    console.log(`  added ${name}`)
  }

  // Read it back out of the catalogue, not the schema file.
  const missing: string[] = []
  for (const fk of FOREIGN_KEYS) {
    if (!(await constraintExists(constraintName(fk)))) missing.push(constraintName(fk))
  }
  if (missing.length > 0) {
    console.error(`\nThese did not take: ${missing.join(", ")}`)
    process.exit(1)
  }
  console.log(`\nAll ${FOREIGN_KEYS.length} retail foreign keys are in place.`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
