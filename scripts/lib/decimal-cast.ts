/**
 * The measure-then-cast engine that turns `double precision` columns into
 * `numeric` at a named scale.
 *
 * This started life inside `scripts/retail-money-decimal.ts` (R-1.1) and was
 * lifted out when S-1 needed exactly the same 200 lines for the core pricing
 * columns. Two copies of a migration engine is two chances to fix a bug in one
 * of them, so there is one, and the scripts that use it are a column list and a
 * call.
 *
 * Three scales, matching `lib/money.ts`:
 *
 *  - amounts `numeric(14,2)` — `MONEY_SCALE`
 *  - quantities `numeric(12,4)` — `RATE_SCALE`, so a part-received purchase order
 *    line or a fractional volume break can carry a fraction the cent scale would
 *    flatten
 *  - tax rates `numeric(5,2)` — `PERCENT_SCALE`, a percentage and not money
 *
 * ## It reports before it rounds
 *
 * A `float8` holding 12.345 becomes 12.35 the moment it is cast to
 * `numeric(14,2)`, and a migration that does that quietly is how a cent goes
 * missing with nobody able to say when. So every column is measured first: how
 * many rows change value under the cast, and by how much in total. Nothing is
 * altered until all of them have been counted and printed, and a value too large
 * for the target scale stops the run outright rather than being truncated.
 *
 * ## It refuses rather than half-applies
 *
 * The casts run in one transaction, the production URL is refused before any
 * work starts, and the result is read back out of `information_schema` rather
 * than assumed from a green `ALTER TABLE`. A half-applied conversion leaves a
 * module part float and part numeric, and arithmetic spanning the two is exactly
 * the disagreement this is meant to end.
 *
 * Idempotent: a column already at the target `numeric(p,s)` is reported and
 * skipped; a column at some *other* numeric scale stops the run for a human.
 */

import { prisma } from "@/lib/prisma"

export type DecimalColumn = {
  table: string
  column: string
  precision: number
  scale: number
}

/** `MONEY_SCALE` — an amount, at the cent. */
export const MONEY = { precision: 14, scale: 2 } as const
/** `RATE_SCALE` — a quantity or a per-unit rate, at four places. */
export const QTY = { precision: 12, scale: 4 } as const
/** `PERCENT_SCALE` — a percentage between 0 and 100, not money. */
export const PCT = { precision: 5, scale: 2 } as const

/** Identifiers are code-defined here, but SQL is being built by hand. */
export function ident(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) {
    throw new Error(`Refusing to build SQL for an unexpected identifier: ${value}`)
  }
  return `"${value}"`
}

type ColumnFacts = {
  data_type: string
  numeric_precision: number | null
  numeric_scale: number | null
  column_default: string | null
}

async function columnFacts(table: string, column: string) {
  const rows: ColumnFacts[] = await prisma.$queryRaw`
    SELECT data_type, numeric_precision, numeric_scale, column_default
    FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
  `
  return rows[0] ?? null
}

/**
 * A `float8` default reads back as `0` or `1` — a bare literal Postgres is happy
 * to re-parse against a `numeric` column. Where it reads back with its type
 * painted on (`0::double precision`), that cast is stripped: re-applying it would
 * leave a numeric column defaulting through a float, which is the round trip the
 * whole migration exists to remove.
 */
function portableDefault(expression: string) {
  return expression.replace(/::\s*(double precision|real|numeric(\([^)]*\))?)\s*$/i, "")
}

export type ConvertOptions = {
  /** Names the set in the log lines, e.g. "retail money" or "core pricing". */
  label: string
}

/**
 * Measure every column, refuse on anything surprising, then cast the rest in one
 * transaction. Exits the process non-zero rather than returning on any refusal —
 * these are CLI migrations and a half-answer is not useful to the caller.
 */
export async function convertColumns(columns: readonly DecimalColumn[], options: ConvertOptions) {
  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (/\bprod(uction)?\b/.test(databaseUrl)) {
    throw new Error("DATABASE_URL looks like production. Refusing to alter tables.")
  }

  const pending: DecimalColumn[] = []

  for (const target of columns) {
    const label = `"${target.table}"."${target.column}"`
    const current = await columnFacts(target.table, target.column)

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
    console.log(`\nEvery ${options.label} column is already numeric. Nothing to do.`)
    return
  }

  // Pass one: measure. Nothing is altered here — a column that would overflow, or
  // a rounding nobody expected, is worth knowing about before the casts have run.
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
  } else {
    console.log("\nNo value changes under the cast. Nothing rounds.")
  }

  // Pass two: the casts, in one transaction.
  await prisma.$transaction(async (tx) => {
    for (const target of pending) {
      const table = ident(target.table)
      const column = ident(target.column)
      const cast = `numeric(${target.precision},${target.scale})`

      // The default comes off before the cast and goes back on after it, the same
      // dance the enum conversion needed: `ALTER COLUMN … TYPE` will not cast a
      // column out from under a default it cannot also cast. The *expression* is
      // carried across rather than a hardcoded zero — `ProductPrice.minQuantity`
      // defaults to 1, and a volume break that silently starts at 0 prices every
      // line off the wrong row.
      const rows: Array<{ column_default: string | null }> = await tx.$queryRaw`
        SELECT column_default FROM information_schema.columns
        WHERE table_name = ${target.table} AND column_name = ${target.column}
      `
      const existingDefault = rows[0]?.column_default ?? null

      if (existingDefault !== null) {
        await tx.$executeRawUnsafe(`ALTER TABLE ${table} ALTER COLUMN ${column} DROP DEFAULT`)
      }
      await tx.$executeRawUnsafe(
        `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE ${cast} USING ${column}::${cast}`,
      )
      if (existingDefault !== null) {
        await tx.$executeRawUnsafe(
          `ALTER TABLE ${table} ALTER COLUMN ${column} SET DEFAULT ${portableDefault(existingDefault)}`,
        )
      }
      console.log(
        `converted "${target.table}"."${target.column}" → ${cast}` +
          (existingDefault === null ? "" : ` (default ${portableDefault(existingDefault)} kept)`),
      )
    }
  })

  // Read it back from the catalogue, not from the schema file.
  let failed = false
  for (const target of pending) {
    const after = await columnFacts(target.table, target.column)
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

  console.log(`\nAll ${options.label} columns are numeric. Run \`pnpm db:push\`.`)
}
