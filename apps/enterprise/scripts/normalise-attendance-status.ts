/**
 * Turns `Attendance.status` from text into the `AttendanceStatus` enum.
 *
 * **Run this before `pnpm db:push` picks up that schema change:**
 *
 *   npx tsx scripts/normalise-attendance-status.ts && pnpm db:push
 *
 * This does the type change itself rather than checking whether a push would
 * survive one, because a push will not attempt it. `prisma db push` does not cast
 * text to an enum at all — with any data in the table it refuses outright:
 *
 *   Changed the type of `status` on the `Attendance` table. No cast exists, the
 *   column would be dropped and recreated, which cannot be done since the column
 *   is required and there is data in the table.
 *
 * That is the same message whether every row is already `PRESENT` or none of them
 * is, and its only offered remedy is `--force-reset`, which drops the database.
 * So the cast is written out here, in the one SQL statement Postgres is perfectly
 * happy to run, and the push afterwards finds no difference left to make.
 *
 * Normalisation first, and only what is unambiguous: casing and surrounding
 * whitespace, so "present" and " LATE " become `PRESENT` and `LATE`. Anything
 * else is reported and left alone, and the script exits non-zero without touching
 * the column type — "OFF" could mean `REST_DAY` or `ON_LEAVE`, and picking one
 * silently would rewrite somebody's attendance record to make a deploy proceed.
 *
 * Raw SQL throughout: the generated client either does not know the column as
 * text yet or no longer does, depending on which side of the push you are on.
 */

// First, and before the Prisma client is constructed: `lib/prisma.ts` reads
// `process.env.DATABASE_URL` at import time, and nothing else in a `tsx` script
// loads `.env`. Without this the script warns "DATABASE_URL not set. Prisma will
// use PG* env vars." and then talks to whatever those happen to name — or
// nothing. `prisma db push` is unaffected because `prisma.config.ts` loads dotenv
// itself, which is exactly why this went unnoticed.
import "@/scripts/lib/env";

import { prisma } from "@corelithzw/db/client"

/** Exactly the values `enum AttendanceStatus` names, in schema order. */
const ALLOWED = ["PRESENT", "ABSENT", "LATE", "ON_LEAVE", "REST_DAY", "HOLIDAY"] as const

type Tally = { status: string | null; n: bigint }

async function main() {
  const column: Array<{ data_type: string; udt_name: string }> = await prisma.$queryRaw`
    SELECT data_type, udt_name FROM information_schema.columns
    WHERE table_name = 'Attendance' AND column_name = 'status'
  `
  if (column.length === 0) {
    console.error('No "Attendance"."status" column found. Wrong database?')
    process.exit(1)
  }
  if (column[0].udt_name === "AttendanceStatus") {
    console.log('"Attendance"."status" is already AttendanceStatus. Nothing to do.')
    return
  }
  if (column[0].data_type !== "text" && column[0].data_type !== "character varying") {
    console.error(
      `"Attendance"."status" is ${column[0].data_type} (${column[0].udt_name}), which this ` +
        "script does not know how to convert. Look at it by hand.",
    )
    process.exit(1)
  }

  const before: Tally[] = await prisma.$queryRaw`
    SELECT status, COUNT(*) AS n FROM "Attendance" GROUP BY status ORDER BY COUNT(*) DESC
  `
  if (before.length > 0) {
    console.log("Current values:")
    for (const row of before) console.log(`  ${row.status ?? "(null)"} — ${Number(row.n)}`)
  } else {
    console.log("No attendance rows — converting an empty column.")
  }

  // Casing and whitespace only. `UPPER(TRIM(...))` landing inside the enum is the
  // whole test for "unambiguous".
  const fixed: Array<{ n: bigint }> = await prisma.$queryRaw`
    WITH updated AS (
      UPDATE "Attendance"
      SET status = UPPER(TRIM(status))
      WHERE status IS NOT NULL
        AND status <> UPPER(TRIM(status))
        AND UPPER(TRIM(status)) = ANY(${[...ALLOWED]}::text[])
      RETURNING 1
    )
    SELECT COUNT(*) AS n FROM updated
  `
  const normalised = Number(fixed[0]?.n ?? 0)
  if (normalised > 0) console.log(`Normalised casing on ${normalised} row(s).`)

  const remaining: Tally[] = await prisma.$queryRaw`
    SELECT status, COUNT(*) AS n FROM "Attendance"
    WHERE status IS NULL OR NOT (status = ANY(${[...ALLOWED]}::text[]))
    GROUP BY status ORDER BY COUNT(*) DESC
  `
  if (remaining.length > 0) {
    console.error("\nThese values are not in AttendanceStatus and were NOT changed:")
    for (const row of remaining) {
      console.error(
        `  ${row.status === null ? "(null)" : `"${row.status}"`} — ${Number(row.n)} row(s)`,
      )
    }
    console.error(
      "\nDecide what each one means and update those rows by hand, then run this again.\n" +
        `Allowed: ${ALLOWED.join(", ")}\n` +
        "The column type has NOT been changed. Nothing is lost by stopping here.",
    )
    process.exit(1)
  }

  // The type and the cast, in one transaction: a half-applied version of this
  // leaves an enum type with no column using it, which the next run would then
  // have to reason about.
  //
  // `CREATE TYPE` has no `IF NOT EXISTS`, so an earlier interrupted run is
  // handled by asking first rather than by swallowing an error — a swallowed
  // error here could be a type whose values do not match the schema.
  await prisma.$transaction(async (tx) => {
    const existing: Array<{ enumlabel: string }> = await tx.$queryRaw`
      SELECT e.enumlabel FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'AttendanceStatus'
      ORDER BY e.enumsortorder
    `
    if (existing.length === 0) {
      await tx.$executeRawUnsafe(
        `CREATE TYPE "AttendanceStatus" AS ENUM (${ALLOWED.map((v) => `'${v}'`).join(", ")})`,
      )
      console.log("Created type AttendanceStatus.")
    } else {
      const found = existing.map((row) => row.enumlabel)
      const missing = ALLOWED.filter((value) => !found.includes(value))
      if (missing.length > 0) {
        throw new Error(
          `Type AttendanceStatus exists but is missing ${missing.join(", ")}. ` +
            `It has: ${found.join(", ")}. Fix it by hand — this script will not guess.`,
        )
      }
      console.log("Type AttendanceStatus already exists.")
    }

    await tx.$executeRawUnsafe(
      `ALTER TABLE "Attendance" ALTER COLUMN "status" TYPE "AttendanceStatus" ` +
        `USING "status"::"AttendanceStatus"`,
    )
  })

  const after: Array<{ udt_name: string }> = await prisma.$queryRaw`
    SELECT udt_name FROM information_schema.columns
    WHERE table_name = 'Attendance' AND column_name = 'status'
  `
  if (after[0]?.udt_name !== "AttendanceStatus") {
    console.error(`Conversion did not take: column is still ${after[0]?.udt_name}.`)
    process.exit(1)
  }
  console.log('"Attendance"."status" is now AttendanceStatus. Run `pnpm db:push`.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
