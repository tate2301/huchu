/**
 * Seed a workspace into a staging database so a preview deployment has
 * something to sign in to.
 *
 * A preview build points at a staging database, and a staging database that
 * nobody has seeded is a sign-in page you cannot get past. This creates the
 * tenant, one administrator, and an entitlement for every active feature, so
 * whatever the branch changed is reachable without hunting for the plan that
 * happens to include it.
 *
 * Idempotent — re-running updates the password and re-grants anything the
 * catalogue has gained since. Never point it at production.
 *
 *   npx tsx scripts/seed-staging-tenant.ts \
 *     --slug floorcode --email james@floorcodezim.com --password '…' \
 *     --name 'Floorcode' --user-name 'James'
 *
 * Run scripts/platform/sync-catalog.ts first on a fresh database, or there
 * will be no features to grant.
 */
import bcrypt from "bcryptjs";
import { type UserRole } from "@corelithzw/db";
import { FEATURE_BUNDLES, TIERS } from "@corelithzw/platform/feature-catalog";
import { disconnectPrisma, prisma } from "./platform/prisma";

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  for (let index = 0; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === `--${name}`) {
      return process.argv[index + 1];
    }
    if (argument.startsWith(prefix)) {
      return argument.slice(prefix.length);
    }
  }
  return undefined;
}

async function main() {
  const slug = (readArg("slug") ?? process.env.SEED_TENANT_SLUG ?? "").trim().toLowerCase();
  const email = (readArg("email") ?? process.env.SEED_TENANT_EMAIL ?? "").trim().toLowerCase();
  const password = readArg("password") ?? process.env.SEED_TENANT_PASSWORD ?? "";
  const companyName = readArg("name") ?? process.env.SEED_TENANT_NAME ?? slug;
  const userName = readArg("user-name") ?? process.env.SEED_TENANT_USER_NAME ?? "Staging Admin";
  const role = ((readArg("role") ?? "SUPERADMIN").trim().toUpperCase() as UserRole);

  if (!slug || !email || !password) {
    throw new Error("--slug, --email and --password are all required.");
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`Slug ${slug} is not a valid subdomain label.`);
  }

  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (/\bprod(uction)?\b/.test(databaseUrl)) {
    throw new Error("DATABASE_URL looks like production. Refusing to seed.");
  }

  // ACTIVE, not PROVISIONING: isTenantStatusActive gates every authenticated
  // request, and a PROVISIONING tenant signs in and is then turned away.
  const company = await prisma.company.upsert({
    where: { slug },
    update: { name: companyName, tenantStatus: "ACTIVE", isProvisioned: true },
    create: { name: companyName, slug, tenantStatus: "ACTIVE", isProvisioned: true },
    select: { id: true, name: true, slug: true },
  });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { password: passwordHash, isActive: true, companyId: company.id, role },
    create: { email, name: userName, password: passwordHash, role, companyId: company.id },
    select: { id: true, email: true, role: true },
  });

  // Entitlements come from the subscription, not from feature flags.
  // getCompanyFeatureMap builds the map from the in-code FEATURE_CATALOG, sets
  // every billable feature to false, and only turns one back on if the tier or
  // an addon bundle entitles it — a CompanyFeatureFlag on a billable feature
  // that nothing entitles is ignored (see entitlements.ts, `requested &&
  // (!isBillable || subscriptionEntitled.has(key))`). So the lever here is the
  // top tier plus every addon bundle, which is what makes the whole product
  // reachable on a staging tenant.
  const topTier = TIERS.reduce((highest, tier) =>
    tier.monthlyPrice > highest.monthlyPrice ? tier : highest,
  );

  const plan = await prisma.subscriptionPlan.upsert({
    where: { code: topTier.code },
    update: { name: topTier.name, isActive: true },
    create: {
      code: topTier.code,
      name: topTier.name,
      description: topTier.description,
      monthlyPrice: topTier.monthlyPrice,
      currency: "USD",
      warningDays: topTier.warningDays,
      graceDays: topTier.graceDays,
      isActive: true,
    },
    select: { id: true, code: true },
  });

  const existingSubscription = await prisma.companySubscription.findFirst({
    where: { companyId: company.id },
    orderBy: [{ updatedAt: "desc" }],
    select: { id: true },
  });

  if (existingSubscription) {
    await prisma.companySubscription.update({
      where: { id: existingSubscription.id },
      data: { planId: plan.id, status: "ACTIVE", canceledAt: null, endedAt: null },
    });
  } else {
    await prisma.companySubscription.create({
      data: { companyId: company.id, planId: plan.id, status: "ACTIVE" },
    });
  }

  // Addons are joined by FeatureBundle row, so the bundles have to exist even
  // though getBundleFeatureSet reads their contents from code.
  let addons = 0;
  for (const definition of FEATURE_BUNDLES) {
    const bundle = await prisma.featureBundle.upsert({
      where: { code: definition.code },
      update: { name: definition.name, isActive: true },
      create: {
        code: definition.code,
        name: definition.name,
        description: definition.description,
        monthlyPrice: definition.monthlyPrice,
        additionalSiteMonthlyPrice: definition.additionalSiteMonthlyPrice,
        isActive: true,
      },
      select: { id: true },
    });

    await prisma.companySubscriptionAddon.upsert({
      where: { companyId_bundleId: { companyId: company.id, bundleId: bundle.id } },
      update: { isEnabled: true, reason: "staging seed" },
      create: {
        companyId: company.id,
        bundleId: bundle.id,
        isEnabled: true,
        reason: "staging seed",
      },
    });
    addons += 1;
  }

  const { getEnabledFeatureKeys } = await import("@corelithzw/platform/entitlements");
  const enabled = await getEnabledFeatureKeys(company.id);

  console.log(
    JSON.stringify(
      {
        company,
        user,
        plan: plan.code,
        addonBundles: addons,
        enabledFeatures: enabled.length,
        crmEnabled: enabled.some((key) => key.startsWith("crm.")),
      },
      null,
      2,
    ),
  );
}

void main()
  .catch((error) => {
    console.error("[seed] failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
