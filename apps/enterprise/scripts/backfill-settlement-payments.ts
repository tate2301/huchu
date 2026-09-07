/**
 * Moves the gold half of `EmployeePayment` into `SettlementPayment`.
 *
 * **Run this before `pnpm db:push` picks up the schema change that drops those
 * columns.** The repo uses `db push`, not migrations, so nothing sequences this
 * for you — and `db push` will happily drop `goldWeightGrams` along with every
 * weight in it. Once the columns are gone the numbers are gone; there is no
 * second chance and no way to recompute a historical gram figure from the money.
 *
 * Safe to run twice: it keys on `SettlementPayment.notes` carrying the source
 * row's id, so a second pass finds the rows already migrated and skips them.
 *
 * Everything here is raw SQL on purpose. The generated Prisma client no longer
 * knows the columns being read, so a typed query cannot see them.
 */

// `new PrismaClient()` with no arguments throws on Prisma 7 — it requires a driver
// adapter — so this script could not run at all. The shared client in
// `lib/prisma.ts` builds that adapter, and `dotenv/config` gives it a
// `DATABASE_URL` to build it from.
import "@/scripts/lib/env";

import { prisma } from "@corelithzw/db/client"

const MIGRATED_NOTE_PREFIX = "MIGRATED_FROM_EMPLOYEE_PAYMENT:"

type LegacyGoldPayment = {
  id: string
  employeeId: string
  companyId: string
  payoutSource: string | null
  goldWeightGrams: number | null
  goldPriceUsdPerGram: number | null
  valuationDate: Date | null
  amount: number
  amountUsd: number | null
  paidAmount: number | null
  paidAmountUsd: number | null
  unit: string
  periodStart: Date
  periodEnd: Date
  dueDate: Date
  paidAt: Date | null
  status: string
  notes: string | null
  createdById: string
  goldShiftAllocationId: string | null
}

async function columnExists(table: string, column: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT count(*)::bigint AS count
       FROM information_schema.columns
      WHERE table_name = $1 AND column_name = $2`,
    table,
    column,
  )
  return Number(rows[0]?.count ?? 0) > 0
}

async function main() {
  // If the columns are already gone this has either run or was never needed.
  // Either way, saying so beats a stack trace.
  if (!(await columnExists("EmployeePayment", "goldWeightGrams"))) {
    console.log(
      "EmployeePayment.goldWeightGrams is already gone — nothing to migrate.\n" +
        "If this workspace held gold payouts and you have not run this before, " +
        "restore from a backup taken before the schema push.",
    )
    return
  }

  const legacy = await prisma.$queryRawUnsafe<LegacyGoldPayment[]>(`
    SELECT p.id,
           p."employeeId",
           e."companyId",
           p."payoutSource"::text AS "payoutSource",
           p."goldWeightGrams",
           p."goldPriceUsdPerGram",
           p."valuationDate",
           p.amount,
           p."amountUsd",
           p."paidAmount",
           p."paidAmountUsd",
           p.unit,
           p."periodStart",
           p."periodEnd",
           p."dueDate",
           p."paidAt",
           p.status::text AS status,
           p.notes,
           p."createdById",
           p."goldShiftAllocationId"
      FROM "EmployeePayment" p
      JOIN "Employee" e ON e.id = p."employeeId"
     WHERE p.type::text <> 'SALARY'
     ORDER BY p."createdAt" ASC
  `)

  console.log(`Found ${legacy.length} non-salary payments to migrate.`)

  let migrated = 0
  let skipped = 0

  for (const row of legacy) {
    const marker = `${MIGRATED_NOTE_PREFIX}${row.id}`
    const already = await prisma.settlementPayment.count({
      where: { companyId: row.companyId, notes: { contains: marker } },
    })
    if (already > 0) {
      skipped += 1
      continue
    }

    // A gold row put the weight in `amount` and the money in `amountUsd`.
    // Everything else put money in `amount`. Read each in the units it meant,
    // rather than trusting one column to mean the same thing twice.
    const isGold = (row.payoutSource ?? "GOLD") === "GOLD"
    const quantity = isGold ? (row.goldWeightGrams ?? row.amount) : 0
    const amount = isGold ? (row.amountUsd ?? row.amount) : row.amount
    const paidAmount = isGold
      ? (row.paidAmountUsd ?? row.paidAmount)
      : row.paidAmount

    await prisma.settlementPayment.create({
      data: {
        companyId: row.companyId,
        employeeId: row.employeeId,
        source: (row.payoutSource ?? "GOLD") as
          | "GOLD"
          | "SCRAP"
          | "COMMISSION"
          | "OTHER",
        quantity,
        unit: isGold ? "g" : row.unit,
        valuationDate: row.valuationDate,
        unitPrice: row.goldPriceUsdPerGram,
        amount,
        paidAmount,
        // The currency, which on a gold row `unit` did not hold — it held "g".
        currency: isGold ? "USD" : row.unit,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        dueDate: row.dueDate,
        paidAt: row.paidAt,
        status: row.status,
        notes: [row.notes?.trim(), marker].filter(Boolean).join(" "),
        createdById: row.createdById,
      },
    })
    migrated += 1
  }

  console.log(`Migrated ${migrated}, skipped ${skipped} already done.`)
  console.log(
    "Now run `pnpm db:push && pnpm db:generate`. The gold columns drop in that step.",
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
