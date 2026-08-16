/**
 * Creates `RetailTillPin`.
 *
 *   npx tsx scripts/retail-till-pin.ts
 *
 * S-7.5. The four digits that unlock a till whose session is already open. Not a
 * credential — `app/portal/pos/login` and a password remain the only way into the
 * system — so the hash lives in a retail table of its own rather than beside
 * `User.password`, where a reader would reasonably assume the two were the same
 * kind of secret. `lib/retail/till-pin.ts` carries the threat model.
 *
 * ── Why a script ───────────────────────────────────────────────────────────
 *
 * `prisma db push` cannot run against this database (P1001 — only a Neon pooler
 * host is configured), the same reason `scripts/retail-cash-movements.ts` and
 * `scripts/retail-z-report.ts` exist. So the DDL is written out here in the order
 * Postgres needs it: table, unique constraint, foreign keys, indexes.
 *
 * Idempotent throughout. Running it twice is a no-op and the second run prints
 * `exists` for everything. The verification at the end reads `information_schema`
 * rather than the schema file, because a green Prisma run is not evidence that
 * the database changed.
 */

import "dotenv/config"

import { prisma } from "@/lib/prisma"

const TABLE = "RetailTillPin"

const COLUMNS: ReadonlyArray<{ name: string; definition: string }> = [
  { name: "id", definition: `"id" TEXT NOT NULL` },
  { name: "companyId", definition: `"companyId" TEXT NOT NULL` },
  { name: "userId", definition: `"userId" TEXT NOT NULL` },
  { name: "pinHash", definition: `"pinHash" TEXT NOT NULL` },
  { name: "failedAttempts", definition: `"failedAttempts" INTEGER NOT NULL DEFAULT 0` },
  { name: "lockedUntil", definition: `"lockedUntil" TIMESTAMP(3)` },
  { name: "lastUnlockedAt", definition: `"lastUnlockedAt" TIMESTAMP(3)` },
  {
    name: "createdAt",
    definition: `"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
  },
  {
    name: "updatedAt",
    definition: `"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
  },
]

/**
 * Both CASCADE, and neither is a hard call.
 *
 * A tenant that goes takes its tills with it. A person who leaves the shop takes
 * their PIN with them — unlike a cash movement or a posted sale, an unlock code is
 * not a record of anything that happened, so there is nothing here worth keeping
 * once the user row is gone, and a dangling hash is a hash nobody is watching.
 */
const FOREIGN_KEYS: ReadonlyArray<{
  column: string
  refTable: string
  onDelete: "CASCADE" | "RESTRICT" | "SET NULL"
}> = [
  { column: "companyId", refTable: "Company", onDelete: "CASCADE" },
  { column: "userId", refTable: "User", onDelete: "CASCADE" },
]

const INDEXES: ReadonlyArray<readonly string[]> = [["companyId"]]

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
  }> = await prisma.$queryRaw`
    SELECT data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
  `
  return rows[0] ?? null
}

async function constraintExists(name: string, type: "FOREIGN KEY" | "UNIQUE") {
  const rows: Array<{ n: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM information_schema.table_constraints
    WHERE constraint_name = ${name} AND constraint_type = ${type}
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

  for (const column of COLUMNS) {
    if (await columnFacts(TABLE, column.name)) continue
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${ident(TABLE)} ADD COLUMN IF NOT EXISTS ${column.definition}`,
    )
    console.log(`  added column "${column.name}"`)
  }

  // ---- One PIN per person ----------------------------------------------------
  // A unique index rather than a table constraint would satisfy Prisma too, but
  // `@unique` generates the constraint form and the catalogue check below looks
  // for it by name.
  const uniqueName = `${TABLE}_userId_key`
  if (await constraintExists(uniqueName, "UNIQUE")) {
    console.log(`  exists   unique ${TABLE}.userId`)
  } else {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${ident(TABLE)} ADD CONSTRAINT ${underscoreIdent(uniqueName)} UNIQUE ("userId")`,
    )
    console.log(`  added    unique ${TABLE}.userId`)
  }

  // ---- Foreign keys ----------------------------------------------------------
  for (const fk of FOREIGN_KEYS) {
    const name = `${TABLE}_${fk.column}_fkey`
    const label = `${TABLE}.${fk.column} -> ${fk.refTable} (${fk.onDelete})`
    if (await constraintExists(name, "FOREIGN KEY")) {
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

  const expectedFacts: Record<string, { udt: string; nullable: boolean }> = {
    id: { udt: "text", nullable: false },
    companyId: { udt: "text", nullable: false },
    userId: { udt: "text", nullable: false },
    pinHash: { udt: "text", nullable: false },
    failedAttempts: { udt: "int4", nullable: false },
    lockedUntil: { udt: "timestamp", nullable: true },
    lastUnlockedAt: { udt: "timestamp", nullable: true },
    createdAt: { udt: "timestamp", nullable: false },
    updatedAt: { udt: "timestamp", nullable: false },
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
  }

  if (!(await constraintExists(uniqueName, "UNIQUE"))) {
    bad.push(`${uniqueName} did not take`)
  }
  for (const fk of FOREIGN_KEYS) {
    if (!(await constraintExists(`${TABLE}_${fk.column}_fkey`, "FOREIGN KEY"))) {
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
    `\n"${TABLE}" is in place: ${COLUMNS.length} columns, one unique key on userId, ` +
      `${FOREIGN_KEYS.length} foreign keys, ${INDEXES.length} index.`,
  )
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
