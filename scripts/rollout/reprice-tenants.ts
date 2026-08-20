import "dotenv/config";

import { writePlatformAuditEvent } from "@/lib/audit/platform";
import {
  computeCompanyPricing,
  getCompanyFeatureMap,
  grantBundleToCompany,
} from "@/lib/platform/entitlements";
import {
  ANNUAL_DISCOUNT_RATE,
  FEATURE_BUNDLES,
  FEATURE_CATALOG,
  TIERS,
  getBundleDefinition,
  getTierDefinition,
  type TierDefinition,
} from "@/lib/platform/feature-catalog";
import { normalizeFeatureKey } from "@/lib/platform/gating/catalog-utils";
import { prisma } from "@/lib/prisma";

/**
 * PR-3 — move every existing tenant onto the six-tier structure from PR-1/PR-2.
 *
 * The invariant this script exists to protect is ZERO LOST FEATURES. A price
 * change a customer did not ask for is a conversation; a capability that
 * silently stops working the morning after a migration is an outage they will
 * discover in front of their own customers. So the plan for each tenant is
 * computed as a feature-by-feature diff of *what the gate answers today* against
 * *what the gate would answer after the move*, and anything the new structure
 * cannot carry is surfaced loudly rather than absorbed.
 *
 * Three deliberate choices in how "today" is measured:
 *
 *   1. Today's feature set is read from `getCompanyFeatureMap` — the live gate —
 *      not reconstructed from the retired tier definitions. Those definitions no
 *      longer exist in code, and since `TIER_CODE_ALIASES` landed the gate has
 *      already been answering legacy tenants with their mapped tier. The live
 *      answer is therefore the tenant's actual reality, and the only honest
 *      thing to diff against.
 *   2. The proposed feature set is projected from the code catalogue alone —
 *      target tier, its bundles, and the addon bundles that survived the scope
 *      trim. It is never read back from the database, so the diff cannot be
 *      fooled by a stale row.
 *   3. A feature that has left `FEATURE_CATALOG` entirely (CCTV, autos, scrap —
 *      ST-1.1) is reported as *retired*, not as lost. Retiring those modules is
 *      a decision already taken and already exported (ST-0.2); counting them
 *      here would make every affected tenant unmovable for a reason this script
 *      has no say over.
 *
 * DRY RUN IS THE DEFAULT. `--apply` is the only thing that writes, every applied
 * tenant gets a hash-chained `PlatformAuditEvent`, and a tenant whose plan is
 * anything other than OK is skipped rather than forced — this is somebody's bill.
 *
 *   pnpm tsx scripts/rollout/reprice-tenants.ts
 *   pnpm tsx scripts/rollout/reprice-tenants.ts --json > reprice.json
 *   pnpm tsx scripts/rollout/reprice-tenants.ts --company-id <uuid>
 *   pnpm tsx scripts/rollout/reprice-tenants.ts --apply --actor ops@corelith
 *
 * Exit code is 1 when any tenant would lose a live feature or cannot be mapped
 * onto a tier: both are rollout blockers that need a human before PR-3.2 runs.
 */

export const REPRICE_AUDIT_EVENT_TYPE = "platform.subscription.repriced";

const DEFAULT_ACTOR = "system:rollout/reprice-tenants";

/**
 * `OK` covers "nothing to do" as well as "safe to move" — read `requiresChange`
 * for the difference. `LOSS` and `UNMAPPED` are both refusals to apply.
 */
export type RepriceStatus = "OK" | "LOSS" | "UNMAPPED";

export interface FeatureDiffEntry {
  key: string;
  name: string;
  before: boolean;
  after: boolean;
}

export interface RepricePricing {
  base: number;
  siteOverage: number;
  addons: number;
  features: number;
  total: number;
}

export interface TenantRepricePlan {
  companyId: string;
  name: string;
  slug: string;
  subscriptionId: string;
  /** Plan code exactly as the `SubscriptionPlan` row spells it today. */
  currentPlanCode: string;
  currentPlanName: string;
  currency: string;
  siteCount: number;
  /** Tier the current code resolves to through `TIER_CODE_ALIASES`, if any. */
  proposedTierCode: string | null;
  proposedTierName: string | null;
  proposedMonthlyPrice: number | null;
  proposedAnnualMonthlyPrice: number | null;
  proposedOnboardingFee: number | null;
  currentPricing: RepricePricing;
  proposedPricing: RepricePricing;
  monthlyDelta: number;
  /** Addon bundles that still exist in `FEATURE_BUNDLES` and stay as they are. */
  retainedAddonBundleCodes: string[];
  /**
   * Addon bundles the tenant pays for that the target tier already includes.
   * Left alone on purpose — see `applyRepricePlan`.
   */
  redundantAddonBundleCodes: string[];
  /** Addon rows pointing at a bundle the scope trim removed from the catalogue. */
  droppedAddonBundleCodes: string[];
  /** Bundles that must be granted for the tenant to come out whole. */
  grantBundleCodes: string[];
  gainedFeatures: string[];
  /** Live catalogue features the move would take away. Must be empty. */
  lostFeatures: string[];
  /** Features enabled today that have left `FEATURE_CATALOG` altogether. */
  retiredFeatures: string[];
  /** Only the keys whose answer changes; a clean move has an empty diff. */
  featureDiff: FeatureDiffEntry[];
  /** Keys on before and still on after — the ones the invariant is about. */
  unchangedFeatureCount: number;
  status: RepriceStatus;
  requiresChange: boolean;
  notes: string[];
}

export interface RepriceApplyResult {
  companyId: string;
  slug: string;
  fromPlanCode: string;
  toTierCode: string;
  grantedBundleCodes: string[];
  auditEventType: string;
  monthlyBefore: number;
  monthlyAfter: number;
  /** Live features present before that are still present after. */
  verifiedFeatureCount: number;
}

interface FlagRow {
  key: string;
  name: string;
  isEnabled: boolean;
  isBillable: boolean;
  monthlyPrice: number;
  isActive: boolean;
}

interface AddonRow {
  code: string;
  monthlyPrice: number;
  additionalSiteMonthlyPrice: number;
}

interface TenantState {
  companyId: string;
  name: string;
  slug: string;
  subscriptionId: string;
  planCode: string;
  planName: string;
  planMonthlyPrice: number;
  currency: string;
  siteCount: number;
  addonRows: AddonRow[];
  flags: FlagRow[];
  /** Every feature key the gate answers `true` for right now. */
  currentEnabled: Set<string>;
  currentPricing: RepricePricing;
}

const CATALOG_BY_KEY = new Map(
  FEATURE_CATALOG.map((feature) => [normalizeFeatureKey(feature.key), feature]),
);

function distinct(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

/** Same precedence as `lib/platform/entitlements.ts`: a zero on the row means
 *  "unpriced", so the catalogue answers instead. */
function bundleBasePrice(code: string, rowValue?: unknown): number {
  const fromRow = money(rowValue);
  if (fromRow > 0) return fromRow;
  return money(getBundleDefinition(code)?.monthlyPrice ?? 0);
}

function bundleSitePrice(code: string, rowValue?: unknown): number {
  const fromRow = money(rowValue);
  if (fromRow > 0) return fromRow;
  return money(getBundleDefinition(code)?.additionalSiteMonthlyPrice ?? 0);
}

function bundleFeatureKeys(code: string): string[] {
  return (getBundleDefinition(code)?.features ?? []).map((key) => normalizeFeatureKey(key));
}

function featureName(key: string): string {
  return CATALOG_BY_KEY.get(key)?.name ?? key;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * What the gate *would* answer for a tenant on `tier` with `addonBundleCodes`.
 *
 * A deliberate re-implementation of `getCompanyFeatureMap`'s resolution order
 * rather than a call to it: the point of the diff is to evaluate a hypothetical
 * subscription without writing one, and the projection must come from the code
 * catalogue so a stale `PlatformFeature` or `FeatureBundle` row cannot make a
 * proposal look safer than it is. Bundle codes the catalogue does not know
 * contribute nothing — that is the scope trim, showing up as a loss to solve.
 */
function projectEntitlement(input: {
  tier: TierDefinition | null;
  addonBundleCodes: string[];
  flags: FlagRow[];
}): { enabled: Set<string>; entitled: Set<string> } {
  const enabled = new Map<string, boolean>();
  for (const feature of FEATURE_CATALOG) {
    const key = normalizeFeatureKey(feature.key);
    // A billable feature is off until something pays for it; that is the rule
    // `getCompanyFeatureMap` applies and the reason an addon row matters.
    enabled.set(key, feature.isBillable ? false : Boolean(feature.defaultEnabled));
  }

  const entitled = new Set<string>();
  const grant = (key: string) => {
    const normalized = normalizeFeatureKey(key);
    if (!CATALOG_BY_KEY.has(normalized)) return;
    entitled.add(normalized);
    enabled.set(normalized, true);
  };

  for (const key of input.tier?.includedFeatures ?? []) grant(key);
  for (const code of input.tier?.includedBundles ?? []) {
    for (const key of bundleFeatureKeys(code)) grant(key);
  }
  for (const code of input.addonBundleCodes) {
    for (const key of bundleFeatureKeys(code)) grant(key);
  }

  for (const flag of input.flags) {
    const key = normalizeFeatureKey(flag.key);
    const catalogEntry = CATALOG_BY_KEY.get(key);
    if (!catalogEntry) continue;
    const isBillable = Boolean(catalogEntry.isBillable);
    enabled.set(key, flag.isEnabled && (!isBillable || entitled.has(key)));
  }

  return {
    enabled: new Set([...enabled.entries()].filter(([, on]) => on).map(([key]) => key)),
    entitled,
  };
}

function projectPricing(input: {
  tier: TierDefinition | null;
  basePrice: number;
  siteCount: number;
  addonRows: AddonRow[];
  grantedBundleCodes: string[];
  flags: FlagRow[];
  entitled: Set<string>;
}): RepricePricing {
  const includedSites = Math.max(0, input.tier?.includedSites ?? 0);
  const overageCount = Math.max(0, input.siteCount - includedSites);
  const siteOverage = overageCount * money(input.tier?.additionalSiteMonthlyPrice ?? 0);

  let addons = 0;
  for (const row of input.addonRows) {
    addons += bundleBasePrice(row.code, row.monthlyPrice);
    addons += bundleSitePrice(row.code, row.additionalSiteMonthlyPrice) * input.siteCount;
  }
  for (const code of input.grantedBundleCodes) {
    addons += bundleBasePrice(code);
    addons += bundleSitePrice(code) * input.siteCount;
  }

  let features = 0;
  for (const flag of input.flags) {
    if (!flag.isEnabled || !flag.isActive || !flag.isBillable) continue;
    if (input.entitled.has(normalizeFeatureKey(flag.key))) continue;
    features += money(flag.monthlyPrice);
  }

  const base = money(input.basePrice);
  return {
    base: round2(base),
    siteOverage: round2(siteOverage),
    addons: round2(addons),
    features: round2(features),
    total: round2(base + siteOverage + addons + features),
  };
}

/**
 * Cheapest set of catalogue bundles that covers everything the proposal drops.
 *
 * Greedy by coverage, then by price: an exact minimum-cost cover is NP-hard and
 * the candidate set is twenty-odd bundles with little overlap, so the greedy
 * answer is the same one a human would pick. Ties break on code so two runs of
 * the report never disagree about what the operator is being asked to approve.
 */
function chooseCoveringBundles(
  missing: Set<string>,
  alreadyEntitledBundleCodes: Set<string>,
): { codes: string[]; uncovered: string[] } {
  const remaining = new Set(missing);
  const chosen: string[] = [];
  const candidates = FEATURE_BUNDLES.filter(
    (bundle) => !alreadyEntitledBundleCodes.has(bundle.code),
  );

  while (remaining.size > 0) {
    let best: { code: string; covered: number; price: number } | null = null;
    for (const bundle of candidates) {
      if (chosen.includes(bundle.code)) continue;
      const covered = bundleFeatureKeys(bundle.code).filter((key) => remaining.has(key)).length;
      if (covered === 0) continue;
      const price = money(bundle.monthlyPrice);
      const better =
        !best ||
        covered > best.covered ||
        (covered === best.covered && price < best.price) ||
        (covered === best.covered && price === best.price && bundle.code < best.code);
      if (better) best = { code: bundle.code, covered, price };
    }
    if (!best) break;
    chosen.push(best.code);
    for (const key of bundleFeatureKeys(best.code)) remaining.delete(key);
  }

  return { codes: chosen.sort(), uncovered: Array.from(remaining).sort() };
}

async function loadTenantState(companyId: string): Promise<TenantState | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, slug: true },
  });
  if (!company) return null;

  // Same selection rule as `getCompanyFeatureMap`: the most recently updated
  // subscription row is the one that decides the tier.
  const subscription = await prisma.companySubscription.findFirst({
    where: { companyId },
    include: { plan: true },
    orderBy: [{ updatedAt: "desc" }],
  });
  if (!subscription) return null;

  const [addons, flags, currentMap, pricing] = await Promise.all([
    prisma.companySubscriptionAddon.findMany({
      where: { companyId, isEnabled: true },
      select: {
        bundle: { select: { code: true, monthlyPrice: true, additionalSiteMonthlyPrice: true } },
      },
    }),
    prisma.companyFeatureFlag.findMany({
      where: {
        companyId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: {
        isEnabled: true,
        feature: {
          select: { key: true, name: true, isBillable: true, monthlyPrice: true, isActive: true },
        },
      },
    }),
    getCompanyFeatureMap(companyId),
    computeCompanyPricing(companyId),
  ]);

  return {
    companyId: company.id,
    name: company.name,
    slug: company.slug,
    subscriptionId: subscription.id,
    planCode: subscription.plan.code.trim().toUpperCase(),
    planName: subscription.plan.name,
    planMonthlyPrice: money(subscription.plan.monthlyPrice),
    currency: subscription.plan.currency ?? "USD",
    siteCount: pricing.siteCount,
    addonRows: addons.map((addon) => ({
      code: addon.bundle.code.trim().toUpperCase(),
      monthlyPrice: money(addon.bundle.monthlyPrice),
      additionalSiteMonthlyPrice: money(addon.bundle.additionalSiteMonthlyPrice),
    })),
    flags: flags.map((flag) => ({
      key: normalizeFeatureKey(flag.feature.key),
      name: flag.feature.name,
      isEnabled: Boolean(flag.isEnabled),
      isBillable: Boolean(flag.feature.isBillable),
      monthlyPrice: money(flag.feature.monthlyPrice),
      isActive: Boolean(flag.feature.isActive),
    })),
    currentEnabled: new Set(Object.keys(currentMap).filter((key) => currentMap[key])),
    currentPricing: {
      base: round2(pricing.baseAmount),
      siteOverage: round2(pricing.tierSiteOverageAmount),
      addons: round2(pricing.addonAmount),
      features: round2(pricing.featureAmount),
      total: round2(pricing.totalAmount),
    },
  };
}

/**
 * PR-3.1 — the report for one tenant. Reads only; writes nothing, ever.
 */
export async function buildRepricePlan(
  companyId: string,
  options: { fallbackTierCode?: string } = {},
): Promise<TenantRepricePlan | null> {
  const state = await loadTenantState(companyId);
  if (!state) return null;

  const notes: string[] = [];
  const mappedTier = getTierDefinition(state.planCode);
  const fallbackTier = options.fallbackTierCode
    ? getTierDefinition(options.fallbackTierCode)
    : null;
  const tier = mappedTier ?? fallbackTier;
  if (!mappedTier && fallbackTier) {
    notes.push(
      `Plan code ${state.planCode} is in no tier alias; using --fallback-tier ${fallbackTier.code}.`,
    );
  }

  const catalogAddonCodes = distinct(
    state.addonRows.filter((row) => getBundleDefinition(row.code)).map((row) => row.code),
  );
  const droppedAddonBundleCodes = distinct(
    state.addonRows.filter((row) => !getBundleDefinition(row.code)).map((row) => row.code),
  );
  const tierBundleCodes = new Set(tier?.includedBundles ?? []);
  const redundantAddonBundleCodes = catalogAddonCodes.filter((code) => tierBundleCodes.has(code));
  const retainedAddonBundleCodes = catalogAddonCodes.filter((code) => !tierBundleCodes.has(code));

  const withoutGrants = projectEntitlement({
    tier,
    addonBundleCodes: catalogAddonCodes,
    flags: state.flags,
  });

  // Retired modules are not this script's loss to prevent (ST-1.1 removed them
  // from the catalogue and ST-0.2 exported their data), so they are separated
  // out before the invariant is judged.
  const retiredFeatures: string[] = [];
  const missing = new Set<string>();
  for (const key of state.currentEnabled) {
    if (!CATALOG_BY_KEY.has(key)) {
      retiredFeatures.push(key);
      continue;
    }
    if (!withoutGrants.enabled.has(key)) missing.add(key);
  }

  const cover = chooseCoveringBundles(
    missing,
    new Set([...tierBundleCodes, ...catalogAddonCodes]),
  );
  const grantBundleCodes = cover.codes;

  const withGrants = projectEntitlement({
    tier,
    addonBundleCodes: distinct([...catalogAddonCodes, ...grantBundleCodes]),
    flags: state.flags,
  });

  const lostFeatures = cover.uncovered;
  const gainedFeatures = [...withGrants.enabled]
    .filter((key) => !state.currentEnabled.has(key))
    .sort();

  const featureDiff: FeatureDiffEntry[] = [];
  let unchangedFeatureCount = 0;
  for (const key of distinct([...state.currentEnabled, ...withGrants.enabled])) {
    const before = state.currentEnabled.has(key);
    const after = withGrants.enabled.has(key) || retiredFeatures.includes(key);
    if (before === after) {
      unchangedFeatureCount += 1;
      continue;
    }
    featureDiff.push({ key, name: featureName(key), before, after });
  }

  const proposedPricing = projectPricing({
    tier,
    basePrice: tier?.monthlyPrice ?? state.planMonthlyPrice,
    siteCount: state.siteCount,
    addonRows: state.addonRows,
    grantedBundleCodes: grantBundleCodes,
    flags: state.flags,
    entitled: withGrants.entitled,
  });

  if (droppedAddonBundleCodes.length > 0) {
    notes.push(
      `Still billed for bundle(s) the catalogue no longer defines: ${droppedAddonBundleCodes.join(", ")}. ` +
        "Left in place here — cancelling a paid line is a billing decision, not a repricing one.",
    );
  }
  if (redundantAddonBundleCodes.length > 0) {
    notes.push(
      `Paying separately for bundle(s) the new tier already includes: ${redundantAddonBundleCodes.join(", ")}. ` +
        "Left in place so this script never changes a price by more than the tier move.",
    );
  }

  const status: RepriceStatus = !tier ? "UNMAPPED" : lostFeatures.length > 0 ? "LOSS" : "OK";
  const requiresChange = tier
    ? tier.code !== state.planCode || grantBundleCodes.length > 0
    : false;

  return {
    companyId: state.companyId,
    name: state.name,
    slug: state.slug,
    subscriptionId: state.subscriptionId,
    currentPlanCode: state.planCode,
    currentPlanName: state.planName,
    currency: state.currency,
    siteCount: state.siteCount,
    proposedTierCode: tier?.code ?? null,
    proposedTierName: tier?.name ?? null,
    proposedMonthlyPrice: tier?.monthlyPrice ?? null,
    proposedAnnualMonthlyPrice: tier?.annualMonthlyPrice ?? null,
    proposedOnboardingFee: tier?.onboardingFee ?? null,
    currentPricing: state.currentPricing,
    proposedPricing,
    monthlyDelta: round2(proposedPricing.total - state.currentPricing.total),
    retainedAddonBundleCodes,
    redundantAddonBundleCodes,
    droppedAddonBundleCodes,
    grantBundleCodes,
    gainedFeatures,
    lostFeatures,
    retiredFeatures: retiredFeatures.sort(),
    featureDiff,
    unchangedFeatureCount,
    status,
    requiresChange,
    notes,
  };
}

export async function buildRepricePlans(
  options: { companyId?: string; fallbackTierCode?: string } = {},
): Promise<TenantRepricePlan[]> {
  // Only tenants that actually have a subscription: a company with no
  // `CompanySubscription` is not being billed and has no tier to move.
  const subscribed = await prisma.companySubscription.findMany({
    where: options.companyId ? { companyId: options.companyId } : undefined,
    select: { companyId: true },
    distinct: ["companyId"],
  });

  const plans: TenantRepricePlan[] = [];
  for (const row of subscribed) {
    const plan = await buildRepricePlan(row.companyId, {
      fallbackTierCode: options.fallbackTierCode,
    });
    if (plan) plans.push(plan);
  }
  return plans.sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * The `SubscriptionPlan` row for a tier, created from the catalogue if this
 * database has never seen it. The catalogue is the source of truth for price and
 * limits; the row exists because `CompanySubscription.planId` needs something to
 * point at.
 */
async function ensureSubscriptionPlanRow(tier: TierDefinition): Promise<{ id: string }> {
  const shared = {
    name: tier.name,
    description: tier.description,
    monthlyPrice: tier.monthlyPrice,
    annualPrice: tier.annualMonthlyPrice * 12,
    maxSites: tier.includedSites,
    maxUsers: tier.includedUsers,
    warningDays: tier.warningDays,
    graceDays: tier.graceDays,
    isActive: true,
  };
  return prisma.subscriptionPlan.upsert({
    where: { code: tier.code },
    update: shared,
    create: { code: tier.code, currency: "USD", ...shared },
    select: { id: true },
  });
}

/**
 * PR-3.2 — move one tenant. The only writing path in this file.
 *
 * Refuses anything the report did not mark `OK`, because the two failing states
 * are precisely the ones a human has to decide: a tenant that would lose a live
 * capability, and a tenant on a plan code no tier claims.
 */
export async function applyRepricePlan(
  plan: TenantRepricePlan,
  options: { actorId?: string; reason?: string } = {},
): Promise<RepriceApplyResult> {
  if (plan.status !== "OK" || !plan.proposedTierCode) {
    throw new Error(
      `Refusing to reprice ${plan.slug}: status ${plan.status}` +
        (plan.lostFeatures.length > 0 ? ` (would lose ${plan.lostFeatures.join(", ")})` : ""),
    );
  }
  const tier = getTierDefinition(plan.proposedTierCode);
  if (!tier) throw new Error(`Unknown tier ${plan.proposedTierCode}.`);

  const actorId = options.actorId ?? DEFAULT_ACTOR;
  const reason =
    options.reason ?? `PR-3 reprice: ${plan.currentPlanCode} -> ${tier.code}`;

  const beforeMap = await getCompanyFeatureMap(plan.companyId);
  const beforeEnabled = Object.keys(beforeMap).filter((key) => beforeMap[key]);

  // Grants first, and outside the transaction: `grantBundleToCompany` may have
  // to sync the whole entitlement catalogue, which is far too much work to hold
  // a transaction open for. Grants are additive and idempotent, so a failure
  // between here and the tier switch leaves the tenant with more than it had,
  // never less.
  for (const code of plan.grantBundleCodes) {
    await grantBundleToCompany({ companyId: plan.companyId, bundleCode: code, reason });
  }

  const planRow = await ensureSubscriptionPlanRow(tier);

  // The tier switch and its audit row commit together or not at all: an
  // unrecorded change to somebody's bill is the failure mode the chain exists
  // to rule out.
  await prisma.$transaction(async (tx) => {
    await tx.companySubscription.update({
      where: { id: plan.subscriptionId },
      data: { planId: planRow.id },
    });
    await writePlatformAuditEvent(
      {
        companyId: plan.companyId,
        actorId,
        eventType: REPRICE_AUDIT_EVENT_TYPE,
        entityType: "CompanySubscription",
        entityId: plan.subscriptionId,
        reason,
        payload: {
          fromPlanCode: plan.currentPlanCode,
          toTierCode: tier.code,
          grantedBundleCodes: plan.grantBundleCodes,
          retainedAddonBundleCodes: plan.retainedAddonBundleCodes,
          droppedAddonBundleCodes: plan.droppedAddonBundleCodes,
          redundantAddonBundleCodes: plan.redundantAddonBundleCodes,
          monthlyBefore: plan.currentPricing.total,
          monthlyAfter: plan.proposedPricing.total,
          monthlyDelta: plan.monthlyDelta,
          annualMonthlyPrice: tier.annualMonthlyPrice,
          annualDiscountRate: ANNUAL_DISCOUNT_RATE,
          onboardingFee: tier.onboardingFee,
          gainedFeatures: plan.gainedFeatures,
          retiredFeatures: plan.retiredFeatures,
          featuresBefore: beforeEnabled.length,
        },
      },
      tx,
    );
  });

  // Verify against the live gate rather than trusting the projection: the
  // projection is what justified the move, so it is the last thing that should
  // be allowed to confirm it.
  const afterMap = await getCompanyFeatureMap(plan.companyId);
  const stillOn = beforeEnabled.filter((key) => afterMap[key]);
  const lost = beforeEnabled.filter((key) => !afterMap[key]);
  if (lost.length > 0) {
    throw new Error(
      `Reprice of ${plan.slug} lost feature(s) despite a clean plan: ${lost.join(", ")}.`,
    );
  }

  return {
    companyId: plan.companyId,
    slug: plan.slug,
    fromPlanCode: plan.currentPlanCode,
    toTierCode: tier.code,
    grantedBundleCodes: plan.grantBundleCodes,
    auditEventType: REPRICE_AUDIT_EVENT_TYPE,
    monthlyBefore: plan.currentPricing.total,
    monthlyAfter: plan.proposedPricing.total,
    verifiedFeatureCount: stillOn.length,
  };
}

function parseArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function renderTable(headers: string[], rows: string[][]) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? "").length)),
  );
  const line = (cells: string[]) =>
    cells.map((cell, index) => (cell ?? "").padEnd(widths[index])).join("  ").trimEnd();

  console.log(line(headers));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) console.log(line(row));
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function printReport(plans: TenantRepricePlan[], applied: RepriceApplyResult[], isApply: boolean) {
  console.log("Rollout Tenant Repricing (PR-3)");
  console.log("===============================");
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log(`Mode: ${isApply ? "APPLY (writing)" : "DRY RUN (no writes)"}`);
  console.log(`Tenants with a subscription: ${plans.length}`);

  if (plans.length === 0) {
    console.log("\nNo subscribed tenants on this database. Nothing to reprice.");
    return;
  }

  console.log("");
  renderTable(
    ["Tenant", "Slug", "Now", "Proposed", "Now $", "New $", "Delta", "Grants", "Lost", "Status"],
    plans.map((plan) => [
      plan.name,
      plan.slug,
      plan.currentPlanCode,
      plan.proposedTierCode ?? "-",
      plan.currentPricing.total.toFixed(2),
      plan.proposedPricing.total.toFixed(2),
      signed(plan.monthlyDelta),
      String(plan.grantBundleCodes.length),
      String(plan.lostFeatures.length),
      plan.status,
    ]),
  );

  for (const plan of plans) {
    console.log("");
    console.log(`## ${plan.name} (${plan.slug}) — ${plan.currentPlanCode} -> ${plan.proposedTierCode ?? "UNMAPPED"}`);
    console.log(
      `Price: ${plan.currency} ${plan.currentPricing.total.toFixed(2)} -> ${plan.proposedPricing.total.toFixed(2)} (${signed(plan.monthlyDelta)}/mo)` +
        (plan.proposedAnnualMonthlyPrice !== null
          ? ` · annual ${plan.proposedAnnualMonthlyPrice.toFixed(2)}/mo · onboarding ${(plan.proposedOnboardingFee ?? 0).toFixed(2)}`
          : ""),
    );
    console.log(
      `Bundles: retain ${plan.retainedAddonBundleCodes.join(", ") || "none"} · grant ${plan.grantBundleCodes.join(", ") || "none"}`,
    );
    if (plan.featureDiff.length === 0) {
      console.log(`Features: identical (${plan.unchangedFeatureCount} unchanged).`);
    } else {
      renderTable(
        ["Feature", "Name", "Now", "After"],
        plan.featureDiff.map((entry) => [
          entry.key,
          entry.name,
          entry.before ? "on" : "off",
          entry.after ? "on" : "off",
        ]),
      );
    }
    if (plan.retiredFeatures.length > 0) {
      console.log(
        `Retired modules still switched on (ST-1.1, not a repricing loss): ${plan.retiredFeatures.join(", ")}`,
      );
    }
    for (const note of plan.notes) console.log(`Note: ${note}`);
    if (plan.lostFeatures.length > 0) {
      console.log(`LOST FEATURES: ${plan.lostFeatures.join(", ")}`);
    }
  }

  const losses = plans.filter((plan) => plan.status === "LOSS");
  const unmapped = plans.filter((plan) => plan.status === "UNMAPPED");

  console.log("");
  if (losses.length > 0) {
    console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.log(`!! ZERO-LOST-FEATURES INVARIANT BROKEN for ${losses.length} tenant(s):`);
    for (const plan of losses) {
      console.log(`!!   ${plan.slug}: ${plan.lostFeatures.join(", ")}`);
    }
    console.log("!! No bundle in the new catalogue carries these. Decide before applying.");
    console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  } else {
    console.log("Zero lost features across every tenant inspected.");
  }
  if (unmapped.length > 0) {
    console.log(
      `Unmapped plan code(s), no tier to move to: ${unmapped.map((plan) => `${plan.slug}=${plan.currentPlanCode}`).join(", ")}`,
    );
  }

  if (isApply) {
    console.log("");
    console.log(`Applied: ${applied.length} tenant(s).`);
    for (const result of applied) {
      console.log(
        `  ${result.slug}: ${result.fromPlanCode} -> ${result.toTierCode}` +
          `${result.grantedBundleCodes.length > 0 ? ` +${result.grantedBundleCodes.join("+")}` : ""}` +
          ` · ${result.monthlyBefore.toFixed(2)} -> ${result.monthlyAfter.toFixed(2)}` +
          ` · ${result.verifiedFeatureCount} features verified · audit written`,
      );
    }
  } else {
    console.log("Dry run: nothing was written. Re-run with --apply to move these tenants.");
  }
}

async function main() {
  const isApply = process.argv.includes("--apply");
  const asJson = process.argv.includes("--json");
  const companyId = parseArg("--company-id");
  const fallbackTierCode = parseArg("--fallback-tier");
  const actorId = parseArg("--actor") ?? DEFAULT_ACTOR;
  const reason = parseArg("--reason");

  if (fallbackTierCode && !getTierDefinition(fallbackTierCode)) {
    throw new Error(
      `--fallback-tier ${fallbackTierCode} is not a tier. Known: ${TIERS.map((tier) => tier.code).join(", ")}`,
    );
  }

  const plans = await buildRepricePlans({ companyId, fallbackTierCode });

  const applied: RepriceApplyResult[] = [];
  if (isApply) {
    for (const plan of plans) {
      if (plan.status !== "OK") continue;
      if (!plan.requiresChange) continue;
      applied.push(await applyRepricePlan(plan, { actorId, reason }));
    }
  }

  if (asJson) {
    console.log(
      JSON.stringify(
        { generatedAt: new Date().toISOString(), mode: isApply ? "apply" : "dry-run", plans, applied },
        null,
        2,
      ),
    );
  } else {
    printReport(plans, applied, isApply);
  }

  if (plans.some((plan) => plan.status !== "OK")) {
    process.exitCode = 1;
  }
}

/**
 * Only run the CLI when this file *is* the entry point. The test suite imports
 * the planning functions from here, and a top-level `main()` would fire a full
 * scan — and, with `--apply` anywhere on argv, writes — inside the test process.
 */
const invokedDirectly = (process.argv[1] ?? "").endsWith("reprice-tenants.ts");
if (invokedDirectly) {
  main()
    .catch((error) => {
      console.error("[rollout/reprice-tenants] failed:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
