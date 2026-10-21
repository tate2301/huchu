import { normalizeFeatureKey } from "@/lib/platform/gating/catalog-utils";
import { prisma } from "@/lib/prisma";
import { FEATURE_BUNDLES, FEATURE_CATALOG, TIERS, getBundleDefinition, getTierDefinition } from "@/lib/platform/feature-catalog";
import { billedMemberWhere, priceVerticals, VERTICAL_RATE, type VerticalPrice } from "@/lib/platform/verticals";

export type FeatureMap = Record<string, boolean>;

/**
 * What a workspace pays a month, and why: its verticals at the rate its member
 * count sets (`lib/platform/verticals.ts`). One line per vertical.
 */
export type CompanyPricingResult = VerticalPrice & {
  companyId: string;
  computedAt: string;
};

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
 * the tables empty a tenant cannot be granted a bundle or switched a feature
 * on — there is no row to reference — so a module that starts off can never be
 * turned on.
 *
 * This function previously returned the *sizes of the in-memory catalogue* and
 * wrote nothing, so `pnpm platform` reported "135 features, 24 bundles" over an
 * empty database and provisioning silently produced tenants whose modules
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
        isActive: true,
      },
      create: {
        key,
        name: feature.name,
        description: feature.description ?? null,
        domain: feature.domain ?? null,
        defaultEnabled: Boolean(feature.defaultEnabled),
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
        isActive: true,
      },
      create: {
        code: bundle.code,
        name: bundle.name,
        description: bundle.description ?? null,
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
 * Switch a bundle on for one company.
 *
 * The addon row is what `getCompanyFeatureMap` reads to turn the bundle's
 * features on; the per-feature flags make each one explicit, so the Features
 * page reads the same answer. A bundle carries no charge of its own.
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

/**
 * Switch features off for one company, whatever its tier or bundles include.
 *
 * An explicit disabled flag outranks every entitlement in
 * `getCompanyFeatureMap`, so this is how a template keeps a feature its tier
 * carries out of a workspace that has no use for it — a till in a sales CRM.
 */
export async function denyFeaturesToCompany(input: {
  companyId: string;
  featureKeys: string[];
  reason?: string;
}): Promise<{ featuresDisabled: number }> {
  const companyId = input.companyId.trim();
  if (!companyId) throw new Error("companyId is required.");
  const featureKeys = [...new Set(input.featureKeys.map((key) => normalizeFeatureKey(key)))];
  if (featureKeys.length === 0) return { featuresDisabled: 0 };

  const reason = input.reason ?? "Disabled for this company";
  // The books engine is never switched off (D1): a template's "not here" leaves it on.
  const alwaysOn = new Set(FEATURE_CATALOG.filter((feature) => feature.alwaysOn).map((feature) => normalizeFeatureKey(feature.key)));
  const features = await prisma.platformFeature.findMany({
    where: { key: { in: featureKeys.filter((key) => !alwaysOn.has(key)) } },
    select: { id: true },
  });

  for (const feature of features) {
    await prisma.companyFeatureFlag.upsert({
      where: { companyId_featureId: { companyId, featureId: feature.id } },
      update: { isEnabled: false, reason, expiresAt: null },
      create: { companyId, featureId: feature.id, isEnabled: false, reason },
    });
  }

  return { featuresDisabled: features.length };
}

export async function getCompanyFeatureMap(companyId: string): Promise<FeatureMap> {
  const normalizedCompanyId = companyId.trim();
  if (!normalizedCompanyId) return {};

  const [dbFeatures, flags, latestSubscription, addons] = await Promise.all([
    prisma.platformFeature.findMany({
      where: { isActive: true },
      select: { key: true, defaultEnabled: true },
    }),
    prisma.companyFeatureFlag.findMany({
      where: {
        companyId: normalizedCompanyId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: {
        isEnabled: true,
        feature: { select: { key: true } },
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

  // A feature is on by its catalogue default, then by what the plan and the
  // workspace's bundles carry, then by its own flag: an explicit flag wins
  // either way. Features carry no charge (a workspace pays for its verticals),
  // so a flag switched on by hand is on.
  const map: FeatureMap = {};
  const catalogByKey = new Map(FEATURE_CATALOG.map((feature) => [normalizeFeatureKey(feature.key), feature]));
  const features = [
    ...FEATURE_CATALOG.map((catalog) => ({
      key: catalog.key,
      defaultEnabled: catalog.defaultEnabled,
    })),
    ...dbFeatures.filter((feature) => !catalogByKey.has(normalizeFeatureKey(feature.key))),
  ];

  for (const feature of features) {
    map[normalizeFeatureKey(feature.key)] = Boolean(feature.defaultEnabled);
  }

  const tier = getTierDefinition(latestSubscription?.plan?.code);
  const carried = new Set<string>([
    ...(tier?.includedFeatures ?? []).map(normalizeFeatureKey),
    ...(await getBundleFeatureSet([...(tier?.includedBundles ?? []), ...addons.map((row) => row.bundle.code)])),
  ]);
  for (const key of carried) map[normalizeFeatureKey(key)] = true;

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
    map[normalizedFlagKey] = Boolean(flag.isEnabled);
    explicitFlagKeys.add(normalizedFlagKey);
  }

  for (const flag of flags) {
    const rawKey = flag.feature.key.trim().toLowerCase();
    const normalizedFlagKey = normalizeFeatureKey(rawKey);
    if (normalizedFlagKey === rawKey) continue;
    if (explicitFlagKeys.has(normalizedFlagKey)) continue;
    map[normalizedFlagKey] = Boolean(flag.isEnabled);
    explicitFlagKeys.add(normalizedFlagKey);
  }

  // Backward compatibility for legacy keys written by old TUI normalization.
  // Apply alias only when the canonical key does not already have an explicit flag.
  for (const flag of flags) {
    const normalizedFlagKey = normalizeFeatureKey(flag.feature.key);
    const aliasKey = resolveLegacyFeatureAlias(normalizedFlagKey);
    if (aliasKey && !explicitFlagKeys.has(aliasKey)) map[aliasKey] = Boolean(flag.isEnabled);
  }

  // The $99 Books tier (NOTES §5.3): a workspace with the screens that is on the
  // larger vertical rate holds it, unless an explicit flag says otherwise.
  if (map["books.screens"] && !explicitFlagKeys.has("books.advanced") && !map["books.advanced"]) {
    const billed = await prisma.user.count({ where: billedMemberWhere(normalizedCompanyId) });
    if (billed > VERTICAL_RATE.includedMembers) map["books.advanced"] = true;
  }

  // The books engine is on in every workspace, whatever a flag says (D1).
  for (const feature of FEATURE_CATALOG) if (feature.alwaysOn) map[normalizeFeatureKey(feature.key)] = true;

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
  if (!normalizedCompanyId) throw new Error("companyId is required.");

  const [members, verticals] = await Promise.all([
    prisma.user.count({ where: billedMemberWhere(normalizedCompanyId) }),
    prisma.companyVertical.findMany({ where: { companyId: normalizedCompanyId }, select: { vertical: true } }),
  ]);
  return {
    ...priceVerticals(
      verticals.map((row) => row.vertical),
      members,
    ),
    companyId: normalizedCompanyId,
    computedAt: new Date().toISOString(),
  };
}

/** Price a workspace and store the figure on its subscription, for lists and projections that read it. */
export async function recomputeAndPersistCompanyPricing(companyId: string): Promise<CompanyPricingResult> {
  const pricing = await computeCompanyPricing(companyId);
  await prisma.companySubscription.updateMany({
    where: { companyId: pricing.companyId },
    data: {
      effectiveMonthlyAmount: pricing.total,
      priceSnapshotJson: JSON.stringify(pricing),
      lastPriceComputedAt: new Date(),
    },
  });
  return pricing;
}

/**
 * Keep the stored price true after members or verticals change. Called after
 * the write it follows has committed; a pricing failure is logged and never
 * undoes or fails that write — the next change, or anyone opening the
 * workspace's billing, prices it again.
 */
export async function repriceCompany(companyId: string | null | undefined): Promise<void> {
  if (!companyId) return;
  try {
    await recomputeAndPersistCompanyPricing(companyId);
  } catch (error) {
    console.error(`[pricing] could not reprice ${companyId}:`, error);
  }
}
