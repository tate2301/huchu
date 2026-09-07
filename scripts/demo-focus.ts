/**
 * Narrows a tenant to one vertical, so its workspace looks like a customer's.
 *
 *   npx tsx scripts/demo-focus.ts --slug stmarys --profile SCHOOLS
 *   npx tsx scripts/demo-focus.ts --slug huchu-enterprises --profile GOLD_MINE
 *   npx tsx scripts/demo-focus.ts --slug acme --restore
 *
 * `seed-staging-tenant.ts` grants every feature in the catalogue — 120 of them
 * — which is right for a preview build and wrong for a demo. A gold mine opens
 * its sidebar and finds Students, Attendance, Academics, Results and Boarding
 * under "More"; a school finds Run the Floor and Range & Stock. Nobody's
 * customer looks like that, and the alternative to fixing it is cropping the
 * sidebar out of every screenshot forever.
 *
 * ## Two switches, not one
 *
 * The sidebar is built from `getVisibleModules()`, which reads the tenant's
 * **enabled features**, and then arranged by the **workspace profile** recipe.
 * Set only the profile and you reorder the noise; disable only the features and
 * the workspace is labelled General and homed on `/dashboard`. Both, always.
 *
 * ## Where the keep list comes from
 *
 * From `VERTICAL_PRODUCT_BUNDLES`, not from a list in this file. Each bundle
 * already declares its `primaryModules` and `foundationalModules` — the same
 * question, asked once, answered where the product is defined.
 * `scripts/retail-demo-focus.ts`, which this generalises, hard-codes its keep
 * list; that answer had already drifted from the bundle by the time anybody
 * looked.
 *
 * ## Reversible
 *
 * `--restore` clears every disable-row this script wrote and sets the profile
 * back to GENERAL, which hands the tenant back to its subscription — where it
 * started. Nothing about the tenant's data is touched and there is no snapshot
 * file to lose.
 *
 * Never point it at production.
 */

import "dotenv/config";

import { WorkspaceProfile } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { FEATURE_CATALOG } from "@/lib/platform/feature-catalog";
import {
  resolveWorkspaceVerticalProductBundle,
  WORKSPACE_PROFILES,
  type WorkspaceModuleId,
  type WorkspaceProfile as WorkspaceProfileName,
} from "@/lib/workspace-products";

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  for (let index = 0; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === `--${name}`) return process.argv[index + 1];
    if (argument.startsWith(prefix)) return argument.slice(prefix.length);
  }
  return undefined;
}

/**
 * The feature namespace each module owns.
 *
 * Mostly the module id. The exceptions are historical rather than meaningful:
 * People and Payroll are both `hr.*` because HR was one module before it was
 * two, Reporting is `reports.*`, and Management is `admin.*`. Taken from the
 * `featureKey` each module declares in `lib/navigation.ts`.
 */
const MODULE_DOMAINS: Record<WorkspaceModuleId, string[]> = {
  // `settlements.*` too: `settlements.core` and `settlements.gold` are what
  // gate /gold/settlement/approvals and /gold/settlement/payouts. Leaving them
  // out took two screens off the mine and the e2e suite said so.
  gold: ["gold", "settlements"],
  schools: ["schools"],
  // `thrift.*` is the retail namespace's former name and still gates four
  // capabilities through `normalizeFeatureKey`.
  retail: ["retail", "thrift"],
  crm: ["crm"],
  people: ["hr"],
  payroll: ["hr"],
  stores: ["stores"],
  maintenance: ["maintenance"],
  reporting: ["reports"],
  accounting: ["accounting"],
  management: ["admin"],
};

/**
 * Kept whatever the vertical. `core` is the platform itself; `portal.core` is
 * the shell every portal needs.
 */
const ALWAYS_KEEP_DOMAINS = [
  "core",
  // Shift reports, plant reports and marking attendance. Operational data
  // entry that several verticals hang off rather than a module of its own —
  // the gold seed writes `ShiftReport` rows, and a school marks a register.
  "ops",
];
const ALWAYS_KEEP_KEYS = new Set(["portal.core"]);

/**
 * The portal each vertical actually uses.
 *
 * Listed per profile rather than kept wholesale, because a school with the POS
 * portal switched on has a till it will never open and a menu item explaining
 * that it has one.
 */
const PROFILE_PORTALS: Partial<Record<WorkspaceProfileName, string[]>> = {
  RETAIL: ["portal.pos"],
  // One key for all three school portals — student, parent and staff share
  // `portal.schools`. The first draft of this guessed at
  // `portal.students`/`portal.parents`/`portal.staff`, none of which exist in
  // the catalogue, so the school kept no portal at all.
  SCHOOLS: ["portal.schools"],
};

async function main() {
  const slug = (readArg("slug") ?? "").trim().toLowerCase();
  const restore = process.argv.includes("--restore");
  if (!slug) throw new Error("--slug is required.");

  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (/\bprod(uction)?\b/.test(databaseUrl)) {
    throw new Error("DATABASE_URL looks like production. Refusing to change entitlements.");
  }

  const company = await prisma.company.findUnique({
    where: { slug },
    select: { id: true, name: true, workspaceProfile: true },
  });
  if (!company) throw new Error(`No company with slug "${slug}".`);

  /*
    Entitlement comes from the subscription, not from flags.

    `seed-staging-tenant.ts` grants the top tier plus every addon bundle and
    writes **no `CompanyFeatureFlag` rows at all** — the first version of this
    script assumed there would be rows to flip and refused to run on a single
    seeded tenant.

    A flag is still the right lever, but it has to be created rather than
    edited. `getCompanyFeatureMap` resolves each key as
    `requested && (!isBillable || subscriptionEntitled.has(key))`, so an
    explicit row set to `false` turns a feature off even where the subscription
    entitles it. Switching a feature *on* this way does nothing unless the
    subscription already allows it, which is correct: this script narrows a
    demo, it does not sell anything.
  */
  const catalogue = await prisma.platformFeature.findMany({
    select: { id: true, key: true },
  });
  if (catalogue.length === 0) {
    throw new Error("The platform feature catalogue is empty. Run the catalogue sync first.");
  }

  if (restore) {
    // Every row this script wrote was a deliberate `false`; clearing them hands
    // the tenant back to its subscription, which is where it started.
    const removed = await prisma.companyFeatureFlag.deleteMany({
      where: { companyId: company.id, isEnabled: false },
    });
    await prisma.company.update({
      where: { id: company.id },
      data: { workspaceProfile: WorkspaceProfile.GENERAL },
    });
    console.log(
      `Restored ${company.name}: ${removed.count} disable-flag(s) cleared, profile GENERAL.`,
    );
    return;
  }

  const profile = (readArg("profile") ?? "").trim().toUpperCase();
  if (!WORKSPACE_PROFILES.includes(profile as WorkspaceProfileName)) {
    throw new Error(`--profile is required, and one of: ${WORKSPACE_PROFILES.join(", ")}`);
  }
  const profileName = profile as WorkspaceProfileName;

  const bundle = resolveWorkspaceVerticalProductBundle({
    enabledFeatures: undefined,
    workspaceProfile: profileName,
  });
  const modules = [...bundle.primaryModules, ...bundle.foundationalModules];
  const domains = new Set([
    ...ALWAYS_KEEP_DOMAINS,
    ...modules.flatMap((module) => MODULE_DOMAINS[module] ?? [module]),
  ]);
  const keys = new Set([...ALWAYS_KEEP_KEYS, ...(PROFILE_PORTALS[profileName] ?? [])]);

  const isKept = (key: string) =>
    keys.has(key) || [...domains].some((domain) => key === domain || key.startsWith(`${domain}.`));

  const keep = catalogue.filter((feature) => isKept(feature.key));
  const drop = catalogue.filter((feature) => !isKept(feature.key));

  // A `false` row per unwanted key, and no row at all for the kept ones — an
  // absent flag means "whatever the subscription says", which for a kept
  // feature is exactly right.
  for (const feature of drop) {
    await prisma.companyFeatureFlag.upsert({
      where: { companyId_featureId: { companyId: company.id, featureId: feature.id } },
      update: { isEnabled: false, reason: "demo-focus" },
      create: {
        companyId: company.id,
        featureId: feature.id,
        isEnabled: false,
        reason: "demo-focus",
      },
    });
  }
  await prisma.companyFeatureFlag.deleteMany({
    where: { companyId: company.id, featureId: { in: keep.map((f) => f.id) }, isEnabled: false },
  });

  const turnedOff = drop;

  await prisma.company.update({
    where: { id: company.id },
    data: { workspaceProfile: profileName as WorkspaceProfile },
  });

  const byDomain = new Map<string, number>();
  for (const flag of turnedOff) {
    const domain = flag.key.split(".")[0];
    byDomain.set(domain, (byDomain.get(domain) ?? 0) + 1);
  }

  console.log(`${company.name}: ${company.workspaceProfile} -> ${profileName} (${bundle.label})`);
  console.log(`  modules      ${modules.join(", ")}`);
  console.log(`  kept         ${keep.length} feature(s)`);
  console.log(`  switched off ${turnedOff.length}`);
  for (const [domain, count] of [...byDomain].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${domain.padEnd(14)} ${count}`);
  }
  /*
    Say what could not be reached.

    A `CompanyFeatureFlag` needs a `featureId`, so a feature with no
    `PlatformFeature` row cannot be switched off for one tenant at all. The
    table holds 62 of the catalogue's 122 keys on this database — every `crm.*`
    key is missing, and all but one `schools.*` — so a gold mine narrowed by
    this script still shows CRM under "More".

    `scripts/platform/sync-catalog.ts` is named as though it fixes this and does
    not: `syncCommercialCatalog` ensures subscription *plans* and then returns
    the in-code array lengths, so it reports "features: 122" having written no
    feature rows at all. Worth fixing, and not from here — creating sixty
    catalogue rows changes what the admin console offers for every tenant on
    the platform, which wants its own review.
  */
  const known = new Set(catalogue.map((feature) => feature.key));
  const unreachable = FEATURE_CATALOG.map((feature) => feature.key).filter(
    (key) => !isKept(key) && !known.has(key),
  );
  if (unreachable.length > 0) {
    const domains = [...new Set(unreachable.map((key) => key.split(".")[0]))].sort();
    console.log(
      `
  ${unreachable.length} feature(s) could not be switched off: no PlatformFeature row.`,
    );
    console.log(`    domains: ${domains.join(", ")}`);
    console.log("    these stay visible in the sidebar. See the note in this file.");
  }

  console.log(`\n  reverse with: npx tsx scripts/demo-focus.ts --slug ${slug} --restore`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
