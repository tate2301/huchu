import { normalizeFeatureKey } from "@/lib/platform/gating/catalog-utils";
import { prisma } from "@/lib/prisma";
import { FEATURE_BUNDLES, FEATURE_CATALOG, TIERS, getBundleDefinition, getTierDefinition } from "@/lib/platform/feature-catalog";
import { getSubscriptionHealth } from "@/lib/platform/subscription";

export type FeatureMap = Record<string, boolean>;

export interface PricingLineItem {
  code: string;
  label: string;
  amount: number;
  type: "tier" | "site-overage" | "addon" | "addon-site" | "feature";
}

export interface CompanyPricingResult {
  companyId: string;
  planCode: string | null;
  planName: string | null;
  currency: string;
  siteCount: number;
  tierIncludedSites: number;
  tierSiteOverageRate: number;
  tierSiteOverageCount: number;
  tierSiteOverageAmount: number;
  baseAmount: number;
  addonBaseAmount: number;
  addonSiteAmount: number;
  addonAmount: number;
  featureAmount: number;
  totalAmount: number;
  lineItems: PricingLineItem[];
  computedAt: string;
}

function normalizeLegacyFeatureKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const LEGACY_FEATURE_ALIAS_MAP = new Map<string, string>(
  FEATURE_CATALOG.map((feature) => [
    normalizeLegacyFeatureKey(feature.key),
    normalizeFeatureKey(feature.key),
  ]),
);

function resolveLegacyFeatureAlias(featureKey: string): string | null {
  if (featureKey.includes(".")) return null;
  const alias = LEGACY_FEATURE_ALIAS_MAP.get(featureKey);
  if (!alias || alias === featureKey) return null;
  return alias;
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function resolveBundleMonthlyPrice(bundleCode: string, value: unknown): number {
  const normalized = money(value);
  if (normalized > 0) return normalized;
  return money(getBundleDefinition(bundleCode)?.monthlyPrice ?? 0);
}

function resolveBundleAdditionalSiteMonthlyPrice(bundleCode: string, value: unknown): number {
  const normalized = money(value);
  if (normalized > 0) return normalized;
  return money(getBundleDefinition(bundleCode)?.additionalSiteMonthlyPrice ?? 0);
}

function nowIso() {
  return new Date().toISOString();
}

async function getBundleFeatureSet(bundleCodes: string[]): Promise<Set<string>> {
  const normalizedCodes = [...new Set(bundleCodes.map((code) => code.trim().toUpperCase()).filter(Boolean))];
  if (normalizedCodes.length === 0) return new Set<string>();

  const rows = await prisma.featureBundle.findMany({
    where: { code: { in: normalizedCodes } },
    select: { code: true, items: { select: { feature: { select: { key: true } } } } },
  });

  const set = new Set<string>();
  for (const code of normalizedCodes) {
    const systemBundle = FEATURE_BUNDLES.find((bundle) => bundle.code === code);
    if (systemBundle) {
      for (const key of systemBundle.features) set.add(normalizeFeatureKey(key));
      continue;
    }

    const row = rows.find((bundle) => bundle.code === code);
    for (const key of row?.items.map((item) => item.feature.key) ?? []) set.add(normalizeFeatureKey(key));
  }

  return set;
}

/**
 * Write the code-side catalogue into the tables that need to be pointed at.
 *
 * Feature and bundle *definitions* live in `feature-catalog.ts`, and the read
 * paths here prefer them: `getCompanyFeatureMap` merges `FEATURE_CATALOG` over
 * whatever is in `PlatformFeature`, and `getBundleFeatureSet` resolves a system
 * bundle from `FEATURE_BUNDLES` without touching the database at all. So the
 * rows are not the source of truth.
 *
 * They are still load-bearing, because two things hang foreign keys off them:
 * `CompanyFeatureFlag.featureId` and `CompanySubscriptionAddon.bundleId`. With
 * the tables empty a tenant cannot be granted a paid bundle — there is no row
 * to reference — and every billable feature stays off no matter what else is
 * configured. `getCompanyFeatureMap` gates billable features on subscription
 * entitlement, so an un-grantable bundle means an unusable module.
 *
 * This function previously returned the *sizes of the in-memory catalogue* and
 * wrote nothing, so `pnpm platform` reported "135 features, 24 bundles" over an
 * empty database and provisioning silently produced tenants whose paid modules
 * could never be switched on. That is what made a freshly provisioned school
 * answer `403 FEATURE_DISABLED` on every one of its own pages.
 *
 * Upsert by natural key, and never deactivate: a key that has disappeared from
 * the catalogue may still be referenced by a company's flags, and cascading a
 * delete through `CompanyFeatureFlag` would silently change what a tenant has
 * bought. Stale rows are harmless — the read paths ignore anything the
 * catalogue does not name.
 */
export async function syncEntitlementCatalog(): Promise<{
  features: number;
  bundles: number;
  bundleItems: number;
  tiers: number;
}> {
  const featureIdByKey = new Map<string, string>();

  for (const feature of FEATURE_CATALOG) {
    const key = normalizeFeatureKey(feature.key);
    const row = await prisma.platformFeature.upsert({
      where: { key },
      update: {
        name: feature.name,
        description: feature.description ?? null,
        domain: feature.domain ?? null,
        defaultEnabled: Boolean(feature.defaultEnabled),
        isBillable: Boolean(feature.isBillable),
        monthlyPrice: feature.monthlyPrice ?? null,
        isActive: true,
      },
      create: {
        key,
        name: feature.name,
        description: feature.description ?? null,
        domain: feature.domain ?? null,
        defaultEnabled: Boolean(feature.defaultEnabled),
        isBillable: Boolean(feature.isBillable),
        monthlyPrice: feature.monthlyPrice ?? null,
        isActive: true,
      },
      select: { id: true },
    });
    featureIdByKey.set(key, row.id);
  }

  let bundleItems = 0;

  for (const bundle of FEATURE_BUNDLES) {
    const bundleRow = await prisma.featureBundle.upsert({
      where: { code: bundle.code },
      update: {
        name: bundle.name,
        description: bundle.description ?? null,
        monthlyPrice: bundle.monthlyPrice ?? 0,
        additionalSiteMonthlyPrice: bundle.additionalSiteMonthlyPrice ?? 0,
        isActive: true,
      },
      create: {
        code: bundle.code,
        name: bundle.name,
        description: bundle.description ?? null,
        monthlyPrice: bundle.monthlyPrice ?? 0,
        additionalSiteMonthlyPrice: bundle.additionalSiteMonthlyPrice ?? 0,
        isActive: true,
      },
      select: { id: true },
    });

    // A bundle naming a feature the catalogue does not define is a typo in
    // `feature-catalog.ts`, not a runtime condition to absorb quietly.
    const featureIds = bundle.features.map((featureKey) => {
      const id = featureIdByKey.get(normalizeFeatureKey(featureKey));
      if (!id) {
        throw new Error(
          `Bundle ${bundle.code} names unknown feature "${featureKey}". ` +
            "Add it to FEATURE_CATALOG or correct the bundle.",
        );
      }
      return id;
    });

    await prisma.featureBundleItem.createMany({
      data: featureIds.map((featureId) => ({ bundleId: bundleRow.id, featureId })),
      skipDuplicates: true,
    });
    // What is now in place, not what this run happened to insert — a second run
    // writes nothing and should still report the catalogue as present.
    bundleItems += featureIds.length;
  }

  return {
    features: featureIdByKey.size,
    bundles: FEATURE_BUNDLES.length,
    bundleItems,
    tiers: TIERS.length,
  };
}

/**
 * Switch a paid bundle on for one company.
 *
 * Two records are needed and neither implies the other. The addon row is what
 * `getCompanyFeatureMap` consults to decide a billable feature is *entitled*;
 * the per-feature flags are what say it is *on*. A tenant with the addon and no
 * flags gets nothing, because a billable feature defaults to off — see the
 * `map[key] = feature.isBillable ? false : …` line below.
 *
 * The bundle definition is code-side, so the `FeatureBundle` row may not exist
 * yet on a database that has never been synced. Sync rather than fail: the
 * caller asked for a commercial outcome, and "no row to point at" is a state of
 * this database, not an answer to the question.
 */
export async function grantBundleToCompany(input: {
  companyId: string;
  bundleCode: string;
  reason?: string;
}): Promise<{ bundleCode: string; featuresEnabled: number }> {
  const companyId = input.companyId.trim();
  const bundleCode = input.bundleCode.trim().toUpperCase();
  if (!companyId) throw new Error("companyId is required.");

  const definition = getBundleDefinition(bundleCode);
  if (!definition) {
    throw new Error(`Unknown feature bundle "${bundleCode}".`);
  }

  let bundle = await prisma.featureBundle.findUnique({
    where: { code: bundleCode },
    select: { id: true },
  });
  if (!bundle) {
    await syncEntitlementCatalog();
    bundle = await prisma.featureBundle.findUnique({
      where: { code: bundleCode },
      select: { id: true },
    });
  }
  if (!bundle) {
    throw new Error(`Feature bundle "${bundleCode}" is defined in code but could not be written.`);
  }

  const reason = input.reason ?? `Granted bundle ${bundleCode}`;

  await prisma.companySubscriptionAddon.upsert({
    where: { companyId_bundleId: { companyId, bundleId: bundle.id } },
    update: { isEnabled: true, reason },
    create: { companyId, bundleId: bundle.id, isEnabled: true, reason },
  });

  const featureKeys = definition.features.map((key) => normalizeFeatureKey(key));
  const features = await prisma.platformFeature.findMany({
    where: { key: { in: featureKeys } },
    select: { id: true },
  });

  for (const feature of features) {
    await prisma.companyFeatureFlag.upsert({
      where: { companyId_featureId: { companyId, featureId: feature.id } },
      update: { isEnabled: true, reason, expiresAt: null },
      create: { companyId, featureId: feature.id, isEnabled: true, reason },
    });
  }

  return { bundleCode, featuresEnabled: features.length };
}

export async function getCompanyFeatureMap(companyId: string): Promise<FeatureMap> {
  const normalizedCompanyId = companyId.trim();
  if (!normalizedCompanyId) return {};

  const [dbFeatures, flags, latestSubscription, addons] = await Promise.all([
    prisma.platformFeature.findMany({
      where: { isActive: true },
      select: { key: true, defaultEnabled: true, isBillable: true },
    }),
    prisma.companyFeatureFlag.findMany({
      where: {
        companyId: normalizedCompanyId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: {
        isEnabled: true,
        feature: { select: { key: true, isBillable: true } },
      },
    }),
    prisma.companySubscription.findFirst({
      where: { companyId: normalizedCompanyId },
      include: { plan: { select: { code: true } } },
      orderBy: [{ updatedAt: "desc" }],
    }),
    prisma.companySubscriptionAddon.findMany({
      where: { companyId: normalizedCompanyId, isEnabled: true },
      select: { bundle: { select: { code: true } } },
    }),
  ]);

  const map: FeatureMap = {};
  const featureMeta = new Map<string, { isBillable: boolean }>();
  const catalogByKey = new Map(FEATURE_CATALOG.map((feature) => [normalizeFeatureKey(feature.key), feature]));
  const features = [
    ...FEATURE_CATALOG.map((catalog) => ({
      key: catalog.key,
      defaultEnabled: catalog.defaultEnabled,
      isBillable: catalog.isBillable,
    })),
    ...dbFeatures.filter((feature) => !catalogByKey.has(normalizeFeatureKey(feature.key))),
  ];

  for (const feature of features) {
    const key = normalizeFeatureKey(feature.key);
    featureMeta.set(key, { isBillable: Boolean(feature.isBillable) });
    map[key] = feature.isBillable ? false : Boolean(feature.defaultEnabled);
  }

  const tier = getTierDefinition(latestSubscription?.plan?.code);
  const subscriptionEntitled = new Set<string>();
  if (tier) {
    for (const key of tier.includedFeatures) {
      const normalized = normalizeFeatureKey(key);
      subscriptionEntitled.add(normalized);
      map[normalized] = true;
    }
    const includedByTierBundles = await getBundleFeatureSet(tier.includedBundles);
    for (const key of includedByTierBundles) {
      subscriptionEntitled.add(key);
      map[normalizeFeatureKey(key)] = true;
    }
  }

  const addonCodes = addons.map((row) => row.bundle.code);
  const addonFeatures = await getBundleFeatureSet(addonCodes);
  for (const key of addonFeatures) {
    subscriptionEntitled.add(key);
    map[normalizeFeatureKey(key)] = true;
  }

  // Two flag rows can land on the same key, because `normalizeFeatureKey` folds a
  // renamed namespace onto its canonical one — `hr.payouts` onto
  // `settlements.core`. A tenant that has rows for both wrote whichever Prisma
  // returned last into the map, so its entitlements depended on row order.
  //
  // That was not theoretical. Disabling four `thrift.*` keys on a tenant that
  // also had `retail.*` rows silently took `retail.core`, `retail.pos`,
  // `retail.catalog` and `retail.purchasing` down with them: the workspace lost
  // most of its sidebar while every retail flag still read `true` in the
  // database.
  //
  // Precedence is explicit: a row whose key is *already* canonical wins, and a
  // row that only reaches the key through an alias applies when there is no
  // canonical row. Same answer for a legacy-only tenant, deterministic for one
  // holding both.
  //
  // The `thrift.*` aliases that caused it are gone —
  // `scripts/retire-thrift-feature-aliases.ts` merged the fifteen surviving rows
  // onto their retail keys and deleted them, and the entries came out of
  // `FEATURE_KEY_ALIASES`. The rule stays, because the four settlements aliases
  // are still live and the same collision is available to them.
  const explicitFlagKeys = new Set<string>();
  for (const flag of flags) {
    const rawKey = flag.feature.key.trim().toLowerCase();
    const normalizedFlagKey = normalizeFeatureKey(rawKey);
    if (normalizedFlagKey !== rawKey) continue;
    const requested = Boolean(flag.isEnabled);
    const isBillable = featureMeta.get(normalizedFlagKey)?.isBillable ?? Boolean(flag.feature.isBillable);
    map[normalizedFlagKey] = requested && (!isBillable || subscriptionEntitled.has(normalizedFlagKey));
    explicitFlagKeys.add(normalizedFlagKey);
  }

  for (const flag of flags) {
    const rawKey = flag.feature.key.trim().toLowerCase();
    const normalizedFlagKey = normalizeFeatureKey(rawKey);
    if (normalizedFlagKey === rawKey) continue;
    if (explicitFlagKeys.has(normalizedFlagKey)) continue;
    const requested = Boolean(flag.isEnabled);
    const isBillable = featureMeta.get(normalizedFlagKey)?.isBillable ?? Boolean(flag.feature.isBillable);
    map[normalizedFlagKey] = requested && (!isBillable || subscriptionEntitled.has(normalizedFlagKey));
    explicitFlagKeys.add(normalizedFlagKey);
  }

  // Backward compatibility for legacy keys written by old TUI normalization.
  // Apply alias only when the canonical key does not already have an explicit flag.
  for (const flag of flags) {
    const normalizedFlagKey = normalizeFeatureKey(flag.feature.key);
    const aliasKey = resolveLegacyFeatureAlias(normalizedFlagKey);
    if (aliasKey && !explicitFlagKeys.has(aliasKey)) {
      const requested = Boolean(flag.isEnabled);
      const isBillable = featureMeta.get(aliasKey)?.isBillable ?? Boolean(flag.feature.isBillable);
      map[aliasKey] = requested && (!isBillable || subscriptionEntitled.has(aliasKey));
    }
  }

  return map;
}

export async function getEnabledFeatureKeys(companyId: string): Promise<string[]> {
  const map = await getCompanyFeatureMap(companyId);
  return Object.keys(map)
    .filter((key) => map[key])
    .sort();
}

export async function computeCompanyPricing(companyId: string): Promise<CompanyPricingResult> {
  const normalizedCompanyId = companyId.trim();
  if (!normalizedCompanyId) {
    throw new Error("companyId is required.");
  }

  const subscription = await prisma.companySubscription.findFirst({
    where: { companyId: normalizedCompanyId },
    include: { plan: true },
    orderBy: [{ updatedAt: "desc" }],
  });

  const planCode = subscription?.plan?.code ?? null;
  const planName = subscription?.plan?.name ?? null;
  const currency = subscription?.plan?.currency ?? "USD";
  const tier = getTierDefinition(planCode);
  const siteCount = await prisma.site.count({
    where: { companyId: normalizedCompanyId, isActive: true },
  });
  const tierIncludedSites = Math.max(0, tier?.includedSites ?? 0);
  const tierSiteOverageRate = money(tier?.additionalSiteMonthlyPrice ?? 0);
  const tierSiteOverageCount = Math.max(0, siteCount - tierIncludedSites);
  const tierSiteOverageAmount = tierSiteOverageCount * tierSiteOverageRate;

  const baseAmount = money(subscription?.plan?.monthlyPrice ?? 0);
  const lineItems: PricingLineItem[] = [
    {
      code: planCode ?? "NO_PLAN",
      label: planName ?? "No Assigned Tier",
      amount: baseAmount,
      type: "tier",
    },
  ];
  if (tierSiteOverageAmount > 0) {
    lineItems.push({
      code: `${planCode ?? "NO_PLAN"}:SITE_OVERAGE`,
      label: `Tier site overage (${tierSiteOverageCount} x ${tierSiteOverageRate.toFixed(2)})`,
      amount: tierSiteOverageAmount,
      type: "site-overage",
    });
  }

  const enabledAddons = await prisma.companySubscriptionAddon.findMany({
    where: { companyId: normalizedCompanyId, isEnabled: true },
    include: { bundle: true },
    orderBy: [{ bundle: { code: "asc" } }],
  });

  let addonBaseAmount = 0;
  let addonSiteAmount = 0;
  for (const addon of enabledAddons) {
    const base = resolveBundleMonthlyPrice(addon.bundle.code, addon.bundle.monthlyPrice);
    const perSite = resolveBundleAdditionalSiteMonthlyPrice(
      addon.bundle.code,
      addon.bundle.additionalSiteMonthlyPrice,
    );
    const siteCharge = perSite * siteCount;
    addonBaseAmount += base;
    addonSiteAmount += siteCharge;
    lineItems.push({
      code: addon.bundle.code,
      label: addon.bundle.name,
      amount: base,
      type: "addon",
    });
    if (siteCharge > 0) {
      lineItems.push({
        code: `${addon.bundle.code}:SITE`,
        label: `${addon.bundle.name} site charge (${siteCount} x ${perSite.toFixed(2)})`,
        amount: siteCharge,
        type: "addon-site",
      });
    }
  }
  const addonAmount = addonBaseAmount + addonSiteAmount;

  const includedByTier = new Set<string>((tier?.includedFeatures ?? []).map(normalizeFeatureKey));
  const includedByTierBundle = await getBundleFeatureSet(tier?.includedBundles ?? []);
  for (const key of includedByTierBundle) includedByTier.add(key);

  const enabledAddonFeatureSet = await getBundleFeatureSet(enabledAddons.map((addon) => addon.bundle.code));
  for (const key of enabledAddonFeatureSet) {
    includedByTier.add(key);
  }

  const manualBillableFlags = await prisma.companyFeatureFlag.findMany({
    where: {
      companyId: normalizedCompanyId,
      isEnabled: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: {
      feature: {
        select: { key: true, name: true, isBillable: true, monthlyPrice: true, isActive: true },
      },
    },
  });

  let featureAmount = 0;
  for (const row of manualBillableFlags) {
    const feature = row.feature;
    const key = normalizeFeatureKey(feature.key);
    if (!feature.isActive || !feature.isBillable || includedByTier.has(key)) continue;
    const amount = money(feature.monthlyPrice);
    if (amount <= 0) continue;
    featureAmount += amount;
    lineItems.push({
      code: feature.key,
      label: feature.name,
      amount,
      type: "feature",
    });
  }

  const totalAmount = baseAmount + tierSiteOverageAmount + addonAmount + featureAmount;
  return {
    companyId: normalizedCompanyId,
    planCode,
    planName,
    currency,
    siteCount,
    tierIncludedSites,
    tierSiteOverageRate,
    tierSiteOverageCount,
    tierSiteOverageAmount,
    baseAmount,
    addonBaseAmount,
    addonSiteAmount,
    addonAmount,
    featureAmount,
    totalAmount,
    lineItems,
    computedAt: nowIso(),
  };
}

export async function recomputeAndPersistCompanyPricing(companyId: string): Promise<{
  pricing: CompanyPricingResult;
  subscriptionHealth: Awaited<ReturnType<typeof getSubscriptionHealth>>;
}> {
  const pricing = await computeCompanyPricing(companyId);
  const subscriptionHealth = await getSubscriptionHealth(companyId);

  const subscription = await prisma.companySubscription.findFirst({
    where: { companyId: companyId.trim() },
    orderBy: [{ updatedAt: "desc" }],
    select: { id: true },
  });

  if (subscription) {
    await prisma.companySubscription.update({
      where: { id: subscription.id },
      data: {
        effectiveMonthlyAmount: pricing.totalAmount,
        priceSnapshotJson: JSON.stringify(pricing),
        lastPriceComputedAt: new Date(),
      },
    });
  }

  return { pricing, subscriptionHealth };
}
