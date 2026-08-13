/**
 * The catalogue sync and bundle grant, against a real database.
 *
 * These exist because of a specific failure that no unit test could have seen:
 * `syncEntitlementCatalog` returned `FEATURE_CATALOG.length` and friends while
 * writing nothing at all. Every caller — the platform TUI, tenant provisioning
 * — reported "135 features, 24 bundles" over empty tables and carried on. The
 * consequence surfaced a long way from the cause: `CompanySubscriptionAddon`
 * needs a `FeatureBundle` row to point at, so with none written a tenant could
 * not be granted a paid bundle, and `getCompanyFeatureMap` keeps every billable
 * feature off unless the tenant is entitled to it. A freshly provisioned school
 * answered `403 FEATURE_DISABLED` on its own pages.
 *
 * So the assertions here are deliberately about rows, not return values. A sync
 * that reports numbers it did not write passes any test that trusts its
 * result.
 *
 * Prerequisites: a real Postgres DATABASE_URL with migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { FEATURE_BUNDLES, FEATURE_CATALOG, getBundleDefinition } from "@/lib/platform/feature-catalog";
import {
  getCompanyFeatureMap,
  getEnabledFeatureKeys,
  grantBundleToCompany,
  syncEntitlementCatalog,
} from "./entitlements";

const SCHOOLS_BUNDLE = "ADDON_SCHOOLS_SUITE";

let companyId: string;

beforeAll(async () => {
  await prisma.$connect();
  const stamp = Date.now();
  const company = await prisma.company.create({
    data: { name: `Entitlement Test ${stamp}`, slug: `entitlement-test-${stamp}` },
  });
  companyId = company.id;
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.$disconnect();
});

describe("syncEntitlementCatalog", () => {
  it("writes every catalogue feature and bundle as a row", async () => {
    await syncEntitlementCatalog();

    const featureKeys = new Set(
      (await prisma.platformFeature.findMany({ select: { key: true } })).map((row) => row.key),
    );
    const missingFeatures = FEATURE_CATALOG.map((feature) => feature.key).filter(
      (key) => !featureKeys.has(key),
    );
    expect(missingFeatures, "catalogue features with no PlatformFeature row").toEqual([]);

    const bundleCodes = new Set(
      (await prisma.featureBundle.findMany({ select: { code: true } })).map((row) => row.code),
    );
    const missingBundles = FEATURE_BUNDLES.map((bundle) => bundle.code).filter(
      (code) => !bundleCodes.has(code),
    );
    expect(missingBundles, "catalogue bundles with no FeatureBundle row").toEqual([]);
  });

  it("links each bundle to its features", async () => {
    await syncEntitlementCatalog();

    const definition = getBundleDefinition(SCHOOLS_BUNDLE)!;
    const bundle = await prisma.featureBundle.findUnique({
      where: { code: SCHOOLS_BUNDLE },
      select: { items: { select: { feature: { select: { key: true } } } } },
    });

    const linked = new Set(bundle?.items.map((item) => item.feature.key) ?? []);
    for (const key of definition.features) {
      expect(linked.has(key), `${SCHOOLS_BUNDLE} is missing ${key}`).toBe(true);
    }
  });

  it("restores a row that has gone missing", async () => {
    // The tests above pass against a no-op sync on a database that is already
    // populated — which is exactly the situation the original bug hid in. This
    // one removes a row first, so only a sync that actually writes can pass it.
    // A bundle item is the safe thing to delete: nothing cascades from it,
    // unlike a feature (company flags) or a bundle (company addons).
    await syncEntitlementCatalog();

    const victim = await prisma.featureBundleItem.findFirst({
      select: { id: true, bundleId: true, featureId: true },
    });
    expect(victim, "no bundle items exist at all — sync never wrote").not.toBeNull();

    await prisma.featureBundleItem.delete({ where: { id: victim!.id } });
    await syncEntitlementCatalog();

    const restored = await prisma.featureBundleItem.findUnique({
      where: {
        bundleId_featureId: { bundleId: victim!.bundleId, featureId: victim!.featureId },
      },
      select: { id: true },
    });
    expect(restored, "sync did not restore the deleted bundle item").not.toBeNull();
  });

  it("is idempotent and reports what is in place, not what it inserted", async () => {
    const first = await syncEntitlementCatalog();
    const second = await syncEntitlementCatalog();
    expect(second).toEqual(first);

    const duplicateFeatures: Array<{ key: string }> = await prisma.$queryRawUnsafe(
      `select "key" from "PlatformFeature" group by "key" having count(*) > 1`,
    );
    expect(duplicateFeatures).toEqual([]);
  });
});

describe("grantBundleToCompany", () => {
  it("refuses a bundle the catalogue does not define", async () => {
    await expect(
      grantBundleToCompany({ companyId, bundleCode: "ADDON_NOT_A_REAL_BUNDLE" }),
    ).rejects.toThrow(/Unknown feature bundle/);
  });

  it("turns a billable module on, which a feature flag alone cannot do", async () => {
    // The distinction this test exists for: entitlement and enablement are
    // separate records, and a flag without the addon is silently overridden
    // because `schools.*` is billable.
    const schoolsFeature = await prisma.platformFeature.findUnique({
      where: { key: "schools.students" },
      select: { id: true, isBillable: true },
    });
    expect(schoolsFeature?.isBillable, "schools.students must be billable for this test to mean anything").toBe(true);

    await prisma.companyFeatureFlag.create({
      data: { companyId, featureId: schoolsFeature!.id, isEnabled: true },
    });

    const withFlagOnly = await getCompanyFeatureMap(companyId);
    expect(
      withFlagOnly["schools.students"],
      "a flag on an unentitled billable feature must not enable it",
    ).toBe(false);

    await grantBundleToCompany({ companyId, bundleCode: SCHOOLS_BUNDLE, reason: "test" });

    const enabled = await getEnabledFeatureKeys(companyId);
    for (const key of getBundleDefinition(SCHOOLS_BUNDLE)!.features) {
      expect(enabled, `${key} should be on after the grant`).toContain(key);
    }
  });

  it("is idempotent", async () => {
    await grantBundleToCompany({ companyId, bundleCode: SCHOOLS_BUNDLE });
    const again = await grantBundleToCompany({ companyId, bundleCode: SCHOOLS_BUNDLE });

    expect(again.featuresEnabled).toBe(getBundleDefinition(SCHOOLS_BUNDLE)!.features.length);
    const addons = await prisma.companySubscriptionAddon.findMany({
      where: { companyId },
      select: { id: true },
    });
    expect(addons).toHaveLength(1);
  });
});

/**
 * Renamed namespaces fold onto their canonical key in `normalizeFeatureKey`:
 * `thrift.core` is `retail.core`, `hr.payouts` is `settlements.core`. A tenant
 * old enough to hold rows for both then had two flags landing on one map entry,
 * and the winner was whichever Prisma happened to return last.
 *
 * It was not theoretical. Switching four `thrift.*` keys off on a tenant that
 * also had `retail.*` rows took `retail.core`, `retail.pos`, `retail.catalog` and
 * `retail.purchasing` with them. Every retail flag still read `true` in the
 * database, the sidebar kept only the three retail keys with no thrift
 * counterpart, and it looked for all the world like a navigation bug.
 */
describe("a legacy flag and its canonical flag on the same tenant", () => {
  let legacyCompanyId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const company = await prisma.company.create({
      data: { name: `Alias Test ${stamp}`, slug: `alias-test-${stamp}` },
    });
    legacyCompanyId = company.id;
    await grantBundleToCompany({ companyId: legacyCompanyId, bundleCode: "ADDON_RETAIL_SUITE" });
  });

  afterAll(async () => {
    await prisma.company.delete({ where: { id: legacyCompanyId } }).catch(() => {});
  });

  it("lets the canonical row win, whichever order they are stored in", async () => {
    const retailCore = await prisma.platformFeature.findUnique({
      where: { key: "retail.core" },
      select: { id: true },
    });
    const thriftCore = await prisma.platformFeature.findUnique({
      where: { key: "thrift.core" },
      select: { id: true },
    });
    // If `thrift.core` ever stops being a catalogue row this test is moot, and
    // saying so beats passing vacuously.
    expect(retailCore, "retail.core must exist").not.toBeNull();
    if (!thriftCore) return;

    await prisma.companyFeatureFlag.deleteMany({ where: { companyId: legacyCompanyId } });
    // The legacy row is written first and says off; the canonical row says on.
    await prisma.companyFeatureFlag.create({
      data: { companyId: legacyCompanyId, featureId: thriftCore.id, isEnabled: false },
    });
    await prisma.companyFeatureFlag.create({
      data: { companyId: legacyCompanyId, featureId: retailCore!.id, isEnabled: true },
    });

    const map = await getCompanyFeatureMap(legacyCompanyId);
    expect(
      map["retail.core"],
      "an explicit retail.core row must not be overwritten by a thrift.core row",
    ).toBe(true);
  });

  it("still honours a legacy row when there is no canonical one", async () => {
    const thriftCore = await prisma.platformFeature.findUnique({
      where: { key: "thrift.core" },
      select: { id: true },
    });
    if (!thriftCore) return;

    await prisma.companyFeatureFlag.deleteMany({ where: { companyId: legacyCompanyId } });
    await prisma.companyFeatureFlag.create({
      data: { companyId: legacyCompanyId, featureId: thriftCore.id, isEnabled: true },
    });

    const map = await getCompanyFeatureMap(legacyCompanyId);
    expect(
      map["retail.core"],
      "a tenant holding only the legacy key must keep working",
    ).toBe(true);
  });
});
