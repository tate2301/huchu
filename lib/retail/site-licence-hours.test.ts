import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { ageCheckFor } from "@/lib/retail/products/age-check";

import { LicenceRefusal, licenceWeekSchema, loadLicenceHours, loadSiteLicence, saveLicenceHours } from "./site-licence-hours";

/** A site's licence hours against the test database: read, replaced as a week, recorded, and refused on a closed site. */

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let ownerId: string;
let siteId: string;
let closedSiteId: string;

const actor = () => ({ companyId, userId: ownerId, userName: "Tendai Mhlanga", userRole: "SUPERADMIN" });

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Licence ${stamp}`, slug: `licence-${stamp}` }, select: { id: true } })).id;
  ownerId = (
    await prisma.user.create({
      data: { email: `owner-${stamp}@licence.test`, name: "Tendai Mhlanga", role: "SUPERADMIN", companyId },
      select: { id: true },
    })
  ).id;
  siteId = (await prisma.site.create({ data: { companyId, name: "Avondale", code: "AVD" }, select: { id: true } })).id;
  closedSiteId = (
    await prisma.site.create({
      data: { companyId, name: "Borrowdale", code: "BRW", isActive: false, closedAt: new Date() },
      select: { id: true },
    })
  ).id;
  await prisma.retailShopProfile.create({ data: { companyId, businessType: "LIQUOR" } });
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.retailLicenceHours.deleteMany({ where: { companyId } });
  await prisma.retailShopProfile.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("a site's licence hours", () => {
  it("sells all day until any are kept, and the liquor store enforces them", async () => {
    expect(await loadSiteLicence(companyId, siteId)).toEqual({
      siteId,
      name: "Avondale",
      closed: false,
      enforced: true,
      days: [],
    });
  });

  it("replaces the whole week, and writes down what moved", async () => {
    await saveLicenceHours(actor(), siteId, [
      { weekday: 1, alcoholFrom: 480, alcoholUntil: 1320 },
      { weekday: 0, alcoholFrom: 0, alcoholUntil: 0 },
    ]);
    const saved = await saveLicenceHours(actor(), siteId, [{ weekday: 5, alcoholFrom: 600, alcoholUntil: 120 }]);
    expect(saved.days).toEqual([{ weekday: 5, alcoholFrom: 600, alcoholUntil: 120 }]);
    expect(await loadLicenceHours(companyId, siteId)).toEqual(saved.days);

    const events = await prisma.platformAuditEvent.findMany({
      where: { companyId, eventType: "RETAIL_SITE.CHANGED" },
      orderBy: { createdAt: "asc" },
    });
    expect(events).toHaveLength(2);
    expect(JSON.parse(events[1]!.payloadJson ?? "{}")).toMatchObject({
      name: "Avondale",
      changes: { licenceHours: { from: "Mon 08:00 to 22:00, Sun not at all", to: "Fri 10:00 to 02:00" } },
    });
  });

  it("writes nothing down when the week is sent unchanged", async () => {
    await saveLicenceHours(actor(), siteId, [{ weekday: 5, alcoholFrom: 600, alcoholUntil: 120 }]);
    expect(await prisma.platformAuditEvent.count({ where: { companyId, eventType: "RETAIL_SITE.CHANGED" } })).toBe(2);
  });

  it("is not enforced while the shop's switch is off", async () => {
    await prisma.retailShopProfile.update({ where: { companyId }, data: { licenceHours: false } });
    expect((await loadSiteLicence(companyId, siteId))?.enforced).toBe(false);
    await prisma.retailShopProfile.update({ where: { companyId }, data: { licenceHours: true } });
  });

  it("leaves a closed site's hours alone, and does not find another shop's site", async () => {
    await expect(saveLicenceHours(actor(), closedSiteId, [])).rejects.toBeInstanceOf(LicenceRefusal);
    await expect(saveLicenceHours({ ...actor(), companyId: ownerId }, siteId, [])).rejects.toMatchObject({ status: 404 });
    expect(await loadSiteLicence(ownerId, siteId)).toBeNull();
  });

  it("refuses a weekday twice in one week", () => {
    const day = { weekday: 1, alcoholFrom: 480, alcoholUntil: 1320 };
    expect(licenceWeekSchema.safeParse({ days: [day, day] }).success).toBe(false);
    expect(licenceWeekSchema.safeParse({ days: [{ ...day, alcoholUntil: 1440 }] }).success).toBe(false);
  });
});

describe("a product's ID check", () => {
  it("is its own answer when it has one, else its category's", () => {
    const beer = { ageRestricted: true };
    expect(ageCheckFor({ ageRestricted: null, retailCategory: beer })).toBe(true);
    expect(ageCheckFor({ ageRestricted: false, retailCategory: beer })).toBe(false);
    expect(ageCheckFor({ ageRestricted: true, retailCategory: { ageRestricted: false } })).toBe(true);
    expect(ageCheckFor({ ageRestricted: null, retailCategory: null })).toBe(false);
  });
});
