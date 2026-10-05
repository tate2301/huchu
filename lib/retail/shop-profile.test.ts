import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { CATEGORY_SEEDS } from "./categories";
import {
  DEFAULT_SHOP_PROFILE,
  isWithinLicenceHours,
  licenceWindowLabel,
  liquorSaleRefusal,
  loadShopProfile,
  saveShopProfile,
  shopClock,
  shopFeatures,
  type ShopProfileInput,
} from "./shop-profile";

const HOURS = {
  weekdayOpensAt: "08:00",
  weekdayClosesAt: "22:00",
  sundayOpensAt: "10:00",
  sundayClosesAt: "18:00",
};

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

describe("licence hours", () => {
  it("reads the clock in Harare, not on the server", () => {
    // 21:30 UTC on a Monday is 23:30 in Harare: outside 08:00–22:00.
    expect(shopClock(new Date("2026-10-05T21:30:00Z"))).toEqual({ weekday: "Mon", minutes: 23 * 60 + 30 });
    expect(isWithinLicenceHours(HOURS, new Date("2026-10-05T21:30:00Z"))).toBe(false);
  });

  it("sells from the minute it opens until the minute before it closes", () => {
    expect(isWithinLicenceHours(HOURS, harare("2026-10-05T07:59:00"))).toBe(false);
    expect(isWithinLicenceHours(HOURS, harare("2026-10-05T08:00:00"))).toBe(true);
    expect(isWithinLicenceHours(HOURS, harare("2026-10-05T21:59:00"))).toBe(true);
    expect(isWithinLicenceHours(HOURS, harare("2026-10-05T22:00:00"))).toBe(false);
  });

  it("uses Sunday's own window on a Sunday", () => {
    expect(isWithinLicenceHours(HOURS, harare("2026-10-04T09:30:00"))).toBe(false);
    expect(isWithinLicenceHours(HOURS, harare("2026-10-04T12:00:00"))).toBe(true);
    expect(isWithinLicenceHours(HOURS, harare("2026-10-04T18:30:00"))).toBe(false);
  });

  it("runs a window that closes after midnight into the next morning", () => {
    const late = { ...HOURS, weekdayOpensAt: "10:00", weekdayClosesAt: "01:00" };
    expect(isWithinLicenceHours(late, harare("2026-10-06T00:30:00"))).toBe(true);
    expect(isWithinLicenceHours(late, harare("2026-10-06T01:30:00"))).toBe(false);
    expect(isWithinLicenceHours(late, harare("2026-10-06T23:00:00"))).toBe(true);
  });

  it("treats a window that opens and closes at once as closed", () => {
    expect(isWithinLicenceHours({ ...HOURS, sundayOpensAt: "00:00", sundayClosesAt: "00:00" }, harare("2026-10-04T12:00:00"))).toBe(false);
  });
});

describe("a liquor sale at the till", () => {
  const liquor = { ...DEFAULT_SHOP_PROFILE, businessType: "LIQUOR" as const };
  const monday8pm = harare("2026-10-05T20:00:00");
  const monday11pm = harare("2026-10-05T23:00:00");

  it("goes through when nothing in the basket is age-restricted, at any hour", () => {
    expect(liquorSaleRefusal({ profile: liquor, ageRestricted: [], idChecked: false, at: monday11pm })).toBeNull();
  });

  it("asks for the ID check before alcohol, inside licence hours", () => {
    expect(
      liquorSaleRefusal({ profile: liquor, ageRestricted: ["Castle Lager 340ml"], idChecked: false, at: monday8pm }),
    ).toBe("Check the customer's ID before selling Castle Lager 340ml.");
    expect(
      liquorSaleRefusal({ profile: liquor, ageRestricted: ["Castle Lager 340ml"], idChecked: true, at: monday8pm }),
    ).toBeNull();
  });

  it("refuses alcohol outside licence hours, ID or not, and says when it may", () => {
    expect(
      liquorSaleRefusal({ profile: liquor, ageRestricted: ["Gin", "Beer"], idChecked: true, at: monday11pm }),
    ).toBe("Alcohol can't be sold now. The licence allows 8am to 10pm.");
  });

  it("says a Sunday closed all day plainly", () => {
    const shut = { ...liquor, sundayOpensAt: "00:00", sundayClosesAt: "00:00" };
    expect(licenceWindowLabel(shut, harare("2026-10-04T12:00:00"))).toBe("not at all on a Sunday");
  });

  it("follows each switch, and is off for general retail", () => {
    const noHours = { ...liquor, licenceHours: false };
    expect(liquorSaleRefusal({ profile: noHours, ageRestricted: ["Gin"], idChecked: true, at: monday11pm })).toBeNull();
    const noCheck = { ...liquor, ageCheck: false };
    expect(liquorSaleRefusal({ profile: noCheck, ageRestricted: ["Gin"], idChecked: false, at: monday8pm })).toBeNull();
    const general = { ...liquor, businessType: "GENERAL" as const };
    expect(liquorSaleRefusal({ profile: general, ageRestricted: ["Gin"], idChecked: false, at: monday11pm })).toBeNull();
  });
});

describe("saving the profile", () => {
  let companyId: string;
  let userId: string;

  const LIQUOR: ShopProfileInput = {
    businessType: "LIQUOR",
    ageCheck: true,
    licenceHours: true,
    emptiesAndDeposits: false,
    casesAndSingles: true,
    weekdayOpensAt: "08:00",
    weekdayClosesAt: "22:00",
    sundayOpensAt: "10:00",
    sundayClosesAt: "18:00",
    licenceNumber: "HRE/BL/2024/0711",
    licenceExpiresOn: "2026-12-31",
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

  it("reads as the defaults before anyone has saved it", async () => {
    expect(await loadShopProfile(companyId)).toEqual(DEFAULT_SHOP_PROFILE);
  });

  it("saves the liquor store and seeds its categories", async () => {
    const saved = await saveShopProfile(actor(), LIQUOR);
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
    await saveShopProfile(actor(), { ...LIQUOR, businessType: "GENERAL" });

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
      actorRole: "SUPERADMIN",
    });
  });
});
