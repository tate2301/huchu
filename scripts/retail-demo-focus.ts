/**
 * Narrows a tenant to the retail workspace and nothing else.
 *
 *   npx tsx scripts/retail-demo-focus.ts --slug acme
 *   npx tsx scripts/retail-demo-focus.ts --slug acme --restore
 *
 * **TODO — not yet run against the shared database.** It has been run once on
 * `acme`, before `getCompanyFeatureMap` was given alias precedence, which left
 * that tenant with the four `thrift.*` keys off. Re-run it once the entitlements
 * change is deployed so the workspace reflects the keep list below; until then
 * `acme` is narrowed but its retail sidebar is short.
 *
 * A tenant seeded by `seed-staging-tenant.ts` gets every feature in the
 * catalogue, which is right for a preview build and wrong for a demo: the
 * sidebar opens on Scrap Ticketing, Gold Operations and School Admissions, and a
 * bottle store owner has to be told to ignore most of their own screen.
 *
 * ## Two switches, not one
 *
 * The sidebar is built from `getVisibleModules(context)`, which reads the
 * tenant's **enabled features**, and then arranged by the **workspace profile**
 * recipe. Setting only the profile reorders the noise; disabling only the
 * features leaves the workspace labelled General and homed on `/dashboard`. Both
 * are set here.
 *
 * `WorkspaceProfile.RETAIL` is `@map("THRIFT")` in the database — the profile
 * predates the rename and the column still holds the old label. That is a
 * mapping, not a mistake; writing `RETAIL` through Prisma is correct.
 *
 * ## What counts as "retail related"
 *
 * The keep list below is a product decision, made for a Zimbabwean liquor store
 * and recorded here rather than passed on the command line, so that what the
 * demo shows is reviewable:
 *
 *  - **`retail.*`** — the module.
 *  - **`portal.core` + `portal.pos`** — the till. Staff spend the day in it. The
 *    other portals (schools, autos, thrift) go.
 *  - **`stores.*` except the fuel ledger** — a retail catalogue item *is* an
 *    inventory item; stock on hand, movements and receiving are the same rows the
 *    shop counts. The fuel ledger is a mining surface.
 *  - **`accounting.*`** — every posted sale writes a journal through
 *    `postRetailJournal`. Hiding the ledger would hide where the money went.
 *  - **`crm.customers`** — switched *on*, not off. `/retail/customers` is gated on
 *    it in the route registry, so the retail customer list was dark on this tenant
 *    while the rest of retail was lit.
 *  - **`core.*` and `admin.user-management.*`** — sign-in, branding, notifications,
 *    and adding a cashier. `admin.payroll-config` goes with payroll.
 *  - **three of the fourteen `reports.*`** — the dashboard, audit trails and stock
 *    movements. The rest are gold, cctv, plant, fuel and attendance.
 *
 * Everything else is switched off: autos, cctv, compliance, gold, hr,
 * maintenance, schools, scrap-metal, thrift, and the shift/plant/attendance
 * operations keys.
 *
 * ## Reversing it
 *
 * `--restore` re-enables every feature flag the tenant has and puts the profile
 * back to `GENERAL`, which is the state `seed-staging-tenant.ts` leaves. Nothing
 * is deleted either way — a `CompanyFeatureFlag` row is flipped, not removed — so
 * this is reversible without a snapshot file to lose.
 */

import "dotenv/config"

import { WorkspaceProfile } from "@prisma/client"
import { prisma } from "@/lib/prisma"

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`
  for (let index = 0; index < process.argv.length; index += 1) {
    const argument = process.argv[index]
    if (argument === `--${name}`) return process.argv[index + 1]
    if (argument.startsWith(prefix)) return argument.slice(prefix.length)
  }
  return undefined
}

/**
 * Whole domains the retail workspace keeps.
 *
 * `thrift` is deliberately **not** here. It used to have to be: `normalizeFeatureKey`
 * folds `thrift.core` onto `retail.core`, `thrift.catalog` onto `retail.catalog`,
 * `thrift.checkout` onto `retail.pos` and `thrift.intake` onto `retail.purchasing`,
 * and `getCompanyFeatureMap` let whichever row Prisma returned last win — so
 * switching the four legacy keys off took those four retail capabilities with them
 * while every retail flag still read `true`. `getCompanyFeatureMap` now gives the
 * canonical row precedence, so the legacy namespace can go dark on its own.
 */
const KEEP_DOMAINS = ["retail", "accounting", "core"]

/** Individual keys kept from domains that are otherwise switched off. */
const KEEP_KEYS = new Set([
  "portal.core",
  "portal.pos",
  "stores.dashboard",
  "stores.inventory",
  "stores.movements",
  "stores.receive",
  "stores.issue",
  // Split out of `stores.inventory`, which this tenant already keeps — so these
  // are the same two screens it could always open, not two new ones. They are
  // not in the retail sidebar (retail has its own catalogue and price board);
  // they are reachable as tabs of the Stores shell, and S-3/S-4 make them
  // retail's own.
  "stores.catalogue",
  "stores.price-lists",
  "crm.core",
  "crm.customers",
  "reports.dashboard",
  "reports.audit-trails",
  "reports.stores-movements",
  "admin.user-management.core",
  "admin.user-management.create",
  "admin.user-management.directory",
  "admin.user-management.status",
  "admin.user-management.role-change",
  "admin.user-management.password-reset",
  "admin.user-management.feature-access",
  "admin.sites-sections",
  "admin.feature-flags-console",
  "admin.subscription-console",
])

function isKept(key: string) {
  if (KEEP_KEYS.has(key)) return true
  return KEEP_DOMAINS.some((domain) => key === domain || key.startsWith(`${domain}.`))
}

async function main() {
  const slug = (readArg("slug") ?? "").trim().toLowerCase()
  const restore = process.argv.includes("--restore")
  if (!slug) throw new Error("--slug is required.")

  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (/\bprod(uction)?\b/.test(databaseUrl)) {
    throw new Error("DATABASE_URL looks like production. Refusing to change entitlements.")
  }

  const company = await prisma.company.findUnique({
    where: { slug },
    select: { id: true, name: true, workspaceProfile: true },
  })
  if (!company) throw new Error(`No company with slug "${slug}".`)

  const flags = await prisma.companyFeatureFlag.findMany({
    where: { companyId: company.id },
    select: { id: true, isEnabled: true, feature: { select: { key: true } } },
  })
  if (flags.length === 0) {
    throw new Error(`${company.name} has no feature flags. Run seed-staging-tenant.ts first.`)
  }

  if (restore) {
    const toEnable = flags.filter((flag) => !flag.isEnabled).map((flag) => flag.id)
    if (toEnable.length > 0) {
      await prisma.companyFeatureFlag.updateMany({
        where: { id: { in: toEnable } },
        data: { isEnabled: true },
      })
    }
    await prisma.company.update({
      where: { id: company.id },
      data: { workspaceProfile: WorkspaceProfile.GENERAL },
    })
    console.log(`Restored ${company.name}: ${toEnable.length} feature(s) re-enabled, profile GENERAL.`)
    return
  }

  // A key on the keep list with no `CompanyFeatureFlag` row at all is not simply
  // "off" — it is absent, and flipping rows would never reach it. `crm.customers`
  // is the case that matters: it gates `/retail/customers`, it is billable and
  // `defaultEnabled: false`, and a tenant seeded before CRM existed has no row for
  // it. So the missing rows are created here rather than silently skipped.
  const present = new Set(flags.map((flag) => flag.feature.key))
  const missing = [...KEEP_KEYS].filter((key) => !present.has(key))
  if (missing.length > 0) {
    const features = await prisma.platformFeature.findMany({
      where: { key: { in: missing } },
      select: { id: true, key: true },
    })
    for (const feature of features) {
      await prisma.companyFeatureFlag.create({
        data: { companyId: company.id, featureId: feature.id, isEnabled: true },
      })
    }
    const unknown = missing.filter((key) => !features.some((feature) => feature.key === key))
    console.log(`  created ${features.length} missing flag(s): ${features.map((f) => f.key).join(", ")}`)
    if (unknown.length > 0) {
      console.warn(`  no such feature in the catalogue: ${unknown.join(", ")}`)
    }
  }

  const refreshed = await prisma.companyFeatureFlag.findMany({
    where: { companyId: company.id },
    select: { id: true, isEnabled: true, feature: { select: { key: true } } },
  })

  const keep = refreshed.filter((flag) => isKept(flag.feature.key))
  const drop = refreshed.filter((flag) => !isKept(flag.feature.key))

  // `crm.customers` is the one that goes the other way: it gates
  // `/retail/customers` and was dark on this tenant.
  const turnedOn = keep.filter((flag) => !flag.isEnabled)
  const turnedOff = drop.filter((flag) => flag.isEnabled)

  if (turnedOn.length > 0) {
    await prisma.companyFeatureFlag.updateMany({
      where: { id: { in: turnedOn.map((flag) => flag.id) } },
      data: { isEnabled: true },
    })
  }
  if (turnedOff.length > 0) {
    await prisma.companyFeatureFlag.updateMany({
      where: { id: { in: turnedOff.map((flag) => flag.id) } },
      data: { isEnabled: false },
    })
  }

  await prisma.company.update({
    where: { id: company.id },
    data: { workspaceProfile: WorkspaceProfile.RETAIL },
  })

  const byDomain = new Map<string, number>()
  for (const flag of turnedOff) {
    const domain = flag.feature.key.split(".")[0]
    byDomain.set(domain, (byDomain.get(domain) ?? 0) + 1)
  }

  console.log(`${company.name}: workspaceProfile ${company.workspaceProfile} → RETAIL`)
  console.log(`  kept    ${keep.length} feature(s)`)
  if (turnedOn.length > 0) {
    console.log(`  enabled ${turnedOn.map((flag) => flag.feature.key).join(", ")}`)
  }
  console.log(`  disabled ${turnedOff.length} feature(s):`)
  for (const [domain, count] of [...byDomain.entries()].sort()) {
    console.log(`    ${domain.padEnd(14)} ${count}`)
  }
  console.log("\nReverse with --restore.")
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
