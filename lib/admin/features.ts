import type { Vertical } from "@prisma/client";

import { AdminRefusal } from "@/lib/admin/refusal";
import { recordOperatorEvent } from "@/lib/operators/audit";
import type { SignedInOperator } from "@/lib/operators/guards";
import { getClientTemplateBundleCodes, getClientTemplateDisabledFeatureKeys } from "@/lib/platform/client-templates";
import { getCompanyFeatureMap, grantBundleToCompany, repriceCompany, syncEntitlementCatalog } from "@/lib/platform/entitlements";
import { BUNDLE_DEPENDENCIES, FEATURE_BUNDLES, FEATURE_CATALOG, getBundleDefinition, getTierDefinition } from "@/lib/platform/feature-catalog";
import { normalizeFeatureKey } from "@/lib/platform/gating/catalog-utils";
import { VERTICAL_ORDER, VERTICALS } from "@/lib/platform/verticals";
import { prisma } from "@/lib/prisma";

/**
 * What is switched on in a workspace, and why.
 *
 * A workspace's verticals carry bundles (each vertical's client template), an
 * operator can turn more bundles on, and any one feature can be switched on or
 * off by hand. A hand switch is a `CompanyFeatureFlag`, which outranks the
 * rest in `getCompanyFeatureMap`; "back to what its verticals say" takes it
 * away again. None of it carries a charge: a workspace pays for its verticals.
 */

type Workspace = { id: string; name: string };

export type FeatureSource = "Vertical" | "Bundle" | "Plan" | "Switched on" | "Switched off" | "Default";
export type BundleState = "Included" | "On" | "Off";

export type CatalogueFeature = { key: string; name: string; domain: string | null; defaultEnabled: boolean };
export type CatalogueBundle = { code: string; name: string; description: string | null; features: string[]; isActive: boolean; inCode: boolean };

/** Every feature the platform knows: the code's catalogue, then any active row the code no longer names. */
export async function catalogueFeatures(): Promise<CatalogueFeature[]> {
  const inCode = new Set(FEATURE_CATALOG.map((feature) => normalizeFeatureKey(feature.key)));
  const rows = await prisma.platformFeature.findMany({
    where: { isActive: true },
    select: { key: true, name: true, domain: true, defaultEnabled: true },
  });
  return [
    ...FEATURE_CATALOG.map((feature) => ({
      key: normalizeFeatureKey(feature.key),
      name: feature.name,
      domain: feature.domain,
      defaultEnabled: feature.defaultEnabled,
    })),
    ...rows
      .filter((row) => !inCode.has(normalizeFeatureKey(row.key)))
      .map((row) => ({ key: normalizeFeatureKey(row.key), name: row.name, domain: row.domain, defaultEnabled: row.defaultEnabled })),
  ];
}

/**
 * Every bundle: the code's (`FEATURE_BUNDLES`, whose features the code decides)
 * and the ones made in the Catalogue, whose features are their rows.
 */
export async function catalogueBundles(): Promise<CatalogueBundle[]> {
  const rows = await prisma.featureBundle.findMany({
    select: { code: true, name: true, description: true, isActive: true, items: { select: { feature: { select: { key: true } } } } },
  });
  const byCode = new Map(rows.map((row) => [row.code, row]));
  const fromCode = FEATURE_BUNDLES.map((bundle) => ({
    code: bundle.code,
    name: bundle.name,
    description: bundle.description,
    features: bundle.features.map(normalizeFeatureKey),
    isActive: byCode.get(bundle.code)?.isActive ?? true,
    inCode: true,
  }));
  const made = rows
    .filter((row) => !getBundleDefinition(row.code))
    .map((row) => ({
      code: row.code,
      name: row.name,
      description: row.description,
      features: row.items.map((item) => normalizeFeatureKey(item.feature.key)),
      isActive: row.isActive,
      inCode: false,
    }));
  return [...fromCode, ...made];
}

/** The bundles and the features a vertical brings, from its client template. */
export function verticalBundleCodes(vertical: Vertical): string[] {
  return getClientTemplateBundleCodes(VERTICALS[vertical].templateCode);
}

/** One workspace's verticals, bundles and hand switches, read once for a page or a bulk run. */
export async function featureFacts(companyId: string) {
  const [verticalRows, addons, flags, subscription, bundles, features, map] = await Promise.all([
    prisma.companyVertical.findMany({ where: { companyId }, select: { vertical: true } }),
    prisma.companySubscriptionAddon.findMany({ where: { companyId, isEnabled: true }, select: { bundle: { select: { code: true } } } }),
    prisma.companyFeatureFlag.findMany({
      where: { companyId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { isEnabled: true, reason: true, feature: { select: { key: true } } },
    }),
    prisma.companySubscription.findFirst({ where: { companyId }, orderBy: { updatedAt: "desc" }, select: { plan: { select: { code: true } } } }),
    catalogueBundles(),
    catalogueFeatures(),
    getCompanyFeatureMap(companyId),
  ]);
  const verticals = VERTICAL_ORDER.filter((vertical) => verticalRows.some((row) => row.vertical === vertical));
  const bundleByCode = new Map(bundles.map((bundle) => [bundle.code, bundle]));

  /** Bundle code → the held verticals that bring it. */
  const includedBy = new Map<string, string[]>();
  /** Feature key → the held verticals whose template keeps it out. */
  const keptOutBy = new Map<string, string[]>();
  for (const vertical of verticals) {
    const label = VERTICALS[vertical].label;
    for (const code of verticalBundleCodes(vertical)) includedBy.set(code, [...(includedBy.get(code) ?? []), label]);
    for (const key of getClientTemplateDisabledFeatureKeys(VERTICALS[vertical].templateCode).map(normalizeFeatureKey)) {
      keptOutBy.set(key, [...(keptOutBy.get(key) ?? []), label]);
    }
  }
  const enabled = new Set(addons.map((addon) => addon.bundle.code));

  const tier = getTierDefinition(subscription?.plan.code);
  const byPlan = new Set<string>((tier?.includedFeatures ?? []).map(normalizeFeatureKey));
  for (const code of tier?.includedBundles ?? []) for (const key of bundleByCode.get(code)?.features ?? []) byPlan.add(key);

  const flagByKey = new Map<string, { isEnabled: boolean; reason: string | null }>();
  for (const flag of flags) flagByKey.set(normalizeFeatureKey(flag.feature.key), { isEnabled: flag.isEnabled, reason: flag.reason });

  return { companyId, verticals, bundles, bundleByCode, includedBy, keptOutBy, enabled, byPlan, flagByKey, features, map };
}

export type FeatureFacts = Awaited<ReturnType<typeof featureFacts>>;

/** A bundle's state in this workspace. */
export function bundleState(facts: FeatureFacts, code: string): BundleState {
  if (facts.includedBy.has(code)) return "Included";
  return facts.enabled.has(code) ? "On" : "Off";
}

/** Feature key → the names of what carries it: a held vertical's bundles first, then bundles turned on. */
function carriers(facts: FeatureFacts) {
  const byVertical = new Map<string, string[]>();
  const byBundle = new Map<string, string[]>();
  for (const bundle of facts.bundles) {
    const verticals = facts.includedBy.get(bundle.code);
    const target = verticals ? byVertical : facts.enabled.has(bundle.code) ? byBundle : null;
    if (!target) continue;
    const names = verticals ?? [bundle.name];
    for (const key of bundle.features) target.set(key, [...new Set([...(target.get(key) ?? []), ...names])]);
  }
  return { byVertical, byBundle };
}

const list = (names: string[]) => (names.length > 2 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names.join(" and "));

export type FeatureRow = CatalogueFeature & { on: boolean; source: FeatureSource; reason: string; switched: boolean };

/** Every feature in the catalogue for one workspace: on or off, where that comes from, and why. */
export function featureRows(facts: FeatureFacts): FeatureRow[] {
  const { byVertical, byBundle } = carriers(facts);
  return facts.features.map((feature) => {
    const on = Boolean(facts.map[feature.key]);
    const flag = facts.flagByKey.get(feature.key);
    const viaVertical = byVertical.get(feature.key);
    const viaBundle = byBundle.get(feature.key);
    const keptOut = facts.keptOutBy.get(feature.key);
    const carried = viaVertical ?? viaBundle;
    // A flag that agrees with the verticals is theirs, not a hand switch.
    const verticalsSay = carried ? true : keptOut ? false : null;
    const switched = Boolean(flag) && flag!.isEnabled !== verticalsSay;
    let source: FeatureSource;
    let reason: string;
    if (switched && flag) {
      source = flag.isEnabled ? "Switched on" : "Switched off";
      reason = flag.reason?.trim() || (flag.isEnabled ? "Switched on by hand" : "Switched off by hand");
    } else if (viaVertical) {
      source = "Vertical";
      reason = `Comes with ${list(viaVertical)}`;
    } else if (viaBundle) {
      source = "Bundle";
      reason = `Comes with ${list(viaBundle)}`;
    } else if (keptOut) {
      source = "Vertical";
      reason = `Not part of ${list(keptOut)}`;
    } else if (facts.byPlan.has(feature.key)) {
      source = "Plan";
      reason = "Part of the plan";
    } else {
      source = "Default";
      // By what the workspace actually gets.
      reason = on ? "On for every workspace" : "Off unless something turns it on";
    }
    return { ...feature, on, source, reason, switched };
  });
}

// ── Writes ───────────────────────────────────────────────────────────

/** The `PlatformFeature` rows for these keys, writing the catalogue first when a key has none yet. */
async function featureIds(keys: string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(keys.map(normalizeFeatureKey))];
  let rows = await prisma.platformFeature.findMany({ where: { key: { in: wanted } }, select: { id: true, key: true } });
  if (rows.length < wanted.length && wanted.some((key) => FEATURE_CATALOG.some((feature) => normalizeFeatureKey(feature.key) === key))) {
    await syncEntitlementCatalog();
    rows = await prisma.platformFeature.findMany({ where: { key: { in: wanted } }, select: { id: true, key: true } });
  }
  return new Map(rows.map((row) => [normalizeFeatureKey(row.key), row.id]));
}

async function writeFlags(companyId: string, keys: string[], isEnabled: boolean, reason: string) {
  const ids = await featureIds(keys);
  for (const featureId of ids.values()) {
    await prisma.companyFeatureFlag.upsert({
      where: { companyId_featureId: { companyId, featureId } },
      update: { isEnabled, reason, expiresAt: null },
      create: { companyId, featureId, isEnabled, reason },
    });
  }
}

/**
 * A bundle on for one workspace: its add-on row, and its features switched on
 * (an explicit off left by a template would otherwise keep them out). The
 * code's bundles go through `grantBundleToCompany`; one made in the Catalogue
 * is granted from its rows.
 */
export async function grantBundle(companyId: string, code: string, reason: string) {
  if (getBundleDefinition(code)) {
    await grantBundleToCompany({ companyId, bundleCode: code, reason });
    return;
  }
  const bundle = await prisma.featureBundle.findUnique({
    where: { code },
    select: { id: true, items: { select: { feature: { select: { key: true } } } } },
  });
  if (!bundle) throw new AdminRefusal("That bundle is not in the catalogue.");
  await prisma.companySubscriptionAddon.upsert({
    where: { companyId_bundleId: { companyId, bundleId: bundle.id } },
    update: { isEnabled: true, reason },
    create: { companyId, bundleId: bundle.id, isEnabled: true, reason },
  });
  await writeFlags(companyId, bundle.items.map((item) => item.feature.key), true, reason);
}

/**
 * After bundles go off: their features that nothing still on carries are
 * switched off, so a plan or a default does not keep them. Features every
 * workspace has (`defaultEnabled`) are left alone.
 */
export async function switchOffUncarried(companyId: string, keys: string[], reason: string) {
  const facts = await featureFacts(companyId);
  const { byVertical, byBundle } = carriers(facts);
  const everyone = new Set(facts.features.filter((feature) => feature.defaultEnabled).map((feature) => feature.key));
  const orphans = [...new Set(keys.map(normalizeFeatureKey))].filter((key) => !byVertical.has(key) && !byBundle.has(key) && !everyone.has(key));
  if (orphans.length) await writeFlags(companyId, orphans, false, reason);
  return orphans;
}

async function setAddonRows(companyId: string, codes: string[], isEnabled: boolean, reason: string) {
  const rows = await prisma.featureBundle.findMany({ where: { code: { in: codes } }, select: { id: true } });
  for (const row of rows) {
    await prisma.companySubscriptionAddon.updateMany({ where: { companyId, bundleId: row.id }, data: { isEnabled, reason } });
  }
}

/** Bundle code → the bundles it needs to work, which turn on with it. */
function needs(code: string): string[] {
  return BUNDLE_DEPENDENCIES[code] ?? [];
}

/**
 * A bundle turned on or off in one workspace. On brings the bundles it needs.
 * Off is refused for one a held vertical brings, or one another bundle that
 * is on needs; its features nothing else carries go off with it.
 */
export async function setBundle(operator: SignedInOperator, workspace: Workspace, code: string, on: boolean, given?: FeatureFacts) {
  const facts = given ?? (await featureFacts(workspace.id));
  const bundle = facts.bundleByCode.get(code);
  if (!bundle) throw new AdminRefusal("That bundle is not in the catalogue.");
  const state = bundleState(facts, code);
  if (state === "Included") {
    const by = list(facts.includedBy.get(code) ?? []);
    throw new AdminRefusal(on ? `It already comes with ${by}.` : `It comes with ${by}. Remove the vertical, or switch its features off one by one.`);
  }
  if (on) {
    if (state === "On") throw new AdminRefusal("It is on already.");
    if (!bundle.isActive) throw new AdminRefusal("It is retired in the Catalogue, so it cannot be turned on anywhere new.");
    const codes = [code, ...needs(code).filter((need) => bundleState(facts, need) === "Off")];
    for (const each of codes) {
      await grantBundle(workspace.id, each, each === code ? `Turned on by ${operator.name}` : `Needed by ${bundle.name}`);
    }
    await recordOperatorEvent({
      operatorId: operator.id,
      companyId: workspace.id,
      eventType: "operator.features.bundle_on",
      entityType: "bundle",
      entityId: code,
      payload: { bundle: bundle.name, alsoOn: codes.slice(1) },
    });
  } else {
    if (state === "Off") throw new AdminRefusal("It is off already.");
    const neededBy = FEATURE_BUNDLES.filter((other) => needs(other.code).includes(code) && bundleState(facts, other.code) !== "Off");
    if (neededBy.length) throw new AdminRefusal(`${list(neededBy.map((other) => other.name))} needs it. Turn that off first.`);
    const reason = `${bundle.name} turned off by ${operator.name}`;
    await setAddonRows(workspace.id, [code], false, reason);
    const off = await switchOffUncarried(workspace.id, bundle.features, reason);
    await recordOperatorEvent({
      operatorId: operator.id,
      companyId: workspace.id,
      eventType: "operator.features.bundle_off",
      entityType: "bundle",
      entityId: code,
      payload: { bundle: bundle.name, featuresOff: off },
    });
  }
  await repriceCompany(workspace.id);
}

/** One feature, switched on or off by hand. Off needs a reason the owner reads in the audit log. */
export async function switchFeature(
  operator: SignedInOperator,
  workspace: Workspace,
  key: string,
  on: boolean,
  reason: string | undefined,
  given?: FeatureFacts,
) {
  const facts = given ?? (await featureFacts(workspace.id));
  const featureKey = normalizeFeatureKey(key);
  const feature = facts.features.find((candidate) => candidate.key === featureKey);
  if (!feature) throw new AdminRefusal("That feature is not in the catalogue.");
  const why = reason?.trim() ?? "";
  if (!on && why.length < 3) throw new AdminRefusal("Say why, so the owner can see it in their audit log.");
  await writeFlags(workspace.id, [featureKey], on, why || `Switched on by ${operator.name}`);
  await recordOperatorEvent({
    operatorId: operator.id,
    companyId: workspace.id,
    eventType: on ? "operator.features.switched_on" : "operator.features.switched_off",
    entityType: "feature",
    entityId: featureKey,
    reason: why || undefined,
    payload: { feature: feature.name },
  });
}

/**
 * Back to what its verticals say: the hand switch goes. A feature a held
 * vertical keeps out stays off, as the vertical's own flag; anything else
 * falls back to its bundles, its plan or its default.
 */
export async function resetFeature(operator: SignedInOperator, workspace: Workspace, key: string, given?: FeatureFacts) {
  const facts = given ?? (await featureFacts(workspace.id));
  const featureKey = normalizeFeatureKey(key);
  const feature = facts.features.find((candidate) => candidate.key === featureKey);
  if (!feature) throw new AdminRefusal("That feature is not in the catalogue.");
  const row = featureRows(facts).find((candidate) => candidate.key === featureKey)!;
  if (!row.switched) throw new AdminRefusal("It is already as its verticals say.");
  const { byVertical, byBundle } = carriers(facts);
  const keptOut = facts.keptOutBy.get(featureKey);
  if (!byVertical.has(featureKey) && !byBundle.has(featureKey) && keptOut) {
    await writeFlags(workspace.id, [featureKey], false, `Not part of ${list(keptOut)}`);
  } else {
    const ids = await featureIds([featureKey]);
    const featureId = ids.get(featureKey);
    if (featureId) await prisma.companyFeatureFlag.deleteMany({ where: { companyId: workspace.id, featureId } });
  }
  await recordOperatorEvent({
    operatorId: operator.id,
    companyId: workspace.id,
    eventType: "operator.features.reset",
    entityType: "feature",
    entityId: featureKey,
    payload: { feature: feature.name, was: row.on ? "on" : "off" },
  });
}
