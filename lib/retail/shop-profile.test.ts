import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { CATEGORY_SEEDS } from "./categories";
import {
  DEFAULT_SHOP_PROFILE,
  liquorSaleRefusal,
  loadShopProfile,
  saveShopProfile,
  shopClock,
  shopFeatures,
  type ShopProfilePatch,
} from "./shop-profile";

/** Every day 08:00 to 22:00 but Sunday, which sells none. */
const HOURS = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, alcoholFrom: 8 * 60, alcoholUntil: 22 * 60 }));
const SUNDAY_SHUT = [...HOURS, { weekday: 0, alcoholFrom: 0, alcoholUntil: 0 }];

/** A moment in Harare, which is UTC+2 all year. */
function harare(isoLocal: string) {
  return new Date(`${isoLocal}+02:00`);
}

describe("shop features", () => {
  it("are all off for general retail, whatever the switches say", () => {
    expect(shopFeatures({ ...DEFAULT_SHOP_PROFILE, businessType: "GENERAL" })).toEqual({
      ageCheck: false,
      licenceHours: false,
      emptiesAndDeposits: false,
      casesAndSingles: false,
    });
  });

  it("follow each switch for a liquor store", () => {
    expect(
      shopFeatures({ ...DEFAULT_SHOP_PROFILE, businessType: "LIQUOR", emptiesAndDeposits: false }),
    ).toEqual({ ageCheck: true, licenceHours: true, emptiesAndDeposits: false, casesAndSingles: true });
  });
});

describe("the shop's clock", () => {
  it("reads Harare's time, not the server's", () => {
    // 21:30 UTC on a Monday is 23:30 in Harare.
    expect(shopClock(new Date("2026-10-05T21:30:00Z"))).toEqual({ weekday: "Mon", minutes: 23 * 60 + 30 });
  });
});

describe("a liquor sale at the till", () => {
  const liquor = { ...DEFAULT_SHOP_PROFILE, businessType: "LIQUOR" as const };
  const monday8pm = harare("2026-10-05T20:00:00");
  const monday11pm = harare("2026-10-05T23:00:00");
  const sale = { profile: liquor, hours: HOURS, idChecked: true };

  it("goes through when nothing in the basket is age-restricted, at any hour", () => {
    expect(liquorSaleRefusal({ ...sale, ageRestricted: [], idChecked: false, at: monday11pm })).toBeNull();
  });

  it("asks for the ID check before alcohol, inside licence hours", () => {
    expect(
      liquorSaleRefusal({ ...sale, ageRestricted: ["Castle Lager 340ml"], idChecked: false, at: monday8pm }),
    ).toBe("Check the customer's ID before selling Castle Lager 340ml.");
    expect(liquorSaleRefusal({ ...sale, ageRestricted: ["Castle Lager 340ml"], at: monday8pm })).toBeNull();
  });

  it("refuses alcohol outside the site's hours, ID or not, and says when it sells again", () => {
    expect(liquorSaleRefusal({ ...sale, ageRestricted: ["Gin", "Beer"], at: monday11pm })).toBe(
      "Alcohol can't be sold now. The licence stopped it at 22:00. It sells again from 08:00.",
    );
  });

  it("says a day the licence sells none plainly", () => {
    const sundayNoon = harare("2026-10-04T12:00:00");
    expect(liquorSaleRefusal({ ...sale, hours: SUNDAY_SHUT, ageRestricted: ["Gin"], at: sundayNoon })).toBe(
      "Gin can't be sold today under the licence. It sells again from 08:00.",
    );
  });

  it("sells all day on a weekday the site keeps no hours for", () => {
    const sundayNoon = harare("2026-10-04T12:00:00");
    expect(liquorSaleRefusal({ ...sale, ageRestricted: ["Gin"], at: sundayNoon })).toBeNull();
    expect(liquorSaleRefusal({ ...sale, hours: [], ageRestricted: ["Gin"], at: monday11pm })).toBeNull();
  });

  it("follows each switch, and is off for general retail", () => {
    const noHours = { ...liquor, licenceHours: false };
    expect(liquorSaleRefusal({ ...sale, profile: noHours, ageRestricted: ["Gin"], at: monday11pm })).toBeNull();
    const noCheck = { ...liquor, ageCheck: false };
    expect(liquorSaleRefusal({ ...sale, profile: noCheck, ageRestricted: ["Gin"], idChecked: false, at: monday8pm })).toBeNull();
    const general = { ...liquor, businessType: "GENERAL" as const };
    expect(liquorSaleRefusal({ ...sale, profile: general, ageRestricted: ["Gin"], idChecked: false, at: monday11pm })).toBeNull();
  });
});

describe("saving the profile", () => {
  let companyId: string;
  let userId: string;

  const LIQUOR: Required<ShopProfilePatch> = {
    businessType: "LIQUOR",
    ageCheck: true,
    licenceHours: true,
    emptiesAndDeposits: false,
    casesAndSingles: true,
    licenceNumber: "HRE/BL/2024/0711",
    licenceExpiresOn: "2026-12-31",
    whatsapp: "+263 77 412 0098",
    vatRegistered: true,
    defaultSiteId: null,
  };

  beforeAll(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const company = await prisma.company.create({
      data: { name: `Shop profile ${stamp}`, slug: `shop-profile-${stamp}` },
      select: { id: true },
    });
    companyId = company.id;
    const user = await prisma.user.create({
      data: { email: `owner-${stamp}@shop.test`, name: "Tendai Mhlanga", role: "SUPERADMIN", companyId },
      select: { id: true },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (!companyId) return;
    await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
    await prisma.retailShopProfile.deleteMany({ where: { companyId } });
    await prisma.retailCategory.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
  });

  const actor = () => ({ companyId, userId, userName: "Tendai Mhlanga", userRole: "SUPERADMIN" });
  const save = (patch: ShopProfilePatch) => prisma.$transaction((tx) => saveShopProfile(tx, actor(), patch));

  it("reads as the defaults before anyone has saved it", async () => {
    expect(await loadShopProfile(companyId)).toEqual(DEFAULT_SHOP_PROFILE);
  });

  it("saves the liquor store and seeds its categories", async () => {
    const saved = await save(LIQUOR);
    expect(saved).toMatchObject({ ...LIQUOR, saved: true });

    const names = (
      await prisma.retailCategory.findMany({ where: { companyId }, orderBy: { sortOrder: "asc" } })
    ).map((row) => row.name);
    expect(names).toEqual(CATEGORY_SEEDS.LIQUOR.map((seed) => seed.name));

    const spirits = await prisma.retailCategory.findFirstOrThrow({ where: { companyId, name: "Spirits" } });
    expect(spirits.ageRestricted).toBe(true);
    expect(spirits.vatRate.toFixed(2)).toBe("15.00");
  });

  it("adds the general set beside it when the type changes, and removes nothing", async () => {
    await prisma.retailCategory.updateMany({ where: { companyId, name: "Beer" }, data: { vatRate: 0 } });
    await save({ businessType: "GENERAL" });

    const rows = await prisma.retailCategory.findMany({ where: { companyId } });
    const names = new Set(rows.map((row) => row.name));
    for (const seed of [...CATEGORY_SEEDS.LIQUOR, ...CATEGORY_SEEDS.GENERAL]) {
      expect(names.has(seed.name)).toBe(true);
    }
    // "Snacks" is in both sets and must not appear twice.
    expect(rows.filter((row) => row.name === "Snacks")).toHaveLength(1);
    // The owner's edit to Beer survives the type being saved again.
    expect(rows.find((row) => row.name === "Beer")?.vatRate.toFixed(2)).toBe("0.00");

    const profile = await loadShopProfile(companyId);
    expect(shopFeatures(profile).ageCheck).toBe(false);
    // The switches are kept, so going back to liquor restores them.
    expect(profile.ageCheck).toBe(true);
  });

  it("writes who changed it and what it was before to the audit chain", async () => {
    const events = await prisma.platformAuditEvent.findMany({
      where: { companyId, eventType: "RETAIL_SHOP.PROFILE_CHANGED" },
      orderBy: { createdAt: "asc" },
    });
    expect(events).toHaveLength(2);
    expect(events[0].actor).toBe(userId);
    expect(JSON.parse(events[1].payloadJson ?? "{}")).toMatchObject({
      businessTypeBefore: "LIQUOR",
      businessType: "GENERAL",
      featuresBefore: { ageCheck: true, casesAndSingles: true, emptiesAndDeposits: false },
      actorRole: "SUPERADMIN",
    });
  });

  it("changes only what the patch names", async () => {
    await save({ casesAndSingles: false });
    const profile = await loadShopProfile(companyId);
    expect(profile).toMatchObject({
      businessType: "GENERAL",
      casesAndSingles: false,
      ageCheck: true,
      licenceNumber: "HRE/BL/2024/0711",
      licenceExpiresOn: "2026-12-31",
    });
  });
});
