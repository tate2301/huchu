/**
 * Creates `RetailZReport` — the frozen end-of-day document.
 *
 *   npx tsx scripts/retail-z-report.ts
 *
 * S-7.2. A Z-report is the fiscal close of one register for one trading day: taken
 * once, final, and the day's takings are banked against it. "Final, can't be
 * changed" is only true of something written down, so the figures are persisted
 * here rather than recomputed from `RetailSale` on every request — a view would
 * quietly restate the document the moment a sale was voided or a price moved.
 *
 * ── Why a script ───────────────────────────────────────────────────────────
 *
 * `prisma db push` cannot reach this database (P1001 — only a Neon pooler host is
 * configured), the same reason `scripts/retail-cash-movements.ts`,
 * `scripts/retail-line-company-id.ts` and `scripts/retail-foreign-keys.ts` exist.
 * So the DDL is written out here in the order Postgres needs it: the table, then
 * the foreign keys, then the unique constraints, then the indexes.
 *
 * Idempotent throughout: `IF NOT EXISTS` on the table, the columns and the
 * indexes, and each constraint is skipped when one of that name already exists.
 * A second run is a no-op and prints `exists` for everything.
 *
 * The verification at the end reads `information_schema` and `pg_indexes` rather
 * than the schema file. A green run of Prisma is not evidence that the database
 * changed.
 *
 * ── The two unique constraints are the ticket ──────────────────────────────
 *
 * `(companyId, registerCode, businessDate)` is the re-run rule, enforced by
 * Postgres rather than by a read-then-write that two managers can lose. The
 * service catches the resulting `P2002` and hands back the report that already
 * exists. `(companyId, reportNo)` pins the derived number — `Z-TILL02-20260814` —
 * so a reprint cannot arrive under a new identity.
 */

import "dotenv/config"

import { prisma } from "@/lib/prisma"

const TABLE = "RetailZReport"

/**
 * Column definitions, in schema order.
 *
 * Every money figure is `numeric(14,2)` and the derived VAT rate is
 * `numeric(5,2)` — the two scales `lib/money.ts` names as `MONEY_SCALE` and
 * `PERCENT_SCALE`, and the ones every other retail column already carries.
 *
 * `businessDate` is a bare `DATE`, not a timestamp. A trading day has no time and
 * no zone; storing one would invite a comparison against an instant, which is how
 * a shift opened at 22:00 ends up on the wrong report.
 *
 * The four `JSONB` columns are the rendered tables — tender mix, best sellers,
 * cash movements, and the per-shift breakdown. They are `NOT NULL` with an empty
 * array default, because "no tenders" is `[]` and a null there would mean "we did
 * not record whether anything was tendered", which is not a state this document
 * may be in.
 */
const COLUMNS: ReadonlyArray<{ name: string; definition: string }> = [
  { name: "id", definition: `"id" TEXT NOT NULL` },
  { name: "companyId", definition: `"companyId" TEXT NOT NULL` },
  { name: "reportNo", definition: `"reportNo" TEXT NOT NULL` },
  { name: "businessDate", definition: `"businessDate" DATE NOT NULL` },
  { name: "registerCode", definition: `"registerCode" TEXT NOT NULL` },
  { name: "registerName", definition: `"registerName" TEXT NOT NULL` },
  { name: "siteId", definition: `"siteId" TEXT NOT NULL` },
  { name: "currency", definition: `"currency" TEXT NOT NULL DEFAULT 'USD'` },
  {
    name: "generatedAt",
    definition: `"generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
  },
  { name: "generatedById", definition: `"generatedById" TEXT` },
  { name: "generatedByName", definition: `"generatedByName" TEXT` },
  { name: "shiftCount", definition: `"shiftCount" INTEGER NOT NULL DEFAULT 0` },
  { name: "saleCount", definition: `"saleCount" INTEGER NOT NULL DEFAULT 0` },
  { name: "refundCount", definition: `"refundCount" INTEGER NOT NULL DEFAULT 0` },
  { name: "voidCount", definition: `"voidCount" INTEGER NOT NULL DEFAULT 0` },
  { name: "itemCount", definition: `"itemCount" INTEGER NOT NULL DEFAULT 0` },
  { name: "grossSales", definition: `"grossSales" DECIMAL(14,2) NOT NULL DEFAULT 0` },
  { name: "discountTotal", definition: `"discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0` },
  { name: "netSales", definition: `"netSales" DECIMAL(14,2) NOT NULL DEFAULT 0` },
  { name: "taxTotal", definition: `"taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0` },
  { name: "taxRatePercent", definition: `"taxRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 0` },
  { name: "grossTakings", definition: `"grossTakings" DECIMAL(14,2) NOT NULL DEFAULT 0` },
  { name: "refundTotal", definition: `"refundTotal" DECIMAL(14,2) NOT NULL DEFAULT 0` },
  { name: "voidTotal", definition: `"voidTotal" DECIMAL(14,2) NOT NULL DEFAULT 0` },
  { name: "openingFloat", definition: `"openingFloat" DECIMAL(14,2) NOT NULL DEFAULT 0` },
  { name: "cashTakings", definition: `"cashTakings" DECIMAL(14,2) NOT NULL DEFAULT 0` },
  { name: "cashDropTotal", definition: `"cashDropTotal" DECIMAL(14,2) NOT NULL DEFAULT 0` },
  { name: "cashTopUpTotal", definition: `"cashTopUpTotal" DECIMAL(14,2) NOT NULL DEFAULT 0` },
  { name: "cashPayoutTotal", definition: `"cashPayoutTotal" DECIMAL(14,2) NOT NULL DEFAULT 0` },
  { name: "cashMovementNet", definition: `"cashMovementNet" DECIMAL(14,2) NOT NULL DEFAULT 0` },
  { name: "expectedCash", definition: `"expectedCash" DECIMAL(14,2) NOT NULL DEFAULT 0` },
  { name: "countedCash", definition: `"countedCash" DECIMAL(14,2) NOT NULL DEFAULT 0` },
  { name: "cashVariance", definition: `"cashVariance" DECIMAL(14,2) NOT NULL DEFAULT 0` },
  { name: "tenderBreakdown", definition: `"tenderBreakdown" JSONB NOT NULL DEFAULT '[]'::jsonb` },
  { name: "topItems", definition: `"topItems" JSONB NOT NULL DEFAULT '[]'::jsonb` },
  { name: "cashMovements", definition: `"cashMovements" JSONB NOT NULL DEFAULT '[]'::jsonb` },
  { name: "shifts", definition: `"shifts" JSONB NOT NULL DEFAULT '[]'::jsonb` },
  {
    name: "createdAt",
    definition: `"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
  },
]

/**
 * `onDelete`, matching `scripts/retail-foreign-keys.ts` choice for choice:
 *
 * - **Company → CASCADE.** Removing a tenant removes its trade. What every retail
 *   table does.
 * - **Site → RESTRICT.** A branch with a closed trading day against it must not be
 *   deletable; the shop closing is a status change, not a row disappearing. This
 *   is the same rule `RetailShift.siteId` and `RetailSale.siteId` already carry,
 *   and it matters more here — a Z-report is the document a deposit was banked
 *   against.
 * - **User → SET NULL.** A manager leaving must never erase the day they closed.
 *   `generatedByName` is denormalised for exactly this, the same bargain
 *   `RetailSale.cashierId` and `RetailCashMovement.recordedById` already make, and
 *   the column is nullable so SET NULL is available.
 *
 * There is deliberately **no foreign key to `RetailShift`**. The shifts a report
 * covers are recorded in its `shifts` JSON by id, number and cashier name, and
 * that is a snapshot rather than a live link on purpose: the report must read the
 * same after a shift row is gone, and a cascade from a shift would delete a filed
 * fiscal document.
 */
const FOREIGN_KEYS: ReadonlyArray<{
  column: string
  refTable: string
  onDelete: "CASCADE" | "RESTRICT" | "SET NULL"
}> = [
  { column: "companyId", refTable: "Company", onDelete: "CASCADE" },
  { column: "siteId", refTable: "Site", onDelete: "RESTRICT" },
  { column: "generatedById", refTable: "User", onDelete: "SET NULL" },
]

/**
 * The first is the whole re-run rule. Postgres refuses a second report for a
 * register-day, so two managers pressing "End-of-day report" at the same moment
 * get one document instead of a race between two reads.
 *
 * The second pins the derived number. `reportNo` is a function of the same two
 * keys, so this constraint can only ever fail if that function stopped being one.
 */
const UNIQUES: ReadonlyArray<readonly string[]> = [
  ["companyId", "registerCode", "businessDate"],
  ["companyId", "reportNo"],
]

/** The list screen reads a company's days; the second narrows it to one branch. */
const INDEXES: ReadonlyArray<readonly string[]> = [
  ["companyId", "businessDate"],
  ["companyId", "siteId", "businessDate"],
]

function ident(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) {
    throw new Error(`Refusing to build SQL for an unexpected identifier: ${value}`)
  }
  return `"${value}"`
}

function underscoreIdent(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Refusing to build SQL for an unexpected name: ${value}`)
  }
  return `"${value}"`
}

async function tableExists(name: string) {
  const rows: Array<{ n: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${name}
  `
  return Number(rows[0]?.n ?? 0) > 0
}

async function columnFacts(table: string, column: string) {
  const rows: Array<{
    data_type: string
    udt_name: string
    is_nullable: string
    numeric_precision: number | null
    numeric_scale: number | null
  }> = await prisma.$queryRaw`
    SELECT data_type, udt_name, is_nullable, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
  `
  return rows[0] ?? null
}

async function constraintExists(name: string) {
  const rows: Array<{ n: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM information_schema.table_constraints
    WHERE constraint_name = ${name} AND constraint_type = 'FOREIGN KEY'
  `
  return Number(rows[0]?.n ?? 0) > 0
}

async function indexExists(name: string) {
  const rows: Array<{ n: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM pg_indexes WHERE schemaname = 'public' AND indexname = ${name}
  `
  return Number(rows[0]?.n ?? 0) > 0
}

async function uniqueIndexExists(name: string) {
  const rows: Array<{ n: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(*) AS n
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = ${name} AND i.indisunique
  `
  return Number(rows[0]?.n ?? 0) > 0
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (/\bprod(uction)?\b/.test(databaseUrl)) {
    throw new Error("DATABASE_URL looks like production. Refusing to alter tables.")
  }

  // ---- The table -------------------------------------------------------------
  if (await tableExists(TABLE)) {
    console.log(`table "${TABLE}" exists`)
  } else {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS ${ident(TABLE)} (
         ${COLUMNS.map((column) => column.definition).join(",\n         ")},
         CONSTRAINT ${underscoreIdent(`${TABLE}_pkey`)} PRIMARY KEY ("id")
       )`,
    )
    console.log(`created table "${TABLE}"`)
  }

  // A table created by an earlier version of this script is brought forward rather
  // than left half-shaped.
  for (const column of COLUMNS) {
    if (await columnFacts(TABLE, column.name)) continue
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${ident(TABLE)} ADD COLUMN IF NOT EXISTS ${column.definition}`,
    )
    console.log(`  added column "${column.name}"`)
  }

  // ---- Foreign keys ----------------------------------------------------------
  for (const fk of FOREIGN_KEYS) {
    const name = `${TABLE}_${fk.column}_fkey`
    const label = `${TABLE}.${fk.column} -> ${fk.refTable} (${fk.onDelete})`
    if (await constraintExists(name)) {
      console.log(`  exists   ${label}`)
      continue
    }
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${ident(TABLE)} ADD CONSTRAINT ${underscoreIdent(name)} ` +
        `FOREIGN KEY (${ident(fk.column)}) REFERENCES ${ident(fk.refTable)} ("id") ` +
        `ON DELETE ${fk.onDelete} ON UPDATE CASCADE`,
    )
    console.log(`  added    ${label}`)
  }

  // ---- Unique constraints ----------------------------------------------------
  // Created as unique *indexes* under the name Prisma expects for an `@@unique`,
  // so the client's `where: { companyId_registerCode_businessDate: ... }` resolves
  // and a duplicate insert raises P2002 rather than succeeding.
  for (const columns of UNIQUES) {
    const name = `${TABLE}_${columns.join("_")}_key`
    if (await indexExists(name)) {
      console.log(`  exists   unique ${name}`)
      continue
    }
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${underscoreIdent(name)} ON ${ident(TABLE)} ` +
        `(${columns.map(ident).join(", ")})`,
    )
    console.log(`  added    unique ${name}`)
  }

  // ---- Indexes ---------------------------------------------------------------
  for (const columns of INDEXES) {
    const name = `${TABLE}_${columns.join("_")}_idx`
    if (await indexExists(name)) {
      console.log(`  exists   index ${name}`)
      continue
    }
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS ${underscoreIdent(name)} ON ${ident(TABLE)} ` +
        `(${columns.map(ident).join(", ")})`,
    )
    console.log(`  added    index ${name}`)
  }

  // ---- Read it back out of the catalogue, not the schema file ----------------
  const bad: string[] = []

  const expectedFacts: Record<
    string,
    { udt: string; nullable: boolean; numeric?: [number, number] }
  > = {
    id: { udt: "text", nullable: false },
    companyId: { udt: "text", nullable: false },
    reportNo: { udt: "text", nullable: false },
    businessDate: { udt: "date", nullable: false },
    registerCode: { udt: "text", nullable: false },
    registerName: { udt: "text", nullable: false },
    siteId: { udt: "text", nullable: false },
    currency: { udt: "text", nullable: false },
    generatedAt: { udt: "timestamp", nullable: false },
    generatedById: { udt: "text", nullable: true },
    generatedByName: { udt: "text", nullable: true },
    shiftCount: { udt: "int4", nullable: false },
    saleCount: { udt: "int4", nullable: false },
    refundCount: { udt: "int4", nullable: false },
    voidCount: { udt: "int4", nullable: false },
    itemCount: { udt: "int4", nullable: false },
    grossSales: { udt: "numeric", nullable: false, numeric: [14, 2] },
    discountTotal: { udt: "numeric", nullable: false, numeric: [14, 2] },
    netSales: { udt: "numeric", nullable: false, numeric: [14, 2] },
    taxTotal: { udt: "numeric", nullable: false, numeric: [14, 2] },
    taxRatePercent: { udt: "numeric", nullable: false, numeric: [5, 2] },
    grossTakings: { udt: "numeric", nullable: false, numeric: [14, 2] },
    refundTotal: { udt: "numeric", nullable: false, numeric: [14, 2] },
    voidTotal: { udt: "numeric", nullable: false, numeric: [14, 2] },
    openingFloat: { udt: "numeric", nullable: false, numeric: [14, 2] },
    cashTakings: { udt: "numeric", nullable: false, numeric: [14, 2] },
    cashDropTotal: { udt: "numeric", nullable: false, numeric: [14, 2] },
    cashTopUpTotal: { udt: "numeric", nullable: false, numeric: [14, 2] },
    cashPayoutTotal: { udt: "numeric", nullable: false, numeric: [14, 2] },
    cashMovementNet: { udt: "numeric", nullable: false, numeric: [14, 2] },
    expectedCash: { udt: "numeric", nullable: false, numeric: [14, 2] },
    countedCash: { udt: "numeric", nullable: false, numeric: [14, 2] },
    cashVariance: { udt: "numeric", nullable: false, numeric: [14, 2] },
    tenderBreakdown: { udt: "jsonb", nullable: false },
    topItems: { udt: "jsonb", nullable: false },
    cashMovements: { udt: "jsonb", nullable: false },
    shifts: { udt: "jsonb", nullable: false },
    createdAt: { udt: "timestamp", nullable: false },
  }

  for (const [column, expected] of Object.entries(expectedFacts)) {
    const facts = await columnFacts(TABLE, column)
    if (!facts) {
      bad.push(`"${TABLE}"."${column}" is missing`)
      continue
    }
    if (facts.udt_name !== expected.udt) {
      bad.push(`"${TABLE}"."${column}" is ${facts.udt_name}, expected ${expected.udt}`)
    }
    if ((facts.is_nullable === "YES") !== expected.nullable) {
      bad.push(
        `"${TABLE}"."${column}" is ${facts.is_nullable === "YES" ? "nullable" : "NOT NULL"}, ` +
          `expected the other`,
      )
    }
    if (expected.numeric) {
      const [precision, scale] = expected.numeric
      if (facts.numeric_precision !== precision || facts.numeric_scale !== scale) {
        bad.push(
          `"${TABLE}"."${column}" is numeric(${facts.numeric_precision},${facts.numeric_scale}), ` +
            `expected numeric(${precision},${scale})`,
        )
      }
    }
  }

  for (const fk of FOREIGN_KEYS) {
    if (!(await constraintExists(`${TABLE}_${fk.column}_fkey`))) {
      bad.push(`${TABLE}_${fk.column}_fkey did not take`)
    }
  }
  for (const columns of UNIQUES) {
    const name = `${TABLE}_${columns.join("_")}_key`
    if (!(await uniqueIndexExists(name))) bad.push(`unique ${name} did not take, or is not unique`)
  }
  for (const columns of INDEXES) {
    const name = `${TABLE}_${columns.join("_")}_idx`
    if (!(await indexExists(name))) bad.push(`index ${name} did not take`)
  }

  if (bad.length > 0) {
    console.error(`\nThese did not take:`)
    for (const line of bad) console.error(`  ${line}`)
    process.exit(1)
  }

  console.log(
    `\n"${TABLE}" is in place: ${COLUMNS.length} columns, ${FOREIGN_KEYS.length} foreign keys, ` +
      `${UNIQUES.length} unique constraints, ${INDEXES.length} indexes.`,
  )
  console.log(
    `  the re-run rule is "${TABLE}_companyId_registerCode_businessDate_key": ` +
      `one register, one trading day, one report.`,
  )
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
