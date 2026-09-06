/**
 * Makes `Attendance.siteId` optional, safely.
 *
 * **Run this before `pnpm db:push` picks up the schema change:**
 *
 *   npx tsx scripts/attendance-site-optional.ts && pnpm db:push
 *
 * A required site was load-bearing in two ways, and only one of them was obvious.
 *
 * The obvious one: a tenant with no sites could not mark a register at all. A
 * payroll bureau, a school and a scrap yard all keep one and none has a shaft.
 *
 * The hidden one: `Attendance` had **no `companyId`**. It was tenant-scoped
 * entirely through the site — `where: { site: { companyId } }` — so simply
 * relaxing the column would have put every siteless row outside the only thing
 * keeping one company's register away from another's. Nothing would have failed
 * loudly. So this adds the company to the row first and the scoping moves onto it.
 *
 * Three steps `db push` cannot do for you:
 *
 * 1. **Add a required `companyId` to a populated table.** Push refuses a NOT NULL
 *    column with no default. Added nullable, backfilled from the site, then
 *    tightened — and it refuses to tighten if any row could not be resolved,
 *    rather than inventing a company for it.
 * 2. **Narrow the unique key** from `[date, siteId, shift, employeeId]` to
 *    `[date, shift, employeeId]`. Required, because Postgres treats NULLs as
 *    distinct: leaving the site in the key would mean it stopped preventing
 *    duplicates the moment the column went null. This is *stricter* than what it
 *    replaces, so real data can violate it — the same person marked at two sites
 *    on one shift. Those are reported and the script stops. Nobody works two
 *    places at once, but which of the two rows is wrong is not a script's call.
 * 3. **Relax `siteId`** — push can do this one, but doing it here keeps the whole
 *    change in one transaction and leaves the push as a no-op.
 *
 * Idempotent: each step checks the current shape first, so a re-run after a
 * partial failure resumes rather than repeating.
 */

// First, and before the Prisma client is constructed: `lib/prisma.ts` reads
// `process.env.DATABASE_URL` at import time, and nothing else in a `tsx` script
// loads `.env`. Without this the script warns "DATABASE_URL not set. Prisma will
// use PG* env vars." and then talks to whatever those happen to name — or
// nothing. `prisma db push` is unaffected because `prisma.config.ts` loads dotenv
// itself, which is exactly why this went unnoticed.
import "@/scripts/lib/env";

import { prisma } from "@corelithzw/db/client"

type Column = { column_name: string; is_nullable: string; data_type: string }

async function attendanceColumns(): Promise<Column[]> {
  return prisma.$queryRaw<Column[]>`
    SELECT column_name, is_nullable, data_type
    FROM information_schema.columns
    WHERE table_name = 'Attendance'
  `
}

/**
 * The unique indexes on Attendance, with the columns each really covers.
 *
 * Read from the catalogue rather than by string-matching `pg_indexes.indexdef`.
 * The first cut of this did the latter and its idempotency check was wrong on the
 * second run: Postgres only quotes identifiers that need it, so the definition
 * reads `btree (date, shift, "employeeId")` — looking for `"date"` finds nothing
 * and the script tried to create an index it had made a minute earlier.
 */
async function uniqueIndexes() {
  return prisma.$queryRaw<Array<{ indexname: string; cols: string[] }>>`
    -- Both cast to text: relname and attname are Postgres's "name" type, which the
    -- pg driver adapter refuses to deserialise ("Unsupported native data type").
    SELECT i.relname::text AS indexname, array_agg(a.attname::text ORDER BY k.ord) AS cols
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN LATERAL unnest(x.indkey) WITH ORDINALITY AS k(attnum, ord) ON TRUE
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
    WHERE t.relname = 'Attendance' AND x.indisunique
    GROUP BY i.relname
  `
}

async function main() {
  const columns = await attendanceColumns()
  if (columns.length === 0) {
    console.error('No "Attendance" table found. Wrong database?')
    process.exit(1)
  }
  const byName = new Map(columns.map((column) => [column.column_name, column]))
  const rows = await prisma.attendance.count()
  console.log(`Attendance has ${rows} row(s).`)

  // --- Step 1: companyId, denormalised off the site.
  if (!byName.has("companyId")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Attendance" ADD COLUMN "companyId" TEXT`)
    console.log("Added companyId (nullable).")
  } else {
    console.log("companyId already present.")
  }

  const backfilled: Array<{ n: bigint }> = await prisma.$queryRaw`
    WITH updated AS (
      UPDATE "Attendance" a
      SET "companyId" = s."companyId"
      FROM "Site" s
      WHERE a."siteId" = s.id AND a."companyId" IS NULL
      RETURNING 1
    )
    SELECT COUNT(*) AS n FROM updated
  `
  const filled = Number(backfilled[0]?.n ?? 0)
  if (filled > 0) console.log(`Backfilled companyId on ${filled} row(s) from their site.`)

  const orphans: Array<{ n: bigint }> = await prisma.$queryRaw`
    SELECT COUNT(*) AS n FROM "Attendance" WHERE "companyId" IS NULL
  `
  const unresolved = Number(orphans[0]?.n ?? 0)
  if (unresolved > 0) {
    // A row whose site does not exist. Guessing its tenant is exactly the mistake
    // this whole change is about, so it stops here.
    const sample = await prisma.$queryRaw<Array<{ id: string; siteId: string | null }>>`
      SELECT id, "siteId" FROM "Attendance" WHERE "companyId" IS NULL LIMIT 10
    `
    console.error(
      `\n${unresolved} attendance row(s) have no resolvable company (their site is missing).`,
    )
    for (const row of sample) console.error(`  ${row.id} — siteId ${row.siteId ?? "(null)"}`)
    console.error(
      "\nSet their companyId by hand, or delete them if they are debris. This script " +
        "will not guess which tenant a register belongs to.",
    )
    process.exit(1)
  }

  // Re-read, do not trust `byName`. That map was taken before the column was
  // added, so on a first clean run `byName.get("companyId")` is `undefined`, this
  // branch was skipped, and the script ended with the column still nullable —
  // caught only by the final check, and only because somebody ran it against a
  // database that had never been migrated. Testing it as a *second* pass, where
  // the column already existed, hid the bug completely.
  const afterBackfill = new Map(
    (await attendanceColumns()).map((column) => [column.column_name, column]),
  )
  if (afterBackfill.get("companyId")?.is_nullable === "YES") {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Attendance" ALTER COLUMN "companyId" SET NOT NULL`,
    )
    console.log("companyId is now NOT NULL.")
  } else {
    console.log("companyId is already NOT NULL.")
  }

  // --- Step 2: the unique key, narrowed. Check before changing anything.
  const duplicates = await prisma.$queryRaw<
    Array<{ date: Date; shift: string; employeeId: string; n: bigint }>
  >`
    SELECT date, shift, "employeeId", COUNT(*) AS n
    FROM "Attendance"
    GROUP BY date, shift, "employeeId"
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 20
  `
  if (duplicates.length > 0) {
    console.error(
      "\nThese (date, shift, employee) combinations appear more than once, so the " +
        "narrowed unique key cannot be created:",
    )
    for (const row of duplicates) {
      console.error(
        `  ${row.date.toISOString().slice(0, 10)} ${row.shift} employee ${row.employeeId} — ${Number(row.n)} rows`,
      )
    }
    console.error(
      "\nEach is the same person marked twice for one shift, most likely at two " +
        "different sites. Decide which row is right and delete the other, then run " +
        "this again. Nothing has been changed.",
    )
    process.exit(1)
  }

  const indexes = await uniqueIndexes()
  const covers = (cols: string[], wanted: string[]) =>
    cols.length === wanted.length && wanted.every((column) => cols.includes(column))

  const hasNarrow = indexes.some((index) =>
    covers(index.cols, ["date", "shift", "employeeId"]),
  )
  const wide = indexes.filter((index) => index.cols.includes("siteId"))

  await prisma.$transaction(async (tx) => {
    if (!hasNarrow) {
      // The name Prisma expects for `@@unique([date, shift, employeeId])`, so the
      // push afterwards recognises it rather than creating a second one.
      await tx.$executeRawUnsafe(
        `CREATE UNIQUE INDEX "Attendance_date_shift_employeeId_key" ` +
          `ON "Attendance" ("date", "shift", "employeeId")`,
      )
      console.log("Created the narrowed unique index.")
    } else {
      console.log("Narrowed unique index already present.")
    }

    for (const index of wide) {
      await tx.$executeRawUnsafe(`DROP INDEX "${index.indexname}"`)
      console.log(`Dropped the old unique index ${index.indexname}.`)
    }

    // --- Step 3: siteId optional.
    // Same freshly-read state, for the same reason.
    if (afterBackfill.get("siteId")?.is_nullable === "NO") {
      await tx.$executeRawUnsafe(`ALTER TABLE "Attendance" ALTER COLUMN "siteId" DROP NOT NULL`)
      console.log("siteId is now nullable.")
    } else {
      console.log("siteId is already nullable.")
    }
  })

  const after = await attendanceColumns()
  const afterByName = new Map(after.map((column) => [column.column_name, column]))
  const ok =
    afterByName.get("companyId")?.is_nullable === "NO" &&
    afterByName.get("siteId")?.is_nullable === "YES"
  if (!ok) {
    console.error("\nThe table did not end up in the expected shape:")
    console.error(`  companyId nullable: ${afterByName.get("companyId")?.is_nullable}`)
    console.error(`  siteId nullable: ${afterByName.get("siteId")?.is_nullable}`)
    process.exit(1)
  }
  console.log("\nDone. Run `pnpm db:push` — it should report no changes.")
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
