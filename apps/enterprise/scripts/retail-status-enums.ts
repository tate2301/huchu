/**
 * Turns retail's eleven text status columns into Postgres enums.
 *
 * **Run this before `pnpm db:push` picks up the schema change:**
 *
 *   npx tsx scripts/retail-status-enums.ts && pnpm db:push
 *
 * `prisma db push` does not cast text to an enum. With any data in the table it
 * refuses outright, and the only remedy it offers is `--force-reset`, which drops
 * the database. So the casts are written out here, and the push afterwards finds
 * no difference left to make.
 *
 * Two things this has to do that the attendance conversion did not:
 *
 *  - **Drop the column default first.** Ten of these columns carry a text default
 *    (`'POSTED'`, `'OPEN'`, `'DRAFT'` …). `ALTER COLUMN … TYPE` will not cast a
 *    column out from under a default it cannot also cast, so the default comes
 *    off, the type changes, and the default goes back on as an enum literal.
 *  - **Convert eleven columns across nine tables in one transaction.** A partial
 *    run would leave the schema half enum and half text, and the next run would
 *    have to reason about which half it was looking at.
 *
 * Unknown values are never guessed at. Casing and surrounding whitespace are
 * normalised — `UPPER(TRIM(…))` landing inside the enum is the whole test for
 * "unambiguous" — and anything still outside the set stops the script with the
 * column types unchanged. Nothing is lost by stopping.
 */

// First, and before the Prisma client is constructed: `lib/prisma.ts` reads
// `process.env.DATABASE_URL` at import time, and nothing else in a `tsx` script
// loads `.env`.
import "@/scripts/lib/env";

import { prisma } from "@corelithzw/db/client"

type Conversion = {
  table: string
  column: string
  type: string
  /** Exactly the values the enum names, in schema order. */
  values: readonly string[]
  /** The enum label to restore as the column default, or null if it has none. */
  defaultValue: string | null
}

const CONVERSIONS: readonly Conversion[] = [
  {
    table: "RetailSale",
    column: "status",
    type: "RetailSaleStatus",
    values: ["POSTED", "VOIDED"],
    defaultValue: "POSTED",
  },
  {
    table: "RetailSale",
    column: "saleType",
    type: "RetailSaleType",
    values: ["SALE", "REFUND", "VOID"],
    defaultValue: "SALE",
  },
  {
    table: "RetailShift",
    column: "status",
    type: "RetailShiftStatus",
    values: ["OPEN", "CLOSED"],
    defaultValue: "OPEN",
  },
  {
    table: "RetailHeldCart",
    column: "status",
    type: "RetailHeldCartStatus",
    values: ["HELD", "RECALLED", "RELEASED"],
    defaultValue: "HELD",
  },
  {
    table: "RetailPurchaseOrder",
    column: "status",
    type: "RetailPurchaseOrderStatus",
    values: ["DRAFT", "PARTIAL", "RECEIVED"],
    defaultValue: "DRAFT",
  },
  {
    table: "RetailGoodsReceipt",
    column: "status",
    type: "RetailGoodsReceiptStatus",
    values: ["POSTED"],
    defaultValue: "POSTED",
  },
  {
    table: "RetailCatalogItem",
    column: "status",
    type: "RetailCatalogItemStatus",
    values: ["ACTIVE", "INACTIVE"],
    defaultValue: "ACTIVE",
  },
  {
    table: "RetailCatalogItem",
    column: "acquisitionMode",
    type: "RetailAcquisitionMode",
    values: ["PURCHASE"],
    defaultValue: "PURCHASE",
  },
  {
    table: "RetailPromotion",
    column: "type",
    type: "RetailPromotionType",
    values: ["PERCENT", "AMOUNT", "BUY_X_GET_Y", "BUNDLE"],
    defaultValue: null,
  },
  {
    table: "RetailPromotion",
    column: "status",
    type: "RetailPromotionStatus",
    values: ["ACTIVE", "SCHEDULED", "INACTIVE"],
    defaultValue: "ACTIVE",
  },
  {
    table: "RetailSalePayment",
    column: "tenderType",
    type: "RetailTenderType",
    values: ["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"],
    defaultValue: null,
  },
]

/**
 * Every enum type the schema names. Checked in full on every run, including the
 * ones whose column is already converted — a type can fall behind the schema long
 * after its column stopped needing anything.
 */
const ALL_TYPES = CONVERSIONS

function quote(value: string) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(value)) {
    // Enum labels here are code-defined, not user input, but a label that does not
    // look like one is a sign the table above has been edited carelessly.
    throw new Error(`Refusing to build SQL for an unexpected enum label: ${value}`)
  }
  return `'${value}'`
}

async function columnType(table: string, column: string) {
  const rows: Array<{ data_type: string; udt_name: string }> = await prisma.$queryRaw`
    SELECT data_type, udt_name FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
  `
  return rows[0] ?? null
}

async function main() {
  const pending: Conversion[] = []

  for (const conversion of CONVERSIONS) {
    const label = `"${conversion.table}"."${conversion.column}"`
    const current = await columnType(conversion.table, conversion.column)

    if (!current) {
      console.error(`No ${label} column found. Wrong database?`)
      process.exit(1)
    }
    if (current.udt_name === conversion.type) {
      console.log(`${label} is already ${conversion.type}.`)
      continue
    }
    if (current.data_type !== "text" && current.data_type !== "character varying") {
      console.error(
        `${label} is ${current.data_type} (${current.udt_name}), which this script does ` +
          "not know how to convert. Look at it by hand.",
      )
      process.exit(1)
    }
    pending.push(conversion)
  }

  // Not an early return when `pending` is empty: a column can already be the right
  // enum while the type behind it is missing a value the schema has since added.
  // That is how `RetailHeldCartStatus.RELEASED` arrived.
  console.log(
    pending.length === 0
      ? "\nEvery column is already an enum; checking the types still carry every value.\n"
      : `\n${pending.length} column(s) to convert.\n`,
  )

  // Pass one: normalise, then report anything still outside the set. Every column
  // is checked before any is altered, so a bad value in the last one does not
  // leave the first ten converted.
  let blocked = false
  for (const conversion of pending) {
    const label = `"${conversion.table}"."${conversion.column}"`
    const values = [...conversion.values]

    const before: Array<{ value: string | null; n: bigint }> = await prisma.$queryRawUnsafe(
      `SELECT "${conversion.column}" AS value, COUNT(*) AS n FROM "${conversion.table}"
       GROUP BY 1 ORDER BY 2 DESC`,
    )
    const total = before.reduce((sum, row) => sum + Number(row.n), 0)
    console.log(
      `${label} — ${total} row(s): ` +
        (before.map((row) => `${row.value ?? "(null)"}=${Number(row.n)}`).join(", ") || "empty"),
    )

    const fixed: Array<{ n: bigint }> = await prisma.$queryRawUnsafe(
      `WITH updated AS (
         UPDATE "${conversion.table}"
         SET "${conversion.column}" = UPPER(TRIM("${conversion.column}"))
         WHERE "${conversion.column}" IS NOT NULL
           AND "${conversion.column}" <> UPPER(TRIM("${conversion.column}"))
           AND UPPER(TRIM("${conversion.column}")) = ANY($1::text[])
         RETURNING 1
       )
       SELECT COUNT(*) AS n FROM updated`,
      values,
    )
    const normalised = Number(fixed[0]?.n ?? 0)
    if (normalised > 0) console.log(`  normalised casing on ${normalised} row(s)`)

    const remaining: Array<{ value: string | null; n: bigint }> = await prisma.$queryRawUnsafe(
      `SELECT "${conversion.column}" AS value, COUNT(*) AS n FROM "${conversion.table}"
       WHERE "${conversion.column}" IS NOT NULL AND NOT ("${conversion.column}" = ANY($1::text[]))
       GROUP BY 1 ORDER BY 2 DESC`,
      values,
    )
    if (remaining.length > 0) {
      blocked = true
      console.error(`  NOT IN ${conversion.type}:`)
      for (const row of remaining) {
        console.error(`    "${row.value}" — ${Number(row.n)} row(s)`)
      }
      console.error(`    allowed: ${values.join(", ")}`)
    }
  }

  if (blocked) {
    console.error(
      "\nDecide what each unknown value means and update those rows by hand, then run " +
        "this again.\nNo column type has been changed. Nothing is lost by stopping here.",
    )
    process.exit(1)
  }

  // Pass two: make every type exist and carry every value the schema names.
  //
  // This runs outside the transaction below, deliberately. `ALTER TYPE … ADD VALUE`
  // may not be followed by a use of that value in the same transaction, and the
  // cast in pass three is exactly such a use.
  //
  // Adding is safe in a way that removing is not: an enum an audit row holds may
  // gain values and must never lose one, because Postgres refuses to drop a value
  // a row still uses and the alternatives — rewriting those rows, or deleting them
  // — falsify or destroy the trail. So a missing value is added; an extra value
  // found in the database is reported and left alone.
  for (const conversion of ALL_TYPES) {
    const values = [...conversion.values]
    const existing: Array<{ enumlabel: string }> = await prisma.$queryRaw`
      SELECT e.enumlabel FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = ${conversion.type}
      ORDER BY e.enumsortorder
    `

    if (existing.length === 0) {
      await prisma.$executeRawUnsafe(
        `CREATE TYPE "${conversion.type}" AS ENUM (${values.map(quote).join(", ")})`,
      )
      console.log(`created type ${conversion.type}`)
      continue
    }

    const found = existing.map((row) => row.enumlabel)
    for (const value of values.filter((candidate) => !found.includes(candidate))) {
      await prisma.$executeRawUnsafe(
        `ALTER TYPE "${conversion.type}" ADD VALUE IF NOT EXISTS ${quote(value)}`,
      )
      console.log(`added ${conversion.type}.${value}`)
    }

    const extra = found.filter((value) => !values.includes(value))
    if (extra.length > 0) {
      console.warn(
        `  note: ${conversion.type} also has ${extra.join(", ")}, which the schema does ` +
          "not name. Left alone — dropping an enum value is not reversible.",
      )
    }
  }

  // Pass three: the casts, in one transaction.
  await prisma.$transaction(async (tx) => {
    for (const conversion of pending) {
      // The default has to come off before the cast and go back on after it.
      await tx.$executeRawUnsafe(
        `ALTER TABLE "${conversion.table}" ALTER COLUMN "${conversion.column}" DROP DEFAULT`,
      )
      await tx.$executeRawUnsafe(
        `ALTER TABLE "${conversion.table}" ALTER COLUMN "${conversion.column}" ` +
          `TYPE "${conversion.type}" USING "${conversion.column}"::"${conversion.type}"`,
      )
      if (conversion.defaultValue !== null) {
        await tx.$executeRawUnsafe(
          `ALTER TABLE "${conversion.table}" ALTER COLUMN "${conversion.column}" ` +
            `SET DEFAULT ${quote(conversion.defaultValue)}::"${conversion.type}"`,
        )
      }
      console.log(`converted "${conversion.table}"."${conversion.column}" → ${conversion.type}`)
    }
  })

  // Read it back from the catalogue, not from the schema file.
  let failed = false
  for (const conversion of pending) {
    const after = await columnType(conversion.table, conversion.column)
    if (after?.udt_name !== conversion.type) {
      console.error(
        `Conversion did not take: "${conversion.table}"."${conversion.column}" is still ` +
          `${after?.udt_name}.`,
      )
      failed = true
    }
  }
  if (failed) process.exit(1)

  console.log("\nAll retail status columns are enums. Run `pnpm db:push`.")
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
