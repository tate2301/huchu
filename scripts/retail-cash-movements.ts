/**
 * Creates `RetailCashMovement` and the `RetailCashMovementType` enum.
 *
 *   npx tsx scripts/retail-cash-movements.ts
 *
 * S-7.1. `RetailShift` carries `openingFloat`, `expectedCash`, `countedCash` and
 * `variance` and has never had a model for cash leaving the drawer mid-shift. A
 * bottle store on a Friday banks part of the takings to the safe; `expectedCash`
 * kept counting money that was no longer in the drawer, `countedCash` correctly did
 * not, and `variance` read as a shortfall exactly equal to what had been banked.
 * This is the table that records the movement so the figure can be explained.
 *
 * ── Why a script ───────────────────────────────────────────────────────────
 *
 * `prisma db push` cannot run against this database (P1001 — only a Neon pooler
 * host is configured), which is the same reason `scripts/retail-line-company-id.ts`
 * and `scripts/retail-foreign-keys.ts` exist. So the DDL is written out here, in
 * the order Postgres needs it: the enum type, then the table, then the foreign
 * keys, then the indexes.
 *
 * Idempotent throughout: `CREATE TYPE` is guarded on `pg_type`, the table and the
 * indexes use `IF NOT EXISTS`, enum labels are added with `IF NOT EXISTS`, and each
 * constraint is skipped when a constraint of that name already exists. Running it
 * twice is a no-op and the second run prints `exists` for everything.
 *
 * The verification at the end reads `information_schema` and `pg_enum` rather than
 * the schema file. A green run of Prisma is not evidence that the database changed.
 */

import "dotenv/config"

import { prisma } from "@/lib/prisma"

const TABLE = "RetailCashMovement"
const TYPE_ENUM = "RetailCashMovementType"
const REASON_ENUM = "RetailCashMovementReason"

/**
 * The two enums, with their labels in schema order.
 *
 * On `RetailCashMovementType` the direction is in each name deliberately: "pickup"
 * means safe → drawer in the POS prototype and drawer → safe almost everywhere
 * else, and a label that can be read either way on a row that moves `expectedCash`
 * is how this defect would come back.
 *
 * An enum an audit row holds may gain values and must never lose one — Postgres
 * refuses to drop a label a row still uses, and rewriting or deleting those rows
 * falsifies the trail. So labels are only ever added below, never removed.
 */
const ENUMS: ReadonlyArray<{ type: string; labels: readonly string[] }> = [
  { type: TYPE_ENUM, labels: ["DROP_TO_SAFE", "FLOAT_TOP_UP", "PAYOUT"] },
  {
    type: REASON_ENUM,
    labels: [
      "CASH_LEVEL_TOO_HIGH",
      "BANK_DEPOSIT",
      "END_OF_SHIFT_SKIM",
      "MANAGER_REQUEST",
      "CHANGE_REQUIRED",
      "SUPPLIER_PAYOUT",
      "PETTY_CASH",
      "OTHER",
    ],
  },
]

/**
 * Column definitions, in schema order. `amount` and `baseAmount` are
 * `numeric(14,2)` and the rate is `numeric(12,4)` — the two scales `lib/money.ts`
 * names, and the ones every other retail money column already carries.
 */
const COLUMNS: ReadonlyArray<{ name: string; definition: string }> = [
  { name: "id", definition: `"id" TEXT NOT NULL` },
  { name: "companyId", definition: `"companyId" TEXT NOT NULL` },
  { name: "shiftId", definition: `"shiftId" TEXT NOT NULL` },
  { name: "type", definition: `"type" "${TYPE_ENUM}" NOT NULL` },
  { name: "amount", definition: `"amount" DECIMAL(14,2) NOT NULL DEFAULT 0` },
  { name: "currency", definition: `"currency" TEXT NOT NULL DEFAULT 'USD'` },
  { name: "exchangeRate", definition: `"exchangeRate" DECIMAL(12,4) NOT NULL DEFAULT 1` },
  { name: "baseAmount", definition: `"baseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0` },
  {
    name: "reasonCode",
    definition: `"reasonCode" "${REASON_ENUM}" NOT NULL DEFAULT 'OTHER'`,
  },
  { name: "reason", definition: `"reason" TEXT` },
  { name: "denominations", definition: `"denominations" JSONB` },
  { name: "recordedById", definition: `"recordedById" TEXT` },
  { name: "recordedByName", definition: `"recordedByName" TEXT` },
  {
    name: "createdAt",
    definition: `"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
  },
]

/**
 * `onDelete`, and none of the three is the same:
 *
 * - **Company → CASCADE.** Removing a tenant removes its trade. What every other
 *   retail table does (`scripts/retail-foreign-keys.ts`).
 * - **User → SET NULL.** A cashier leaving must never erase the safe log they
 *   carried the money on. `recordedByName` is denormalised for exactly this, the
 *   same bargain `RetailSale.cashierId` already makes, and the column is nullable
 *   so SET NULL is available.
 * - **RetailShift → CASCADE**, and this is the interesting one. Retail's two
 *   existing document→document links go opposite ways: `RetailHeldCart.shiftId`
 *   cascades because a parked cart is meaningless without its shift, and
 *   `RetailSale.shiftId` sets null because a posted sale is a document in its own
 *   right that outlives the drawer it was rung on. A cash movement is the first
 *   shape, not the second: its entire content is "this shift's expected cash is
 *   $200 lower than the receipts say", which is not a statement that survives
 *   losing the shift. Orphaned it would also stop being counted silently, which is
 *   the failure mode of the bug being fixed. `shiftId` is NOT NULL, so SET NULL is
 *   not on the table regardless, and RESTRICT would only convert a cascade nobody
 *   triggers — no route deletes a shift — into an error nobody can act on.
 */
const FOREIGN_KEYS: ReadonlyArray<{
  column: string
  refTable: string
  onDelete: "CASCADE" | "RESTRICT" | "SET NULL"
}> = [
  { column: "companyId", refTable: "Company", onDelete: "CASCADE" },
  { column: "shiftId", refTable: "RetailShift", onDelete: "CASCADE" },
  { column: "recordedById", refTable: "User", onDelete: "SET NULL" },
]

/** Cash-up reads a shift's movements in order; the type index is for the Z-report. */
const INDEXES: ReadonlyArray<readonly string[]> = [
  ["companyId", "shiftId", "createdAt"],
  ["companyId", "type"],
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

async function typeExists(name: string) {
  const rows: Array<{ n: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM pg_type WHERE typname = ${name}
  `
  return Number(rows[0]?.n ?? 0) > 0
}

async function enumLabels(name: string) {
  const rows: Array<{ enumlabel: string }> = await prisma.$queryRaw`
    SELECT e.enumlabel FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = ${name}
    ORDER BY e.enumsortorder
  `
  return rows.map((row) => row.enumlabel)
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

async function rowCount(table: string) {
  const rows: Array<{ n: bigint }> = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM ${ident(table)}`,
  )
  return Number(rows[0]?.n ?? 0)
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

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (/\bprod(uction)?\b/.test(databaseUrl)) {
    throw new Error("DATABASE_URL looks like production. Refusing to alter tables.")
  }

  // ---- The enum types --------------------------------------------------------
  for (const spec of ENUMS) {
    if (await typeExists(spec.type)) {
      console.log(`type "${spec.type}" exists`)
    } else {
      await prisma.$executeRawUnsafe(
        `CREATE TYPE ${ident(spec.type)} AS ENUM ` +
          `(${spec.labels.map((label) => `'${label}'`).join(", ")})`,
      )
      console.log(`created type "${spec.type}"`)
    }

    // A label the schema names and the type does not have is added, never removed.
    const present = new Set(await enumLabels(spec.type))
    for (const label of spec.labels) {
      if (present.has(label)) continue
      await prisma.$executeRawUnsafe(
        `ALTER TYPE ${ident(spec.type)} ADD VALUE IF NOT EXISTS '${label}'`,
      )
      console.log(`  added label ${spec.type}.${label}`)
    }
  }

  // ---- The table -------------------------------------------------------------
  if (await tableExists(TABLE)) {
    console.log(`\ntable "${TABLE}" exists`)
  } else {
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS ${ident(TABLE)} (
         ${COLUMNS.map((column) => column.definition).join(",\n         ")},
         CONSTRAINT ${underscoreIdent(`${TABLE}_pkey`)} PRIMARY KEY ("id")
       )`,
    )
    console.log(`\ncreated table "${TABLE}"`)
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

  // `reason` began this ticket as a required free-text field and became the
  // optional note beside `reasonCode`. Relaxing NOT NULL is safe in any direction;
  // tightening it would not be, which is why it is only ever dropped here.
  const reasonFacts = await columnFacts(TABLE, "reason")
  if (reasonFacts && reasonFacts.is_nullable === "NO") {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${ident(TABLE)} ALTER COLUMN "reason" DROP NOT NULL`,
    )
    console.log(`  relaxed "reason" to nullable`)
  }

  // The same first cut had a separate `notes` column; `reasonCode` plus a free-text
  // `reason` is the two-field shape the prototype actually has, and a third text
  // column nothing writes is a column somebody will eventually write to. Dropped
  // only while the table is empty — a column with rows behind it is data, and this
  // script does not delete data.
  if (await columnFacts(TABLE, "notes")) {
    if ((await rowCount(TABLE)) === 0) {
      await prisma.$executeRawUnsafe(`ALTER TABLE ${ident(TABLE)} DROP COLUMN "notes"`)
      console.log(`  dropped the interim "notes" column (table was empty)`)
    } else {
      console.log(`  left "notes" in place — the table has rows and this script keeps them`)
    }
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

  for (const spec of ENUMS) {
    const found = await enumLabels(spec.type)
    for (const label of spec.labels) {
      if (!found.includes(label)) bad.push(`"${spec.type}" is missing ${label}`)
    }
  }

  const expectedFacts: Record<string, { udt: string; nullable: boolean; numeric?: [number, number] }> =
    {
      id: { udt: "text", nullable: false },
      companyId: { udt: "text", nullable: false },
      shiftId: { udt: "text", nullable: false },
      type: { udt: TYPE_ENUM, nullable: false },
      amount: { udt: "numeric", nullable: false, numeric: [14, 2] },
      currency: { udt: "text", nullable: false },
      exchangeRate: { udt: "numeric", nullable: false, numeric: [12, 4] },
      baseAmount: { udt: "numeric", nullable: false, numeric: [14, 2] },
      reasonCode: { udt: REASON_ENUM, nullable: false },
      reason: { udt: "text", nullable: true },
      denominations: { udt: "jsonb", nullable: true },
      recordedById: { udt: "text", nullable: true },
      recordedByName: { udt: "text", nullable: true },
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
      `${INDEXES.length} indexes.`,
  )
  for (const spec of ENUMS) {
    console.log(`  "${spec.type}" carries ${(await enumLabels(spec.type)).join(", ")}`)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
