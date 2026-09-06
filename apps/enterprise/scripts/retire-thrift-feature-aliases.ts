/**
 * Merges the legacy `thrift.*` feature flags onto their retail keys, and deletes them.
 *
 *   npx tsx scripts/retire-thrift-feature-aliases.ts            # report only
 *   npx tsx scripts/retire-thrift-feature-aliases.ts --apply
 *
 * The `TODO` on `lib/platform/entitlements.ts:372`, discharged.
 *
 * ── What the alias was hiding ──────────────────────────────────────────────
 *
 * Retail was called Thrift once. `normalizeFeatureKey` folds the old namespace
 * onto the new one, so a `CompanyFeatureFlag` row written before the rename
 * still turns the right surface on. That much works.
 *
 * What did not work is a tenant holding **both** rows. `getCompanyFeatureMap`
 * wrote whichever Prisma returned last, so entitlements depended on row order —
 * and switching four `thrift.*` keys off on a tenant that also had `retail.*`
 * rows silently took `retail.core`, `retail.pos`, `retail.catalog` and
 * `retail.purchasing` down with them. The workspace lost most of its sidebar
 * while every retail flag still read `true` in the database.
 *
 * That was fixed in code with an explicit precedence rule: a canonical row wins,
 * an alias row applies only where there is no canonical one. The rule is
 * correct and it is also a translation layer that has to be carried forever.
 * `AGENTS.md` asks for obsolete paths to be removed rather than translated, so
 * this is the data half: merge the duplicates, delete the legacy rows, and let
 * the aliases go.
 *
 * ── The merge rule, and why it is not "newest wins" ────────────────────────
 *
 * Where both rows exist, **the canonical row wins and the legacy row is
 * deleted.** Not the more recent one, and not a boolean OR.
 *
 * The canonical row is the one every screen in the product writes today: the
 * feature toggles, the template application, `grantBundleToCompany`. A
 * `thrift.*` row can only have been written before the rename, so preferring it
 * would resurrect a decision somebody made under a different product name and
 * has had no way to revisit since. Preferring the canonical row means this
 * script changes **nothing** about what the tenant is entitled to — which is
 * exactly what the precedence rule in `entitlements.ts` already computes, so
 * the effective map is identical before and after.
 *
 * Where only the legacy row exists, its value is carried onto the canonical key
 * before the row goes. That tenant *is* affected in the database and not in the
 * result: same answer, one row instead of two.
 *
 * ── Why a script ───────────────────────────────────────────────────────────
 *
 * It is a data migration, and it deletes. Report by default; `--apply` is the
 * only way anything changes. It prints every row it would touch and what the
 * effective answer is on each side, so the claim "no tenant's entitlements
 * change" is checkable rather than asserted.
 *
 * Idempotent: a second run finds nothing to do and says so.
 */

import "@/scripts/lib/env";

import { prisma } from "@corelithzw/db/client"

const APPLY = process.argv.includes("--apply")

/**
 * The five this retires. The `hr.*` → `settlements.*` aliases in the same map
 * belong to another module's rename and are deliberately left alone — merging
 * them is that module's ticket, and doing it here would put a settlements
 * decision in a retail commit.
 */
const RETIRING: Record<string, string> = {
  "thrift.core": "retail.core",
  "thrift.catalog": "retail.catalog",
  "thrift.checkout": "retail.pos",
  "thrift.intake": "retail.purchasing",
  "portal.thrift": "portal.pos",
}

type FlagRow = {
  id: string
  companyId: string
  companyName: string
  key: string
  isEnabled: boolean
}

async function legacyFlags(): Promise<FlagRow[]> {
  const rows = await prisma.companyFeatureFlag.findMany({
    where: { feature: { key: { in: Object.keys(RETIRING) } } },
    select: {
      id: true,
      companyId: true,
      isEnabled: true,
      feature: { select: { key: true } },
      company: { select: { name: true } },
    },
  })
  return rows.map((row) => ({
    id: row.id,
    companyId: row.companyId,
    companyName: row.company.name,
    key: row.feature.key,
    isEnabled: row.isEnabled,
  }))
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (/\bprod(uction)?\b/.test(databaseUrl)) {
    throw new Error("DATABASE_URL looks like production. Refusing to delete rows.")
  }

  const legacy = await legacyFlags()
  if (legacy.length === 0) {
    console.log("No `thrift.*` or `portal.thrift` flag rows anywhere. Nothing to migrate.")
    console.log("The aliases can be removed from lib/platform/gating/catalog-utils.ts.")
    return
  }

  console.log(`${legacy.length} legacy flag row(s) across ${new Set(legacy.map((row) => row.companyId)).size} tenant(s).\n`)

  /* ── Work out what happens to each, before touching anything ─────────── */

  const canonicalKeys = [...new Set(Object.values(RETIRING))]
  const canonicalFeatures = await prisma.platformFeature.findMany({
    where: { key: { in: canonicalKeys } },
    select: { id: true, key: true },
  })
  const featureIdByKey = new Map(canonicalFeatures.map((row) => [row.key, row.id]))

  const missingCanonical = canonicalKeys.filter((key) => !featureIdByKey.has(key))
  if (missingCanonical.length > 0) {
    console.error(
      `\nThese canonical features do not exist in PlatformFeature: ${missingCanonical.join(", ")}. ` +
        "Refusing — a merge with nowhere to merge into would delete the tenant's entitlement.",
    )
    process.exit(1)
  }

  const existingCanonical = await prisma.companyFeatureFlag.findMany({
    where: {
      companyId: { in: [...new Set(legacy.map((row) => row.companyId))] },
      feature: { key: { in: canonicalKeys } },
    },
    select: { companyId: true, isEnabled: true, feature: { select: { key: true } } },
  })
  const canonicalByPair = new Map(
    existingCanonical.map((row) => [`${row.companyId}::${row.feature.key}`, row.isEnabled]),
  )

  const toDelete: FlagRow[] = []
  const toCarry: Array<{ row: FlagRow; canonicalKey: string }> = []

  for (const row of legacy) {
    const canonicalKey = RETIRING[row.key]
    const pair = `${row.companyId}::${canonicalKey}`
    if (canonicalByPair.has(pair)) {
      const canonicalValue = canonicalByPair.get(pair)
      console.log(
        `  ${row.companyName}: ${row.key}=${row.isEnabled} beside ${canonicalKey}=${canonicalValue} ` +
          `→ delete the legacy row, keep ${canonicalValue}` +
          (canonicalValue === row.isEnabled ? "" : "  (they disagree; the canonical row wins)"),
      )
      toDelete.push(row)
    } else {
      console.log(`  ${row.companyName}: ${row.key}=${row.isEnabled} alone → becomes ${canonicalKey}=${row.isEnabled}`)
      toCarry.push({ row, canonicalKey })
    }
  }

  console.log(
    `\n${toDelete.length} duplicate(s) to drop, ${toCarry.length} value(s) to carry across. ` +
      "No tenant's effective entitlements change: this is the same answer " +
      "`getCompanyFeatureMap` already computes from its precedence rule.",
  )

  if (!APPLY) {
    console.log("\nReport only. Re-run with --apply.")
    return
  }

  /* ── Apply ───────────────────────────────────────────────────────────── */

  await prisma.$transaction(async (tx) => {
    for (const { row, canonicalKey } of toCarry) {
      const featureId = featureIdByKey.get(canonicalKey)
      if (!featureId) throw new Error(`No PlatformFeature ${canonicalKey}`)
      await tx.companyFeatureFlag.create({
        data: { companyId: row.companyId, featureId, isEnabled: row.isEnabled },
      })
    }
    await tx.companyFeatureFlag.deleteMany({
      where: { id: { in: [...toDelete, ...toCarry.map((entry) => entry.row)].map((row) => row.id) } },
    })
  })

  /*
    The legacy `PlatformFeature` rows themselves stay.

    They are catalogue entries, not tenant data, and nothing references them
    once the flags are gone. Deleting them would break
    `entitlements.test.ts`, which looks `thrift.core` up by key and skips
    itself when it is absent — a test that skips is a test nobody notices has
    stopped running. Retiring the catalogue rows is a separate decision from
    retiring the tenant rows, and only the second one was owed.
  */

  const remaining = await legacyFlags()
  if (remaining.length > 0) {
    console.error(`\n${remaining.length} legacy row(s) survived:`)
    for (const row of remaining) console.error(`  ${row.companyName}: ${row.key}`)
    process.exit(1)
  }

  console.log(
    `\nDone. Every tenant now holds one row per retail key. ` +
      "The five aliases can come out of lib/platform/gating/catalog-utils.ts.",
  )
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
