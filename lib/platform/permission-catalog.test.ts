import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetCompanyFeatureMap,
  mockUserFeatureFlagFindMany,
  mockUserFeatureFlagDeleteMany,
  mockUserFeatureFlagUpsert,
  mockPlatformFeatureUpsert,
  mockOverrideFindMany,
  mockOverrideDeleteMany,
  mockOverrideUpsert,
  mockMembershipFindFirst,
} = vi.hoisted(() => ({
  mockGetCompanyFeatureMap: vi.fn(),
  mockUserFeatureFlagFindMany: vi.fn(),
  mockUserFeatureFlagDeleteMany: vi.fn(),
  mockUserFeatureFlagUpsert: vi.fn(),
  mockPlatformFeatureUpsert: vi.fn(),
  mockOverrideFindMany: vi.fn(),
  mockOverrideDeleteMany: vi.fn(),
  mockOverrideUpsert: vi.fn(),
  mockMembershipFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userFeatureFlag: {
      findMany: mockUserFeatureFlagFindMany,
      deleteMany: mockUserFeatureFlagDeleteMany,
      upsert: mockUserFeatureFlagUpsert,
    },
    platformFeature: { upsert: mockPlatformFeatureUpsert },
    userPermissionOverride: {
      findMany: mockOverrideFindMany,
      deleteMany: mockOverrideDeleteMany,
      upsert: mockOverrideUpsert,
    },
    workspaceMembership: { findFirst: mockMembershipFindFirst },
  },
}));

vi.mock("@/lib/platform/entitlements", () => ({
  getCompanyFeatureMap: mockGetCompanyFeatureMap,
}));

import {
  countOverrides,
  getUserPermissionCatalog,
  permissionStateFor,
  setUserPermission,
} from "./permission-catalog";

const COMPANY_ID = "company-1";
const USER_ID = "user-1";
const MEMBERSHIP_ID = "membership-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCompanyFeatureMap.mockResolvedValue({ "crm.core": true });
  mockUserFeatureFlagFindMany.mockResolvedValue([]);
  mockOverrideFindMany.mockResolvedValue([]);
  mockMembershipFindFirst.mockResolvedValue({ id: MEMBERSHIP_ID });
  mockPlatformFeatureUpsert.mockResolvedValue({ id: "feature-1" });
});

describe("permissionStateFor", () => {
  it("reads an absent override as the role default, not as a decision", () => {
    expect(permissionStateFor(true, undefined)).toBe("DEFAULT");
    expect(permissionStateFor(false, undefined)).toBe("DEFAULT");
  });

  it("keeps an override that agrees with the role distinct from no override", () => {
    expect(permissionStateFor(true, true)).toBe("ALLOW");
    expect(permissionStateFor(false, false)).toBe("DENY");
  });
});

describe("getUserPermissionCatalog", () => {
  it("puts capabilities and feature access in one list", async () => {
    const groups = await getUserPermissionCatalog({
      companyId: COMPANY_ID,
      userId: USER_ID,
      role: "SALES_REP",
    });

    const kinds = new Set(groups.flatMap((group) => group.entries.map((e) => e.kind)));
    expect(kinds.has("CAPABILITY")).toBe(true);
    expect(kinds.has("FEATURE")).toBe(true);
  });

  it("shows a rep's role defaults without any override rows", async () => {
    const groups = await getUserPermissionCatalog({
      companyId: COMPANY_ID,
      userId: USER_ID,
      role: "SALES_REP",
    });
    const entries = groups.flatMap((group) => group.entries);

    const merge = entries.find((entry) => entry.key === "records.merge");
    const read = entries.find((entry) => entry.key === "records.read");

    expect(merge?.state).toBe("DEFAULT");
    expect(merge?.effective).toBe(false);
    expect(read?.effective).toBe(true);
    expect(countOverrides(groups)).toBe(0);
  });

  it("lets an override outrank the role in both directions", async () => {
    mockOverrideFindMany.mockResolvedValue([
      { permissionKey: "records.merge", isAllowed: true },
      { permissionKey: "records.export", isAllowed: false },
    ]);

    const groups = await getUserPermissionCatalog({
      companyId: COMPANY_ID,
      userId: USER_ID,
      role: "SALES_REP",
    });
    const entries = groups.flatMap((group) => group.entries);

    expect(entries.find((entry) => entry.key === "records.merge")).toMatchObject({
      state: "ALLOW",
      effective: true,
      roleDefault: false,
    });
    expect(entries.find((entry) => entry.key === "records.export")).toMatchObject({
      state: "DENY",
      effective: false,
      roleDefault: true,
    });
    expect(countOverrides(groups)).toBe(2);
  });

  it("groups CRM capabilities ahead of feature access", async () => {
    const groups = await getUserPermissionCatalog({
      companyId: COMPANY_ID,
      userId: USER_ID,
      role: "MANAGER",
    });

    const firstFeatureGroup = groups.findIndex((group) =>
      group.entries.some((entry) => entry.kind === "FEATURE"),
    );
    const lastCapabilityGroup = groups.reduce(
      (last, group, index) =>
        group.entries.some((entry) => entry.kind === "CAPABILITY") ? index : last,
      -1,
    );

    expect(lastCapabilityGroup).toBeLessThan(firstFeatureGroup);
  });
});

describe("setUserPermission", () => {
  it("deletes the row when a capability goes back to role default", async () => {
    await setUserPermission({
      companyId: COMPANY_ID,
      userId: USER_ID,
      role: "SALES_REP",
      kind: "CAPABILITY",
      key: "records.merge",
      state: "DEFAULT",
      actorId: "admin-1",
    });

    expect(mockOverrideDeleteMany).toHaveBeenCalledWith({
      where: { permissionKey: "records.merge", membership: { companyId: COMPANY_ID, userId: USER_ID } },
    });
    expect(mockOverrideUpsert).not.toHaveBeenCalled();
  });

  it("stores a denial even where the role already denies", async () => {
    await setUserPermission({
      companyId: COMPANY_ID,
      userId: USER_ID,
      role: "SALES_REP",
      kind: "CAPABILITY",
      key: "records.delete",
      state: "DENY",
      actorId: "admin-1",
    });

    expect(mockOverrideUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { membershipId_permissionKey: { membershipId: MEMBERSHIP_ID, permissionKey: "records.delete" } },
        create: expect.objectContaining({ isAllowed: false, permissionKey: "records.delete", membershipId: MEMBERSHIP_ID }),
      }),
    );
  });

  it("will not store a decision for someone who is not in the workspace", async () => {
    mockMembershipFindFirst.mockResolvedValue(null);
    await expect(
      setUserPermission({ companyId: COMPANY_ID, userId: USER_ID, role: "SALES_REP", kind: "CAPABILITY", key: "records.delete", state: "DENY", actorId: "admin-1" }),
    ).rejects.toThrow("NOT_A_MEMBER");
    expect(mockOverrideUpsert).not.toHaveBeenCalled();
  });

  it("refuses a key that is not a capability", async () => {
    await expect(
      setUserPermission({
        companyId: COMPANY_ID,
        userId: USER_ID,
        role: "SALES_REP",
        kind: "CAPABILITY",
        key: "records.invent",
        state: "ALLOW",
        actorId: "admin-1",
      }),
    ).rejects.toThrow("UNKNOWN_PERMISSION_KEY");
  });
});
