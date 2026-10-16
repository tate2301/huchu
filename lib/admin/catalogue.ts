import { catalogueBundles, verticalBundleCodes } from "@/lib/admin/features";
import { AdminRefusal } from "@/lib/admin/refusal";
import { recordOperatorEvent } from "@/lib/operators/audit";
import type { SignedInOperator } from "@/lib/operators/guards";
import { getCompanyFeatureMap, syncEntitlementCatalog } from "@/lib/platform/entitlements";
import { FEATURE_CATALOG, getBundleDefinition, TIERS } from "@/lib/platform/feature-catalog";
import { normalizeFeatureKey } from "@/lib/platform/gating/catalog-utils";
import { ensureTierPlan } from "@/lib/platform/provision";
import { prisma } from "@/lib/prisma";

/**
 * The platform's catalogue: every feature and bundle, and the templates the
 * verticals are built from.
 *
 * What the code defines (`feature-catalog.ts`) the code decides: its rows are
 * written by "Sync from code", and the read paths prefer the code's values. So
 * only what was made here — a bundle, or a feature row the code no longer
 * names — is edited here. Owners only.
 */

const IN_CODE = new Set(FEATURE_CATALOG.map((feature) => normalizeFeatureKey(feature.key)));

export type CatalogueFeatureRow = {
  key: string;
  name: string;
  domain: string | null;
  defaultEnabled: boolean;
  isActive: boolean;
  inCode: boolean;
  /** Open workspaces that have it on. */
  workspaces: number;
};

/** Open workspaces' feature maps, a few at a time. */
async function openFeatureMaps() {
  const companies = await prisma.company.findMany({ where: { tenantStatus: { not: "DISABLED" } }, select: { id: true } });
  const maps: Array<Record<string, boolean>> = [];
  for (let at = 0; at < companies.length; at += 8) {
    maps.push(...(await Promise.all(companies.slice(at, at + 8).map((company) => getCompanyFeatureMap(company.id)))));
  }
  return maps;
}

export async function catalogueFeatureRows(): Promise<CatalogueFeatureRow[]> {
  const [rows, maps] = await Promise.all([
    prisma.platformFeature.findMany({ select: { key: true, name: true, domain: true, defaultEnabled: true, isActive: true } }),
    openFeatureMaps(),
  ]);
  const count = (key: string) => maps.filter((map) => map[key]).length;
  const rowByKey = new Map(rows.map((row) => [normalizeFeatureKey(row.key), row]));
  return [
    ...FEATURE_CATALOG.map((feature) => {
      const key = normalizeFeatureKey(feature.key);
      return {
        key,
        name: feature.name,
        domain: feature.domain,
        defaultEnabled: feature.defaultEnabled,
        isActive: rowByKey.get(key)?.isActive ?? true,
        inCode: true,
        workspaces: count(key),
      };
    }),
    ...rows
      .filter((row) => !IN_CODE.has(normalizeFeatureKey(row.key)))
      .map((row) => {
        const key = normalizeFeatureKey(row.key);
        return { key, name: row.name, domain: row.domain, defaultEnabled: row.defaultEnabled, isActive: row.isActive, inCode: false, workspaces: count(key) };
      }),
  ];
}

function madeHere(key: string) {
  if (IN_CODE.has(normalizeFeatureKey(key))) throw new AdminRefusal("It is defined in code. Change it in feature-catalog.ts.");
}

/** A feature made outside the code: active or not. Inactive, no workspace has it. */
export async function setFeatureActive(operator: SignedInOperator, key: string, isActive: boolean) {
  madeHere(key);
  const row = await prisma.platformFeature.findUnique({ where: { key }, select: { id: true, isActive: true } });
  if (!row) throw new AdminRefusal("That feature is not in the catalogue.");
  if (row.isActive === isActive) throw new AdminRefusal(isActive ? "It is active already." : "It is inactive already.");
  await prisma.platformFeature.update({ where: { id: row.id }, data: { isActive } });
  await recordOperatorEvent({
    operatorId: operator.id,
    eventType: isActive ? "operator.catalogue.feature_activated" : "operator.catalogue.feature_deactivated",
    entityType: "feature",
    entityId: key,
  });
}

export async function editFeature(operator: SignedInOperator, key: string, input: { name: string; domain: string; defaultEnabled: boolean }) {
  madeHere(key);
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) throw new AdminRefusal("A feature's name is 2 to 80 characters.");
  const domain = input.domain.trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,29}$/.test(domain)) throw new AdminRefusal("A domain is one lower-case word, like retail or hr.");
  const row = await prisma.platformFeature.findUnique({ where: { key }, select: { id: true } });
  if (!row) throw new AdminRefusal("That feature is not in the catalogue.");
  await prisma.platformFeature.update({ where: { id: row.id }, data: { name, domain, defaultEnabled: input.defaultEnabled } });
  await recordOperatorEvent({
    operatorId: operator.id,
    eventType: "operator.catalogue.feature_edited",
    entityType: "feature",
    entityId: key,
    payload: { name, domain, defaultEnabled: input.defaultEnabled },
  });
}

export type CatalogueBundleRow = {
  code: string;
  name: string;
  description: string | null;
  features: number;
  featureKeys: string[];
  isActive: boolean;
  inCode: boolean;
  /** Workspaces that have it on, or whose verticals bring it. */
  workspaces: number;
};

export async function catalogueBundleRows(): Promise<CatalogueBundleRow[]> {
  const [bundles, addons, verticals] = await Promise.all([
    catalogueBundles(),
    prisma.companySubscriptionAddon.findMany({ where: { isEnabled: true }, select: { companyId: true, bundle: { select: { code: true } } } }),
    prisma.companyVertical.findMany({ select: { companyId: true, vertical: true } }),
  ]);
  const using = new Map<string, Set<string>>();
  const add = (code: string, companyId: string) => using.set(code, (using.get(code) ?? new Set()).add(companyId));
  for (const addon of addons) add(addon.bundle.code, addon.companyId);
  for (const row of verticals) for (const code of verticalBundleCodes(row.vertical)) add(code, row.companyId);
  return bundles.map((bundle) => ({
    code: bundle.code,
    name: bundle.name,
    description: bundle.description,
    features: bundle.features.length,
    featureKeys: bundle.features,
    isActive: bundle.isActive,
    inCode: bundle.inCode,
    workspaces: using.get(bundle.code)?.size ?? 0,
  }));
}

/** "Field kit" → "FIELD_KIT". */
export function bundleCodeFrom(text: string): string {
  return text
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * A bundle made here, new or edited: its name, its words and which features
 * it carries. Workspaces that have it on get any feature added; one taken out
 * stays as it is in each workspace until switched off there.
 */
export async function saveBundle(
  operator: SignedInOperator,
  input: { code?: string; name: string; description?: string; featureKeys: string[] },
): Promise<{ code: string; created: boolean }> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) throw new AdminRefusal("A bundle's name is 2 to 80 characters.");
  const keys = [...new Set(input.featureKeys.map(normalizeFeatureKey))];
  if (keys.length === 0) throw new AdminRefusal("Tick at least one feature.");
  const description = input.description?.trim() || null;

  const code = input.code ?? bundleCodeFrom(name);
  if (!code) throw new AdminRefusal("Give it a name with letters or numbers.");
  if (getBundleDefinition(code)) throw new AdminRefusal(input.code ? "It is defined in code. Change it in feature-catalog.ts." : "A bundle in code has that name. Choose another.");
  const existing = await prisma.featureBundle.findUnique({ where: { code }, select: { id: true } });
  if (input.code && !existing) throw new AdminRefusal("That bundle is not in the catalogue.");
  if (!input.code && existing) throw new AdminRefusal("A bundle with that name exists. Choose another.");

  const features = await prisma.platformFeature.findMany({ where: { key: { in: keys } }, select: { id: true, key: true } });
  if (features.length < keys.length) {
    throw new AdminRefusal("Some ticked features are not in the database yet. Sync from code first.");
  }

  const saved = await prisma.$transaction(async (tx) => {
    const bundle = existing
      ? await tx.featureBundle.update({ where: { id: existing.id }, data: { name, description }, select: { id: true } })
      : await tx.featureBundle.create({ data: { code, name, description, isActive: true }, select: { id: true } });
    await tx.featureBundleItem.deleteMany({ where: { bundleId: bundle.id, featureId: { notIn: features.map((feature) => feature.id) } } });
    await tx.featureBundleItem.createMany({
      data: features.map((feature) => ({ bundleId: bundle.id, featureId: feature.id })),
      skipDuplicates: true,
    });
    await recordOperatorEvent(
      {
        operatorId: operator.id,
        eventType: existing ? "operator.catalogue.bundle_edited" : "operator.catalogue.bundle_created",
        entityType: "bundle",
        entityId: code,
        payload: { name, features: keys },
      },
      tx,
    );
    return { code, created: !existing };
  });
  return saved;
}

/** A bundle made here, retired or back. Retired, workspaces that have it keep it; nowhere new can turn it on. */
export async function setBundleActive(operator: SignedInOperator, code: string, isActive: boolean) {
  if (getBundleDefinition(code)) throw new AdminRefusal("It is defined in code. Change it in feature-catalog.ts.");
  const row = await prisma.featureBundle.findUnique({ where: { code }, select: { id: true, isActive: true } });
  if (!row) throw new AdminRefusal("That bundle is not in the catalogue.");
  if (row.isActive === isActive) throw new AdminRefusal(isActive ? "It is in use already." : "It is retired already.");
  await prisma.featureBundle.update({ where: { id: row.id }, data: { isActive } });
  await recordOperatorEvent({
    operatorId: operator.id,
    eventType: isActive ? "operator.catalogue.bundle_restored" : "operator.catalogue.bundle_retired",
    entityType: "bundle",
    entityId: code,
  });
}

export type SyncOutcome = { features: number; bundles: number; newFeatures: number; newBundles: number; newItems: number; plans: number };

/**
 * Writes the code's catalogue into the database: every feature, bundle and
 * bundle's features (`syncEntitlementCatalog`), and every tier's plan row.
 * Upserts only; nothing is deleted. Says what is new.
 */
export async function syncCatalogue(operator: SignedInOperator): Promise<SyncOutcome> {
  const count = () => Promise.all([prisma.platformFeature.count(), prisma.featureBundle.count(), prisma.featureBundleItem.count()]);
  const [featuresBefore, bundlesBefore, itemsBefore] = await count();
  const synced = await syncEntitlementCatalog();
  for (const tier of TIERS) await ensureTierPlan(tier.code);
  const [featuresAfter, bundlesAfter, itemsAfter] = await count();
  const outcome: SyncOutcome = {
    features: synced.features,
    bundles: synced.bundles,
    newFeatures: featuresAfter - featuresBefore,
    newBundles: bundlesAfter - bundlesBefore,
    newItems: itemsAfter - itemsBefore,
    plans: TIERS.length,
  };
  await recordOperatorEvent({ operatorId: operator.id, eventType: "operator.catalogue.synced", entityType: "catalogue", payload: outcome });
  return outcome;
}

/** The toast after a sync. */
export function syncWords(outcome: SyncOutcome): string {
  const added = [
    outcome.newFeatures ? `${outcome.newFeatures} new feature${outcome.newFeatures === 1 ? "" : "s"}` : null,
    outcome.newBundles ? `${outcome.newBundles} new bundle${outcome.newBundles === 1 ? "" : "s"}` : null,
    outcome.newItems ? `${outcome.newItems} feature${outcome.newItems === 1 ? "" : "s"} added to bundles` : null,
  ].filter(Boolean);
  const head = `Synced ${outcome.features} features and ${outcome.bundles} bundles from code.`;
  return added.length ? `${head} ${added.join(", ")}.` : `${head} Nothing was new; names and words were brought up to date.`;
}
