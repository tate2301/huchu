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

    // The victim has to belong to a bundle the CODE still defines. Sync is an
    // upsert from the code catalog, so a row whose bundle has been retired —
    // ADDON_CCTV_SUITE and friends, dropped in ST-1.1 — is one sync can never
    // restore, and picking one at random turned this into a coin toss the day
    // the first bundle was removed. Those orphans are a real gap and ST-3.4
    // owns pruning them; what this test is about is whether sync writes.
    const liveBundle = await prisma.featureBundle.findFirst({
      where: { code: { in: FEATURE_BUNDLES.map((bundle) => bundle.code) } },
      select: { id: true },
    });
    expect(liveBundle, "no code-defined bundle exists — sync never wrote").not.toBeNull();

    const victim = await prisma.featureBundleItem.findFirst({
      where: { bundleId: liveBundle!.id },
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
