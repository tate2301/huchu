/**
 * PR-3 — tenant repricing, against a real Postgres.
 *
 * These tests need the database and deliberately so. The thing under test is a
 * migration of somebody's subscription: what makes it correct is what ends up in
 * `CompanySubscription`, `CompanySubscriptionAddon`, `CompanyFeatureFlag` and
 * `PlatformAuditEvent`, and what the live gate answers afterwards. A mocked
 * client would prove the mock.
 *
 * The fixture reproduces the case the rollout actually has to survive: a tenant
 * on a retired tier code (`MEDIUM`), carrying one addon bundle that survived the
 * catalogue restructure and one that did not. The features the vanished bundle
 * used to carry are the ones the reprice has to buy back.
 *
 * Run: npx vitest run scripts/rollout/reprice-tenants
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { getCompanyFeatureMap, grantBundleToCompany, syncEntitlementCatalog } from "@corelithzw/platform/entitlements";
import { prisma } from "@corelithzw/db/client";
import {
  REPRICE_AUDIT_EVENT_TYPE,
  applyRepricePlan,
  buildRepricePlan,
} from "@/scripts/rollout/reprice-tenants";

const suite = crypto.randomUUID().slice(0, 8);
/** Bundle codes are normalized to upper case everywhere they are read, so a
 *  fixture code that is not already upper case would never match its own row. */
const SUITE_CODE = suite.toUpperCase();

/** The tenant that can be made whole: a legacy bundle whose features still
 *  exist in the catalogue, so some surviving bundle can carry them. */
let companyId: string;
let subscriptionId: string;
/** The tenant that cannot: its legacy bundle carries a feature no bundle in the
 *  new catalogue sells. */
let lossCompanyId: string;

const legacyBundleIds: string[] = [];
const companyIds: string[] = [];

/** Only ADDON_ZIMBABWE_PAYROLL carries these two, so the cover is unambiguous. */
const RESCUABLE_FEATURE_KEYS = ["hr.statutory-tables", "hr.statutory-returns"];
/** In no bundle and in no tier — nothing in the new catalogue can carry it. */
const ORPHAN_FEATURE_KEY = "stores.fuel-ledger";

/** Feature keys the gate answered `true` for before anything was applied. */
let enabledBeforeApply: string[] = [];

/**
 * A `FeatureBundle` row with no definition in `feature-catalog.ts` — exactly
 * what a tenant is left holding when a bundle is dropped from the catalogue but
 * its addon row survives.
 */
async function createLegacyBundle(code: string, featureKeys: string[]): Promise<string> {
  const bundle = await prisma.featureBundle.create({
    data: { code, name: `Legacy ${code}`, monthlyPrice: 25, additionalSiteMonthlyPrice: 0 },
    select: { id: true },
  });
  legacyBundleIds.push(bundle.id);

  const features = await prisma.platformFeature.findMany({
    where: { key: { in: featureKeys } },
    select: { id: true },
  });
  expect(features).toHaveLength(featureKeys.length);
  await prisma.featureBundleItem.createMany({
    data: features.map((feature) => ({ bundleId: bundle.id, featureId: feature.id })),
    skipDuplicates: true,
  });
  return bundle.id;
}

async function createTenant(slug: string, planId: string): Promise<{ companyId: string; subscriptionId: string }> {
  const company = await prisma.company.create({
    data: { name: `PR-3 ${slug}`, slug },
    select: { id: true },
  });
  companyIds.push(company.id);
  const subscription = await prisma.companySubscription.create({
    data: { companyId: company.id, planId },
    select: { id: true },
  });
  return { companyId: company.id, subscriptionId: subscription.id };
}

beforeAll(async () => {
  await prisma.$connect();
  // The catalogue rows are what addons and flags hang foreign keys off; a fresh
  // test database has none.
  await syncEntitlementCatalog();

  // MEDIUM is a retired code that TIER_CODE_ALIASES maps to SCALE. Upserted
  // rather than created because the plan catalogue is global to the database.
  const legacyPlan = await prisma.subscriptionPlan.upsert({
    where: { code: "MEDIUM" },
    update: {},
    create: { code: "MEDIUM", name: "Medium (retired)", monthlyPrice: 149, currency: "USD" },
    select: { id: true },
  });

  const main = await createTenant(`pr3-${suite}`, legacyPlan.id);
  companyId = main.companyId;
  subscriptionId = main.subscriptionId;

  // A bundle that survived the restructure and is not part of SCALE: it must
  // still be there afterwards, untouched.
  await grantBundleToCompany({ companyId, bundleCode: "ADDON_GOLD_CORE", reason: "fixture" });

  const rescuableBundleId = await createLegacyBundle(
    `ADDON_LEGACY_ZW_PAYROLL_${SUITE_CODE}`,
    RESCUABLE_FEATURE_KEYS,
  );
  await prisma.companySubscriptionAddon.create({
    data: { companyId, bundleId: rescuableBundleId, isEnabled: true, reason: "fixture" },
  });

  const loss = await createTenant(`pr3-loss-${suite}`, legacyPlan.id);
  lossCompanyId = loss.companyId;
  const orphanBundleId = await createLegacyBundle(`ADDON_LEGACY_FUEL_${SUITE_CODE}`, [ORPHAN_FEATURE_KEY]);
  await prisma.companySubscriptionAddon.create({
    data: { companyId: lossCompanyId, bundleId: orphanBundleId, isEnabled: true, reason: "fixture" },
  });

  const map = await getCompanyFeatureMap(companyId);
  enabledBeforeApply = Object.keys(map).filter((key) => map[key]);
});

afterAll(async () => {
  // PlatformAuditEvent is SetNull on company delete, so its rows would outlive
  // the tenant and pollute later runs.
  await prisma.platformAuditEvent.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  // The MEDIUM and SCALE `SubscriptionPlan` rows are left behind on purpose:
  // the plan catalogue is global, and deleting a row a concurrently running
  // suite may be pointing at would break it.
  await prisma.featureBundle.deleteMany({ where: { id: { in: legacyBundleIds } } });
  await prisma.$disconnect();
});

describe("buildRepricePlan (PR-3.1, dry run)", () => {
  it("maps the retired code, keeps the tenant whole, and writes nothing", async () => {
    const before = {
      addons: await prisma.companySubscriptionAddon.count({ where: { companyId } }),
      flags: await prisma.companyFeatureFlag.count({ where: { companyId } }),
      auditEvents: await prisma.platformAuditEvent.count({ where: { companyId } }),
      subscription: await prisma.companySubscription.findUniqueOrThrow({
        where: { id: subscriptionId },
        select: { planId: true, updatedAt: true },
      }),
    };

    const plan = await buildRepricePlan(companyId);
    expect(plan).not.toBeNull();
    if (!plan) return;

    expect(plan.currentPlanCode).toBe("MEDIUM");
    expect(plan.proposedTierCode).toBe("SCALE");
    expect(plan.proposedMonthlyPrice).toBe(199);
    expect(plan.proposedPricing.base).toBe(199);

    // The invariant: nothing in the live catalogue is taken away.
    expect(plan.lostFeatures).toEqual([]);
    expect(plan.status).toBe("OK");
    expect(plan.requiresChange).toBe(true);

    // Bought back from the one bundle in the new catalogue that carries them.
    expect(plan.grantBundleCodes).toEqual(["ADDON_ZIMBABWE_PAYROLL"]);
    expect(plan.retainedAddonBundleCodes).toContain("ADDON_GOLD_CORE");
    expect(plan.droppedAddonBundleCodes).toEqual([`ADDON_LEGACY_ZW_PAYROLL_${SUITE_CODE}`]);
    for (const key of RESCUABLE_FEATURE_KEYS) {
      expect(plan.featureDiff.some((entry) => entry.key === key && !entry.after)).toBe(false);
    }

    const after = {
      addons: await prisma.companySubscriptionAddon.count({ where: { companyId } }),
      flags: await prisma.companyFeatureFlag.count({ where: { companyId } }),
      auditEvents: await prisma.platformAuditEvent.count({ where: { companyId } }),
      subscription: await prisma.companySubscription.findUniqueOrThrow({
        where: { id: subscriptionId },
        select: { planId: true, updatedAt: true },
      }),
    };
    expect(after).toEqual(before);
  });

  it("surfaces a feature no surviving bundle can carry, and refuses to apply it", async () => {
    const plan = await buildRepricePlan(lossCompanyId);
    expect(plan).not.toBeNull();
    if (!plan) return;

    expect(plan.status).toBe("LOSS");
    expect(plan.lostFeatures).toContain(ORPHAN_FEATURE_KEY);
    expect(
      plan.featureDiff.some((entry) => entry.key === ORPHAN_FEATURE_KEY && entry.before && !entry.after),
    ).toBe(true);

    await expect(applyRepricePlan(plan)).rejects.toThrow(/LOSS/);

    // The refusal is a refusal: no audit row, and the tier is untouched.
    expect(await prisma.platformAuditEvent.count({ where: { companyId: lossCompanyId } })).toBe(0);
    const subscription = await prisma.companySubscription.findFirstOrThrow({
      where: { companyId: lossCompanyId },
      select: { plan: { select: { code: true } } },
    });
    expect(subscription.plan.code).toBe("MEDIUM");
  });
});

describe("applyRepricePlan (PR-3.2)", () => {
  it("moves the tenant onto the mapped tier with its feature set intact", async () => {
    const plan = await buildRepricePlan(companyId);
    expect(plan).not.toBeNull();
    if (!plan) return;

    const result = await applyRepricePlan(plan, { actorId: `test-actor-${suite}` });
    expect(result.toTierCode).toBe("SCALE");
    expect(result.grantedBundleCodes).toEqual(["ADDON_ZIMBABWE_PAYROLL"]);

    const subscription = await prisma.companySubscription.findUniqueOrThrow({
      where: { id: subscriptionId },
      select: { plan: { select: { code: true, monthlyPrice: true } } },
    });
    expect(subscription.plan.code).toBe("SCALE");
    expect(subscription.plan.monthlyPrice).toBe(199);

    const addonCodes = (
      await prisma.companySubscriptionAddon.findMany({
        where: { companyId, isEnabled: true },
        select: { bundle: { select: { code: true } } },
      })
    ).map((addon) => addon.bundle.code);
    expect(addonCodes).toContain("ADDON_ZIMBABWE_PAYROLL");
    expect(addonCodes).toContain("ADDON_GOLD_CORE");

    // Zero lost features, asserted against the live gate rather than the plan.
    const afterMap = await getCompanyFeatureMap(companyId);
    const lost = enabledBeforeApply.filter((key) => !afterMap[key]);
    expect(lost).toEqual([]);
    for (const key of RESCUABLE_FEATURE_KEYS) expect(afterMap[key]).toBe(true);
  });

  it("writes one hash-chained audit event describing the move", async () => {
    const events = await prisma.platformAuditEvent.findMany({
      where: { companyId, eventType: REPRICE_AUDIT_EVENT_TYPE },
    });
    expect(events).toHaveLength(1);

    const event = events[0];
    expect(event.actor).toBe(`test-actor-${suite}`);
    expect(event.entityType).toBe("CompanySubscription");
    expect(event.entityId).toBe(subscriptionId);
    expect(event.eventHash).toMatch(/^[0-9a-f]{64}$/);

    const payload = JSON.parse(event.payloadJson ?? "{}");
    expect(payload.fromPlanCode).toBe("MEDIUM");
    expect(payload.toTierCode).toBe("SCALE");
    expect(payload.grantedBundleCodes).toEqual(["ADDON_ZIMBABWE_PAYROLL"]);
    expect(payload.monthlyAfter).toBe(plannedMonthlyAfter(payload));
  });

  it("is idempotent: a second plan for the same tenant asks for nothing", async () => {
    const plan = await buildRepricePlan(companyId);
    expect(plan).not.toBeNull();
    if (!plan) return;

    expect(plan.currentPlanCode).toBe("SCALE");
    expect(plan.proposedTierCode).toBe("SCALE");
    expect(plan.grantBundleCodes).toEqual([]);
    expect(plan.lostFeatures).toEqual([]);
    expect(plan.requiresChange).toBe(false);
  });
});

/** The audit payload must agree with itself: the delta is the difference. */
function plannedMonthlyAfter(payload: Record<string, number>): number {
  return Math.round((payload.monthlyBefore + payload.monthlyDelta) * 100) / 100;
}
