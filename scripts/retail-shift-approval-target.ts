/**
 * Lets a cash-up be recorded as an approval.
 *
 *   npx tsx scripts/retail-shift-approval-target.ts            # report only
 *   npx tsx scripts/retail-shift-approval-target.ts --apply
 *
 * R-3.3. `ApprovalTargetType` names the eleven things this platform records a
 * sign-off against — a payroll run, a disbursement batch, a leave request. A
 * retail cash-up belongs on that list and was not on it.
 *
 * The plan puts it plainly: cash control is the retail payroll run. Somebody
 * counts a figure, it is checked against a figure the system derived, and the
 * difference is signed off — often by a manager standing over a drawer that is
 * not theirs. That is the same shape as approving a payroll run, and it should
 * appear in the same table so "show me every sign-off this person made" has one
 * answer rather than one per module.
 *
 * ── Why a script ───────────────────────────────────────────────────────────
 *
 * `prisma db push` cannot reach this database (P1001 — only a Neon pooler host
 * is configured), and adding a label to a Postgres enum is not something a push
 * does safely in any case. `ALTER TYPE … ADD VALUE` is additive and cannot fail
 * on existing rows: nothing holds the new label yet, by definition.
 *
 * **Removing an enum value is the operation to be afraid of, not adding one.**
 * Postgres refuses to drop a value a row still uses, and the alternatives —
 * rewriting those rows, or deleting them — falsify or destroy an audit trail.
 * `ApprovalTargetType` still carries `IRREGULAR_PAYOUT_BATCH` for exactly that
 * reason, and there is a note in `prisma/schema.prisma` explaining it.
 *
 * Idempotent: `ADD VALUE IF NOT EXISTS`, and a second run reports it present.
 */

import "dotenv/config"

import { prisma } from "@/lib/prisma"

const APPLY = process.argv.includes("--apply")

const TYPE = "ApprovalTargetType"
const LABEL = "RETAIL_SHIFT"

async function labels(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ enumlabel: string }[]>`
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = ${TYPE}
    ORDER BY e.enumsortorder
  `
  return rows.map((row) => row.enumlabel)
}

async function main() {
  const before = await labels()
  if (before.length === 0) {
    throw new Error(`No enum type "${TYPE}" in this database.`)
  }

  console.log(`"${TYPE}" carries ${before.length} label(s): ${before.join(", ")}`)

  if (before.includes(LABEL)) {
    console.log(`\n"${LABEL}" is already there. Nothing to do.`)
    return
  }

  if (!APPLY) {
    console.log(`\n"${LABEL}" is missing. Re-run with --apply to add it.`)
    return
  }

  /*
    Not parameterised, because it cannot be: `ALTER TYPE` takes an identifier
    and a literal, neither of which is a bind position. Both values are
    module constants a few lines up rather than anything reaching this from
    outside.
  */
  await prisma.$executeRawUnsafe(
    `ALTER TYPE "${TYPE}" ADD VALUE IF NOT EXISTS '${LABEL}'`,
  )

  const after = await labels()
  if (!after.includes(LABEL)) {
    console.error(`\n"${LABEL}" did not take: ${after.join(", ")}`)
    process.exit(1)
  }

  // Nothing was lost on the way. An enum that gains a value and drops another
  // is not a thing `ADD VALUE` can do, but reading it back costs one query and
  // catches the case where somebody ran two migrations at once.
  const lost = before.filter((label) => !after.includes(label))
  if (lost.length > 0) {
    console.error(`\nLabels disappeared: ${lost.join(", ")}`)
    process.exit(1)
  }

  console.log(`\nAdded "${LABEL}". "${TYPE}" now carries ${after.length} label(s).`)
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
