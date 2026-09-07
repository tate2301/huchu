import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetCompanyFeatureMap,
  mockUserFeatureFlagFindMany,
  mockUserFeatureFlagDeleteMany,
  mockUserFeatureFlagUpsert,
  mockPlatformFeatureUpsert,
} = vi.hoisted(() => ({
  mockGetCompanyFeatureMap: vi.fn(),
  mockUserFeatureFlagFindMany: vi.fn(),
  mockUserFeatureFlagDeleteMany: vi.fn(),
  mockUserFeatureFlagUpsert: vi.fn(),
  mockPlatformFeatureUpsert: vi.fn(),
}));

vi.mock("@corelithzw/db/client", () => ({
  prisma: {
    userFeatureFlag: {
      findMany: mockUserFeatureFlagFindMany,
      deleteMany: mockUserFeatureFlagDeleteMany,
      upsert: mockUserFeatureFlagUpsert,
    },
    platformFeature: {
      upsert: mockPlatformFeatureUpsert,
    },
  },
}));

vi.mock("./entitlements", () => ({
  getCompanyFeatureMap: mockGetCompanyFeatureMap,
}));

import {
  getEffectiveFeaturesForUser,
  getManagedUserFeatureAccessEntries,
  setManagedUserFeatureOverride,
} from "./user-entitlements";

const COMPANY_ID = "company-1";
const USER_ID = "user-1";

// gold.home is outside the OPERATOR prefix allowlist; stores.inventory is inside it.
const GOLD_KEY = "gold.home";
const STORES_KEY = "stores.inventory";

function setupCompanyMap(map: Record<string, boolean>) {
  mockGetCompanyFeatureMap.mockResolvedValue(map);
}

function setupOverrides(rows: Array<{ key: string; isEnabled: boolean }>) {
  mockUserFeatureFlagFindMany.mockResolvedValue(
    rows.map((row) => ({ isEnabled: row.isEnabled, feature: { key: row.key } })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPlatformFeatureUpsert.mockResolvedValue({ id: "feature-1" });
  mockUserFeatureFlagDeleteMany.mockResolvedValue({ count: 0 });
  mockUserFeatureFlagUpsert.mockResolvedValue({ id: "flag-1" });
});

describe("getEffectiveFeaturesForUser", () => {
  it("excludes features blocked by the role template when there is no override", async () => {
    setupCompanyMap({ [GOLD_KEY]: true, [STORES_KEY]: true });
    setupOverrides([]);

    const features = await getEffectiveFeaturesForUser({
      companyId: COMPANY_ID,
      userId: USER_ID,
      role: "OPERATOR",
    });

    expect(features).toContain(STORES_KEY);
    expect(features).not.toContain(GOLD_KEY);
  });

  it("grants a template-blocked feature when an enable override exists", async () => {
    setupCompanyMap({ [GOLD_KEY]: true, [STORES_KEY]: true });
    setupOverrides([{ key: GOLD_KEY, isEnabled: true }]);

    const features = await getEffectiveFeaturesForUser({
      companyId: COMPANY_ID,
      userId: USER_ID,
      role: "OPERATOR",
    });

    expect(features).toContain(GOLD_KEY);
  });

  it("revokes a template-allowed feature when a disable override exists", async () => {
    setupCompanyMap({ [STORES_KEY]: true });
    setupOverrides([{ key: STORES_KEY, isEnabled: false }]);

    const features = await getEffectiveFeaturesForUser({
      companyId: COMPANY_ID,
      userId: USER_ID,
      role: "OPERATOR",
    });

    expect(features).not.toContain(STORES_KEY);
  });

  it("never grants a company-disabled feature, even with an enable override", async () => {
    setupCompanyMap({ [GOLD_KEY]: false });
    setupOverrides([{ key: GOLD_KEY, isEnabled: true }]);

    const features = await getEffectiveFeaturesForUser({
      companyId: COMPANY_ID,
      userId: USER_ID,
      role: "OPERATOR",
    });

    expect(features).not.toContain(GOLD_KEY);
  });

  it("applies disable overrides to roles outside the managed role list", async () => {
    setupCompanyMap({ [STORES_KEY]: true });
    setupOverrides([{ key: STORES_KEY, isEnabled: false }]);

    const features = await getEffectiveFeaturesForUser({
      companyId: COMPANY_ID,
      userId: USER_ID,
      role: "LEGACY_ROLE",
    });

    expect(features).not.toContain(STORES_KEY);
  });
});

describe("getManagedUserFeatureAccessEntries", () => {
  it("only returns company-enabled features", async () => {
    setupCompanyMap({ [GOLD_KEY]: true, [STORES_KEY]: false });
    setupOverrides([]);

    const entries = await getManagedUserFeatureAccessEntries({
      companyId: COMPANY_ID,
      userId: USER_ID,
      role: "OPERATOR",
    });

    const keys = entries.map((entry) => entry.featureKey);
    expect(keys).toContain(GOLD_KEY);
    expect(keys).not.toContain(STORES_KEY);
  });

  it("reports role default, effective state, and override presence", async () => {
    setupCompanyMap({ [GOLD_KEY]: true, [STORES_KEY]: true });
    setupOverrides([{ key: GOLD_KEY, isEnabled: true }]);

    const entries = await getManagedUserFeatureAccessEntries({
      companyId: COMPANY_ID,
      userId: USER_ID,
      role: "OPERATOR",
    });

    const gold = entries.find((entry) => entry.featureKey === GOLD_KEY);
    expect(gold).toMatchObject({
      roleDefault: false,
      isEnabled: true,
      hasOverride: true,
    });

    const stores = entries.find((entry) => entry.featureKey === STORES_KEY);
    expect(stores).toMatchObject({
      roleDefault: true,
      isEnabled: true,
      hasOverride: false,
    });
  });
});

describe("setManagedUserFeatureOverride", () => {
  it("throws when the feature is not enabled for the company", async () => {
    setupCompanyMap({ [GOLD_KEY]: false });

    await expect(
      setManagedUserFeatureOverride({
        companyId: COMPANY_ID,
        userId: USER_ID,
        role: "OPERATOR",
        featureKey: GOLD_KEY,
        isEnabled: true,
      }),
    ).rejects.toThrow("FEATURE_NOT_ENABLED_FOR_COMPANY");
  });

  it("stores an enable override for a template-blocked feature", async () => {
    setupCompanyMap({ [GOLD_KEY]: true });

    await setManagedUserFeatureOverride({
      companyId: COMPANY_ID,
      userId: USER_ID,
      role: "OPERATOR",
      featureKey: GOLD_KEY,
      isEnabled: true,
    });

    expect(mockUserFeatureFlagUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { isEnabled: true },
        create: expect.objectContaining({ isEnabled: true }),
      }),
    );
    expect(mockUserFeatureFlagDeleteMany).not.toHaveBeenCalled();
  });

  it("stores a disable override for a template-allowed feature", async () => {
    setupCompanyMap({ [STORES_KEY]: true });

    await setManagedUserFeatureOverride({
      companyId: COMPANY_ID,
      userId: USER_ID,
      role: "OPERATOR",
      featureKey: STORES_KEY,
      isEnabled: false,
    });

    expect(mockUserFeatureFlagUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { isEnabled: false },
      }),
    );
  });

  it("removes the override when the requested state matches the role default", async () => {
    setupCompanyMap({ [STORES_KEY]: true });

    await setManagedUserFeatureOverride({
      companyId: COMPANY_ID,
      userId: USER_ID,
      role: "OPERATOR",
      featureKey: STORES_KEY,
      isEnabled: true,
    });

    expect(mockUserFeatureFlagDeleteMany).toHaveBeenCalled();
    expect(mockUserFeatureFlagUpsert).not.toHaveBeenCalled();
  });
});
