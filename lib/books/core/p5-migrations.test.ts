/**
 * Migration witness for `20261020110000_books_screens_addon` (books-final §1,
 * §7 D1): the books engine is on in every workspace, and the Books screens
 * are an add-on every workspace that had accounting on 20 Oct kept.
 *
 * No table or column is added, so there are no reader grants to witness.
 */
import { describe, expect, it } from "vitest";

import { getCompanyFeatureMap } from "@/lib/platform/entitlements";
import { prisma } from "@/lib/prisma";

const MIGRATION = "20261020110000_books_screens_addon";

describe("the Books screens add-on, as stored (D1)", () => {
  it("keeps the engine on by default and the screens off until granted", async () => {
    const rows = await prisma.platformFeature.findMany({
      where: { key: { in: ["accounting.core", "books.screens"] } },
      select: { key: true, defaultEnabled: true, isActive: true },
      orderBy: { key: "asc" },
    });
    expect(rows).toEqual([
      { key: "accounting.core", defaultEnabled: true, isActive: true },
      { key: "books.screens", defaultEnabled: false, isActive: true },
    ]);
  });

  it("sells the screens as one add-on holding the one key", async () => {
    const bundle = await prisma.featureBundle.findUniqueOrThrow({
      where: { code: "ADDON_BOOKS_SCREENS" },
      select: { isActive: true, items: { select: { feature: { select: { key: true } } } } },
    });
    expect(bundle.isActive).toBe(true);
    expect(bundle.items.map((item) => item.feature.key)).toEqual(["books.screens"]);
  });

  it("granted the screens to every workspace that had accounting when it ran", async () => {
    const [ran] = await prisma.$queryRaw<Array<{ at: Date }>>`SELECT finished_at AS at FROM "_prisma_migrations" WHERE migration_name = ${MIGRATION}`;
    expect(ran?.at).toBeInstanceOf(Date);
    // A workspace with the engine's add-on (or an explicit "on") before the
    // migration ran, and no explicit "off", holds the screens' add-on.
    const missed = await prisma.$queryRaw<Array<{ slug: string }>>`
      SELECT c."slug" FROM "Company" c
      WHERE c."createdAt" <= ${ran!.at}
        AND (
          EXISTS (SELECT 1 FROM "CompanySubscriptionAddon" a JOIN "FeatureBundle" b ON b."id" = a."bundleId"
                  WHERE a."companyId" = c."id" AND a."isEnabled" AND b."code" = 'ADDON_ACCOUNTING_CORE' AND a."createdAt" <= ${ran!.at})
          OR EXISTS (SELECT 1 FROM "CompanyFeatureFlag" f JOIN "PlatformFeature" p ON p."id" = f."featureId"
                     WHERE f."companyId" = c."id" AND f."isEnabled" AND p."key" = 'accounting.core' AND f."createdAt" <= ${ran!.at}))
        AND NOT EXISTS (SELECT 1 FROM "CompanyFeatureFlag" f JOIN "PlatformFeature" p ON p."id" = f."featureId"
                        WHERE f."companyId" = c."id" AND NOT f."isEnabled" AND p."key" = 'accounting.core')
        AND NOT EXISTS (SELECT 1 FROM "CompanySubscriptionAddon" a JOIN "FeatureBundle" b ON b."id" = a."bundleId"
                        WHERE a."companyId" = c."id" AND b."code" = 'ADDON_BOOKS_SCREENS')`;
    expect(missed).toEqual([]);
  });

  it("leaves a workspace that had accounting switched off without the screens its tier now carries", async () => {
    const [unmatched] = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM "CompanyFeatureFlag" f JOIN "PlatformFeature" p ON p."id" = f."featureId"
      WHERE p."key" = 'accounting.core' AND NOT f."isEnabled"
        AND NOT EXISTS (SELECT 1 FROM "CompanyFeatureFlag" s JOIN "PlatformFeature" q ON q."id" = s."featureId"
                        WHERE s."companyId" = f."companyId" AND q."key" = 'books.screens')`;
    expect(Number(unmatched!.n)).toBe(0);
  });

  it("reads Floorcode as having both the engine and the screens", async () => {
    const floorcode = await prisma.company.findFirst({ where: { slug: "floorcode" }, select: { id: true } });
    if (!floorcode) return;
    const map = await getCompanyFeatureMap(floorcode.id);
    expect(map["accounting.core"]).toBe(true);
    // Unless someone has switched the screens off by hand since.
    const off = await prisma.companyFeatureFlag.findFirst({ where: { companyId: floorcode.id, isEnabled: false, feature: { key: "books.screens" } } });
    expect(map["books.screens"]).toBe(!off);
  });
});
