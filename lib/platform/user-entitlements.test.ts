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

vi.mock("@/lib/prisma", () => ({
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

vi.mock("@/lib/platform/entitlements", () => ({
  getCompanyFeatureMap: mockGetCompanyFeatureMap,
}));

import { resolveAccessContext } from "@/lib/auth-core/access";
import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { FEATURE_CATALOG } from "@/lib/platform/feature-catalog";

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

  it("opens the bookkeeper's stock, customer and fiscal reads only where the company runs retail", async () => {
    const reads = ["stores.inventory", "stores.movements", "crm.customers", "accounting.zimra.fiscalisation"];
    setupOverrides([]);

    setupCompanyMap({ "retail.core": true, ...Object.fromEntries(reads.map((key) => [key, true])) });
    const inShop = await getEffectiveFeaturesForUser({ companyId: COMPANY_ID, userId: USER_ID, role: "FINANCE_OFFICER" });
    expect(inShop).toEqual(expect.arrayContaining(["retail.core", ...reads]));

    setupCompanyMap({ "gold.home": true, ...Object.fromEntries(reads.map((key) => [key, true])) });
    const inMine = await getEffectiveFeaturesForUser({ companyId: COMPANY_ID, userId: USER_ID, role: "FINANCE_OFFICER" });
    for (const key of reads) expect(inMine).not.toContain(key);
  });
});

describe("the books in a shop (Roles board: Posting to the books, manager none)", () => {
  const ACCOUNTING = FEATURE_CATALOG.map((feature) => feature.key).filter((key) => key.startsWith("accounting."));
  const KEPT = ["accounting.core", "accounting.tax", "accounting.zimra.fiscalisation"];
  const SHOP = { "retail.core": true, ...Object.fromEntries(ACCOUNTING.map((key) => [key, true])) };

  function session(role: string, enabledFeatures: string[]): AuthenticatedSession {
    return {
      expires: new Date(Date.now() + 60_000).toISOString(),
      user: {
        id: USER_ID,
        email: "someone@shop.test",
        role,
        companyId: COMPANY_ID,
        tenantStatus: "ACTIVE",
        enabledFeatures,
        authExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    } as AuthenticatedSession;
  }

  async function door(role: string, method: string, pathname: string) {
    const enabledFeatures = await getEffectiveFeaturesForUser({ companyId: COMPANY_ID, userId: USER_ID, role });
    return resolveAccessContext({
      session: session(role, enabledFeatures),
      pathname,
      method,
      enforceRouteFeatureCheck: true,
      enforceTenantHost: false,
    });
  }

  const LEDGER_WRITES: Array<[string, string]> = [
    ["POST", "/api/accounting/posting-rules"],
    ["PATCH", "/api/accounting/posting-rules/a52951e7-0000-4000-8000-000000000000"],
    ["DELETE", "/api/accounting/posting-rules/a52951e7-0000-4000-8000-000000000000"],
    ["POST", "/api/accounting/posting-rules/preview"],
    ["POST", "/api/accounting/periods"],
    ["PATCH", "/api/accounting/periods/a52951e7-0000-4000-8000-000000000000"],
    ["POST", "/api/accounting/journals"],
    ["POST", "/api/accounting/coa"],
  ];

  beforeEach(() => {
    setupOverrides([]);
    setupCompanyMap(SHOP);
  });

  it("leaves a shop manager the fiscal device's features and none of the ledger's", async () => {
    const features = await getEffectiveFeaturesForUser({ companyId: COMPANY_ID, userId: USER_ID, role: "MANAGER" });
    expect(features.filter((key) => key.startsWith("accounting.")).sort()).toEqual([...KEPT].sort());
  });

  it("refuses a shop manager every posting-rules, periods, journals and chart write before the handler", async () => {
    for (const [method, pathname] of LEDGER_WRITES) {
      const result = await door("MANAGER", method, pathname);
      expect(result, `${method} ${pathname}`).toMatchObject({ ok: false, reason: "FEATURE_DISABLED", status: 403 });
    }
    for (const pathname of ["/accounting/posting-rules", "/accounting/periods", "/accounting/journals"]) {
      expect(await door("MANAGER", "GET", pathname), pathname).toMatchObject({ ok: false, status: 403 });
    }
  });

  it("still lets a shop manager read the fiscal device", async () => {
    expect((await door("MANAGER", "GET", "/api/accounting/fiscalisation/config")).ok).toBe(true);
    expect((await door("MANAGER", "GET", "/retail/manage/fiscal")).ok).toBe(true);
  });

  it("leaves the owner's books open in a shop", async () => {
    for (const [method, pathname] of LEDGER_WRITES) {
      expect((await door("SUPERADMIN", method, pathname)).ok, `${method} ${pathname}`).toBe(true);
    }
  });

  it("leaves the bookkeeper's template as it was: their accounting reads, the ledger's set-up shut", async () => {
    const features = await getEffectiveFeaturesForUser({ companyId: COMPANY_ID, userId: USER_ID, role: "FINANCE_OFFICER" });
    expect(features).toEqual(
      expect.arrayContaining(["accounting.core", "accounting.ar", "accounting.banking", "accounting.tax", "accounting.zimra.fiscalisation"]),
    );
    expect((await door("FINANCE_OFFICER", "GET", "/api/accounting/setup/readiness")).ok).toBe(true);
    expect((await door("FINANCE_OFFICER", "POST", "/api/accounting/setup/seed-pack")).ok).toBe(true);
  });

  it("keeps the whole accounting module for a manager outside retail", async () => {
    const { "retail.core": _retail, ...mine } = SHOP;
    void _retail;
    setupCompanyMap(mine);
    const features = await getEffectiveFeaturesForUser({ companyId: COMPANY_ID, userId: USER_ID, role: "MANAGER" });
    expect(features).toEqual(expect.arrayContaining(ACCOUNTING));
    expect((await door("MANAGER", "POST", "/api/accounting/posting-rules")).ok).toBe(true);
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
