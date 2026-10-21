/**
 * The $99 Books tier, `books.advanced` (NOTES §5.3), against a real database:
 * the resolver grants it to a workspace with the screens that is on the larger
 * vertical rate, and the migration `20261021110000_books_advanced_tier` left
 * the catalogue rows and a flag for every workspace already over five members.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getCompanyFeatureMap, syncEntitlementCatalog } from "@/lib/platform/entitlements";
import { prisma } from "@/lib/prisma";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const stamp = Date.now();
const made: string[] = [];

async function workspace(label: string, members: number, screens: "flag" | "none", advancedFlag?: boolean) {
  const company = await prisma.company.create({ data: { name: `Advanced ${label} ${stamp}`, slug: `advanced-${label}-${stamp}` } });
  made.push(company.id);
  for (let i = 0; i < members; i++) {
    await prisma.user.create({ data: { companyId: company.id, name: `Member ${i}`, email: `m${i}-${label}-${stamp}@advanced.test`, role: "MANAGER" } });
  }
  const flag = async (key: string, isEnabled: boolean) => {
    const feature = await prisma.platformFeature.findUniqueOrThrow({ where: { key }, select: { id: true } });
    await prisma.companyFeatureFlag.create({ data: { companyId: company.id, featureId: feature.id, isEnabled } });
  };
  if (screens === "flag") await flag("books.screens", true);
  if (advancedFlag !== undefined) await flag("books.advanced", advancedFlag);
  return company.id;
}

beforeAll(async () => {
  await syncEntitlementCatalog();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { companyId: { in: made } } });
  await prisma.company.deleteMany({ where: { id: { in: made } } });
});

describe("books.advanced, the $99 tier", () => {
  it("is in the catalogue, off by default, with its add-on", async () => {
    const feature = await prisma.platformFeature.findUniqueOrThrow({ where: { key: "books.advanced" }, select: { defaultEnabled: true, isActive: true } });
    expect(feature).toEqual({ defaultEnabled: false, isActive: true });
    const bundle = await prisma.featureBundle.findUniqueOrThrow({ where: { code: "ADDON_BOOKS_ADVANCED" }, select: { items: { select: { feature: { select: { key: true } } } } } });
    expect(bundle.items.map((item) => item.feature.key)).toEqual(["books.advanced"]);
  });

  it("goes to a workspace with the screens and more than five billed members", async () => {
    const map = await getCompanyFeatureMap(await workspace("six", 6, "flag"));
    expect(map["books.screens"]).toBe(true);
    expect(map["books.advanced"]).toBe(true);
  });

  it("stays off at five members, or without the screens", async () => {
    expect((await getCompanyFeatureMap(await workspace("five", 5, "flag")))["books.advanced"]).toBe(false);
    expect((await getCompanyFeatureMap(await workspace("noscreens", 6, "none")))["books.advanced"]).toBe(false);
  });

  it("obeys a flag set by hand either way", async () => {
    expect((await getCompanyFeatureMap(await workspace("granted", 2, "flag", true)))["books.advanced"]).toBe(true);
    expect((await getCompanyFeatureMap(await workspace("withheld", 6, "flag", false)))["books.advanced"]).toBe(false);
  });

  it("is not missing from any workspace the migration saw over five members with the screens", async () => {
    const missed = await prisma.$queryRaw<Array<{ slug: string }>>`
      SELECT c."slug" FROM "Company" c
      WHERE c."slug" NOT LIKE 'advanced-%'
        AND EXISTS (SELECT 1 FROM "CompanyFeatureFlag" f JOIN "PlatformFeature" p ON p."id" = f."featureId" WHERE f."companyId" = c."id" AND f."isEnabled" AND p."key" = 'books.screens')
        AND (SELECT count(*) FROM "User" u WHERE u."companyId" = c."id" AND u."isActive" AND u."role" NOT IN ('PARENT', 'STUDENT')) > 5
        AND NOT EXISTS (SELECT 1 FROM "CompanyFeatureFlag" f JOIN "PlatformFeature" p ON p."id" = f."featureId" WHERE f."companyId" = c."id" AND p."key" = 'books.advanced')
        AND c."createdAt" < '2026-10-21'`;
    expect(missed).toEqual([]);
  });
});
