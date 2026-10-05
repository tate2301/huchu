import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { companyPage } from "@/lib/retail/settings-pages/company";
import { checkSettingsChanges, isSettingsFieldEditable } from "@/lib/retail/settings-pages";

import { isPhoneNumber, YEAR_STARTS } from "@/lib/retail/settings-pages/company";

import { companyProfilePatch, currencyCode, currencyLabel, yearStartMonth } from "./company";
import { readSettings, readSettingsActivity, saveSettings } from "./index";
import { SettingsRefused } from "./types";

describe("the Shop page's rules", () => {
  it("changes the shop profile and the money, and only shows the business", () => {
    for (const id of [
      "businessType",
      "ageCheck",
      "weekdayHours",
      "casesAndSingles",
      "licenceExpiresOn",
      "currency",
      "financialYearStarts",
      "whatsapp",
      "vatRegistered",
      "defaultSiteId",
    ]) {
      expect(isSettingsFieldEditable(companyPage, id)).toBe(true);
    }
    for (const id of ["tradingName", "vatNumber", "logoUrl"]) {
      expect(isSettingsFieldEditable(companyPage, id)).toBe(false);
    }
  });

  it("offers the twelve months the year can start in, and the two currencies", () => {
    expect(YEAR_STARTS).toHaveLength(12);
    expect([YEAR_STARTS[0], YEAR_STARTS[11]]).toEqual(["1 January", "1 December"]);
    expect(yearStartMonth("1 March")).toBe(3);
    expect(currencyCode("ZiG")).toBe("ZWG");
    expect(currencyCode("US$")).toBe("USD");
    expect(checkSettingsChanges(companyPage, { financialYearStarts: "15 March", currency: "GBP" })).toEqual({
      ok: false,
      fieldErrors: { financialYearStarts: "Choose the month it starts.", currency: "Choose US$ or ZiG." },
    });
  });

  it("checks the WhatsApp number with its country code, spaces allowed", () => {
    expect(isPhoneNumber("+263 77 412 0098")).toBe(true);
    expect(isPhoneNumber("0774120098")).toBe(false);
    expect(checkSettingsChanges(companyPage, { whatsapp: "077 412" })).toEqual({
      ok: false,
      fieldErrors: { whatsapp: "Write the number with its country code, +263 77 412 0098." },
    });
    expect(checkSettingsChanges(companyPage, { whatsapp: "" })).toEqual({ ok: true, values: { whatsapp: "" } });
  });

  it("holds the hours while licence hours are off, and the currency once prices are locked", () => {
    const field = (id: string) => companyPage.sections.flatMap((section) => section.fields).find((f) => f.id === id)!;
    expect(field("weekdayHours").disabled?.({ licenceHours: false })).toBe(true);
    expect(field("sundayHours").disabled?.({ licenceHours: true })).toBe(false);
    expect(field("currency").disabled?.({ pricesLocked: true })).toBe(true);
    const hint = field("currency").h as (values: Record<string, unknown>) => string;
    expect(hint({ pricesLocked: true, currency: "US$" })).toBe("Prices stay in US$ because sales are recorded in it.");
    expect(hint({ pricesLocked: false, currency: "US$" })).toBe("");
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
    await prisma.retailSale.deleteMany({ where: { companyId } });
    await prisma.retailShopProfile.deleteMany({ where: { companyId } });
    await prisma.site.deleteMany({ where: { companyId } });
    await prisma.priceList.deleteMany({ where: { companyId } });
    await prisma.accountingSettings.deleteMany({ where: { companyId } });
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

  it("moves prices to ZiG and the year to March while nothing is sold", async () => {
    const list = await prisma.priceList.create({
      data: { companyId, name: "Retail", isDefault: true, currency: "USD" },
      select: { id: true },
    });
    const saved = await saveSettings(actor(), "company", { currency: "ZiG", financialYearStarts: "1 March" });
    expect(saved).toMatchObject({ ok: true, values: { currency: "ZiG", financialYearStarts: "1 March", pricesLocked: false } });
    expect(
      await prisma.accountingSettings.findUniqueOrThrow({
        where: { companyId },
        select: { baseCurrency: true, fiscalYearStartMonth: true },
      }),
    ).toEqual({ baseCurrency: "ZWG", fiscalYearStartMonth: 3 });
    expect((await prisma.priceList.findUniqueOrThrow({ where: { id: list.id } })).currency).toBe("ZWG");
    // Money alone is not a shop-profile change.
    expect(await prisma.platformAuditEvent.count({ where: { companyId, eventType: "RETAIL_SHOP.PROFILE_CHANGED" } })).toBe(2);
  });

  it("keeps a site of another tenant out of the default site", async () => {
    await expect(
      saveSettings(actor(), "company", { defaultSiteId: "00000000-0000-4000-8000-000000000000" }),
    ).rejects.toMatchObject({ message: "Choose one of your sites.", refusal: { status: 400, field: "defaultSiteId" } });
    const site = await prisma.site.create({ data: { companyId, name: "Harare Main Branch", code: "HRE" }, select: { id: true } });
    const saved = await saveSettings(actor(), "company", {
      defaultSiteId: site.id,
      whatsapp: "+263 77 412 0098",
      vatRegistered: false,
    });
    expect(saved).toMatchObject({
      ok: true,
      values: { defaultSiteId: site.id, whatsapp: "+263 77 412 0098", vatRegistered: false },
    });
    const event = await prisma.platformAuditEvent.findFirstOrThrow({
      where: { companyId, eventType: "RETAIL_SETTINGS.CHANGED" },
      orderBy: { createdAt: "desc" },
    });
    expect(JSON.parse(event.payloadJson ?? "{}").changes.map((change: { label: string }) => change.label).sort()).toEqual([
      "Default site",
      "Registered for VAT",
      "WhatsApp",
    ]);
  });

  it("refuses to change the currency once a sale is recorded in it, and keeps the year", async () => {
    const site = await prisma.site.findFirstOrThrow({ where: { companyId }, select: { id: true } });
    await prisma.retailSale.create({ data: { companyId, saleNo: "SALE-00001", siteId: site.id, cashierId: userId } });
    expect((await readSettings(companyId, "company", true))?.values.pricesLocked).toBe(true);
    const refused = saveSettings(actor(), "company", { currency: "US$", financialYearStarts: "1 July" });
    await expect(refused).rejects.toBeInstanceOf(SettingsRefused);
    await expect(refused).rejects.toMatchObject({
      message: "Prices stay in ZiG because sales are recorded in it.",
      refusal: { status: 409, code: "PRICES_LOCKED" },
    });
    expect(
      await prisma.accountingSettings.findUniqueOrThrow({ where: { companyId }, select: { baseCurrency: true, fiscalYearStartMonth: true } }),
    ).toEqual({ baseCurrency: "ZWG", fiscalYearStartMonth: 3 });
    // The year alone still saves.
    expect(await saveSettings(actor(), "company", { financialYearStarts: "1 July" })).toMatchObject({ ok: true });
  });
});
