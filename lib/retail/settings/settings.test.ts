import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { companyPage } from "@/lib/retail/settings-pages/company";
import { checkSettingsChanges, isSettingsFieldEditable } from "@/lib/retail/settings-pages";

import { companyProfilePatch, currencyLabel } from "./company";
import { readSettings, readSettingsActivity, saveSettings } from "./index";

describe("the Shop page's rules", () => {
  it("changes the shop profile and only shows the business and money", () => {
    for (const id of ["businessType", "ageCheck", "weekdayHours", "casesAndSingles", "licenceExpiresOn"]) {
      expect(isSettingsFieldEditable(companyPage, id)).toBe(true);
    }
    for (const id of ["tradingName", "vatNumber", "logoUrl", "currency", "financialYearStarts"]) {
      expect(isSettingsFieldEditable(companyPage, id)).toBe(false);
    }
  });

  it("refuses hours that are not two times joined by 'to', with the board's sentence", () => {
    expect(checkSettingsChanges(companyPage, { weekdayHours: "8am till late" })).toEqual({
      ok: false,
      fieldErrors: { weekdayHours: "Write it as 08:00 to 22:00." },
    });
    expect(checkSettingsChanges(companyPage, { sundayHours: "10:00 to 25:00" })).toMatchObject({ ok: false });
    expect(checkSettingsChanges(companyPage, { weekdayHours: "9:00 to 21:30" })).toEqual({
      ok: true,
      values: { weekdayHours: "9:00 to 21:30" },
    });
  });

  it("refuses a field the page only shows, and one it does not have", () => {
    expect(checkSettingsChanges(companyPage, { vatNumber: "1", colour: "red" })).toEqual({
      ok: false,
      fieldErrors: { vatNumber: "VAT number is not changed on this page.", colour: "This page has no such field." },
    });
  });

  it("reads a typed licence date and an empty one", () => {
    expect(checkSettingsChanges(companyPage, { licenceExpiresOn: "31 Feb 2026" })).toEqual({
      ok: false,
      fieldErrors: { licenceExpiresOn: "Write a date such as 31 December 2026." },
    });
    expect(companyProfilePatch({ licenceExpiresOn: "31 December 2026" })).toEqual({ licenceExpiresOn: "2026-12-31" });
    expect(companyProfilePatch({ licenceExpiresOn: "" })).toEqual({ licenceExpiresOn: null });
  });

  it("stores the page's words as the profile's values", () => {
    expect(
      companyProfilePatch({ businessType: "General retail", weekdayHours: "9:00 to 21:30", licenceNumber: "  " }),
    ).toEqual({ businessType: "GENERAL", weekdayOpensAt: "09:00", weekdayClosesAt: "21:30", licenceNumber: null });
    expect(currencyLabel("USD")).toBe("US$");
    expect(currencyLabel("ZWG")).toBe("ZiG");
  });
});

describe("saving the Shop page", () => {
  let companyId: string;
  let userId: string;

  beforeAll(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const company = await prisma.company.create({
      data: { name: `Settings ${stamp}`, slug: `settings-${stamp}` },
      select: { id: true },
    });
    companyId = company.id;
    userId = (
      await prisma.user.create({
        data: { email: `owner-${stamp}@shop.test`, name: "Tendai Mhlanga", role: "SUPERADMIN", companyId },
        select: { id: true },
      })
    ).id;
    await prisma.companyBranding.create({
      data: { companyId, tradingName: "Harare Bottle Store", vatNumber: "10023881", physicalAddress: "14 Samora Machel Avenue, Harare" },
    });
    await prisma.retailShopProfile.create({ data: { companyId, businessType: "LIQUOR", licenceNumber: "HRE/BL/2024/0711" } });
  });

  afterAll(async () => {
    if (!companyId) return;
    await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
    await prisma.retailShopProfile.deleteMany({ where: { companyId } });
    await prisma.retailCategory.deleteMany({ where: { companyId } });
    await prisma.companyBranding.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
  });

  const actor = () => ({ companyId, userId, userName: "Tendai Mhlanga", userRole: "SUPERADMIN" });

  it("reads every value as the page shows it, never changed before", async () => {
    const read = await readSettings(companyId, "company", false);
    expect(read).toMatchObject({
      canEdit: false,
      lastChanged: null,
      values: {
        businessType: "Liquor store",
        ageCheck: true,
        weekdayHours: "08:00 to 22:00",
        sundayHours: "10:00 to 18:00",
        casesAndSingles: true,
        licenceNumber: "HRE/BL/2024/0711",
        licenceExpiresOn: "",
        tradingName: "Harare Bottle Store",
        vatNumber: "10023881",
        address: "14 Samora Machel Avenue, Harare",
        logoUrl: null,
        currency: "US$",
        financialYearStarts: "1 January",
      },
    });
    expect(await readSettings(companyId, "nowhere", true)).toBeNull();
  });

  it("saves one switch with one settings event and the profile's own", async () => {
    const saved = await saveSettings(actor(), "company", { casesAndSingles: false, ageCheck: true });
    expect(saved).toMatchObject({ ok: true, values: { casesAndSingles: false }, lastChanged: { by: "Tendai Mhlanga" } });

    const profile = await prisma.retailShopProfile.findUniqueOrThrow({ where: { companyId } });
    expect(profile.casesAndSingles).toBe(false);

    const settings = await prisma.platformAuditEvent.findMany({
      where: { companyId, eventType: "RETAIL_SETTINGS.CHANGED" },
    });
    expect(settings).toHaveLength(1);
    expect(settings[0]).toMatchObject({ entityType: "RetailSettings", entityId: "company", actor: userId });
    // The unchanged age check is not in it.
    expect(JSON.parse(settings[0]!.payloadJson ?? "{}")).toMatchObject({
      page: "company",
      changes: [{ field: "casesAndSingles", label: "Cases and singles", from: true, to: false }],
    });
    expect(await prisma.platformAuditEvent.count({ where: { companyId, eventType: "RETAIL_SHOP.PROFILE_CHANGED" } })).toBe(1);
  });

  it("writes nothing when nothing differs", async () => {
    await saveSettings(actor(), "company", { casesAndSingles: false, weekdayHours: "08:00 to 22:00" });
    expect(await prisma.platformAuditEvent.count({ where: { companyId } })).toBe(2);
  });

  it("refuses bad hours and saves nothing", async () => {
    expect(await saveSettings(actor(), "company", { weekdayHours: "late", ageCheck: false })).toEqual({
      ok: false,
      fieldErrors: { weekdayHours: "Write it as 08:00 to 22:00." },
    });
    expect((await prisma.retailShopProfile.findUniqueOrThrow({ where: { companyId } })).ageCheck).toBe(true);
  });

  it("switches to General retail, seeds its categories and keeps the liquor values", async () => {
    await saveSettings(actor(), "company", { businessType: "General retail" });
    const read = await readSettings(companyId, "company", true);
    expect(read?.values).toMatchObject({ businessType: "General retail", casesAndSingles: false });
    expect(await prisma.retailCategory.count({ where: { companyId, name: "Groceries" } })).toBeGreaterThan(0);
  });

  it("shows its saves and the profile's events in its Activity, newest first", async () => {
    const page = await readSettingsActivity(companyId, "company", { page: 1, size: 10 });
    expect(page?.total).toBe(4);
    // A save and the profile's own event share a moment; the later save comes first.
    expect(page?.rows.slice(0, 2).map((row) => row.what).sort()).toEqual([
      "Changed Business type",
      "Changed the business type to general retail",
    ]);
    expect(page?.rows.slice(2).map((row) => row.what).sort()).toEqual([
      "Changed Cases and singles",
      "Turned cases and singles off",
    ]);
    expect(page?.rows[0]?.actor.name).toBe("Tendai Mhlanga");
  });
});
