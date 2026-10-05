import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { money, quantity } from "@/lib/money";
import { prisma } from "@/lib/prisma";

import {
  SiteRefusal,
  closeSite,
  createSite,
  getSite,
  listSites,
  priceListOptions,
  siteInput,
  siteNewContext,
  sitePatch,
  updateSite,
  type SiteActor,
} from "./sites";

/** W-03 and W-66 against the test database: add a site, its places, the default, the plan's room, close it. */

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let otherCompanyId: string;
let ownerId: string;
let planId: string;
let retailListId: string;
let wholesaleListId: string;
let mainId: string;

const actor = (canSeeCost = true): SiteActor => ({
  companyId,
  userId: ownerId,
  userName: "Tendai Mhlanga",
  userRole: "SUPERADMIN",
  canSeeCost,
});

async function refusal(promise: Promise<unknown>): Promise<SiteRefusal> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SiteRefusal) return error;
    throw error;
  }
  throw new Error("expected a refusal");
}

/** A body as the sheet sends it. */
const raw = (name: string, code: string, places = ["Shop floor"]) => ({
  name,
  code,
  phone: "0242334410",
  address: "Shop 7, Avondale Shopping Centre, Harare",
  places: places.map((place) => ({ name: place })),
  priceListId: retailListId,
  openingHours: "Mon to Sat 08:00 to 21:00, Sun 10:00 to 17:00",
});
const input = (name: string, code: string, places?: string[]) => siteInput.parse(raw(name, code, places));

async function stockLine(siteId: string, locationId: string, code: string, onHand: number, cost: number) {
  return (
    await prisma.inventoryItem.create({
      data: {
        itemCode: `${code}-${stamp}`,
        name: code,
        category: "OTHER",
        unit: "bottle",
        siteId,
        locationId,
        currentStock: quantity(onHand),
        unitCost: money(cost),
      },
      select: { id: true },
    })
  ).id;
}

const events = (entityId: string) =>
  prisma.platformAuditEvent.findMany({ where: { companyId, entityId }, orderBy: { createdAt: "asc" } });

beforeAll(async () => {
  const [shop, rival] = await Promise.all([
    prisma.company.create({ data: { name: `Sites ${stamp}`, slug: `sites-${stamp}` }, select: { id: true } }),
    prisma.company.create({ data: { name: `Sites rival ${stamp}`, slug: `sites-rival-${stamp}` }, select: { id: true } }),
  ]);
  companyId = shop.id;
  otherCompanyId = rival.id;
  ownerId = (
    await prisma.user.create({
      data: { companyId, name: "Tendai Mhlanga", role: "SUPERADMIN", email: `owner-${stamp}@sites.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  planId = (
    await prisma.subscriptionPlan.create({
      data: { code: `TEST-GROW-${stamp}`, name: "Grow", monthlyPrice: 49, maxSites: 3 },
      select: { id: true },
    })
  ).id;
  await prisma.companySubscription.create({ data: { companyId, planId, status: "ACTIVE" } });
  retailListId = (
    await prisma.priceList.create({ data: { companyId, name: "Retail", kind: "RETAIL", taxInclusive: true }, select: { id: true } })
  ).id;
  wholesaleListId = (await prisma.priceList.create({ data: { companyId, name: "Wholesale" }, select: { id: true } })).id;

  const main = await prisma.site.create({
    data: { companyId, name: "Harare Main Branch", code: "HRE", location: "14 Samora Machel Avenue, Harare", priceListId: retailListId },
    select: { id: true },
  });
  mainId = main.id;
  await prisma.stockLocation.create({ data: { siteId: mainId, code: "SHOP", name: "Shop floor" } });
  await prisma.retailShopProfile.create({ data: { companyId, defaultSiteId: mainId } });
  await prisma.retailRegister.create({ data: { companyId, siteId: mainId, code: `TILL-1`, name: "Front till" } });
});

afterAll(async () => {
  const ids = [companyId, otherCompanyId].filter(Boolean);
  await prisma.stockMovement.deleteMany({ where: { item: { site: { companyId: { in: ids } } } } });
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId: { in: ids } } } });
  await prisma.retailShift.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.retailDevice.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.retailRegister.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId: { in: ids } } } });
  await prisma.retailShopProfile.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.site.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.productPrice.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.priceList.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.companySubscription.deleteMany({ where: { companyId: { in: ids } } });
  if (planId) await prisma.subscriptionPlan.delete({ where: { id: planId } });
  await prisma.user.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.company.deleteMany({ where: { id: { in: ids } } });
});

describe("what Add a site is given", () => {
  it("offers the price lists with the till's list first as the default, the plan's room and a code", async () => {
    const context = await siteNewContext(companyId, "Avondale");
    expect(context.priceLists[0]).toMatchObject({ id: retailListId, name: "Retail", sub: "Default, 0 products" });
    expect(context.priceLists.map((option) => option.name)).toEqual(["Retail", "Wholesale"]);
    expect(context.defaultPriceListId).toBe(retailListId);
    expect(context.plan).toEqual({ name: "Grow", maxSites: 3, openSites: 1 });
    expect(context.suggestedCode).toBe("AVO");
    expect(context.otherSites).toEqual([{ id: mainId, name: "Harare Main Branch" }]);
    expect((await priceListOptions(otherCompanyId)).options).toEqual([]);
  });

  it("checks the input as the API reads it", () => {
    expect(siteInput.safeParse({ ...raw("Avondale", "avd"), places: [] }).error?.issues[0]?.message).toBe(
      "A site keeps at least one place.",
    );
    expect(siteInput.parse(raw("Avondale", " avd ")).code).toBe("AVD");
    expect(siteInput.safeParse(raw("Avondale", "A")).error?.issues[0]?.message).toBe(
      "Write the short code as 2 to 6 letters or figures, like HRE.",
    );
    expect(input("Avondale", "AVD").phone).toBe("+263 24 233 4410");
    expect(siteInput.safeParse({ ...raw("Avondale", "AVD"), phone: "12345" }).error?.issues[0]?.message).toBe(
      "Write a Zimbabwe number, like +263 24 270 5521.",
    );
    expect(
      siteInput.safeParse({ ...raw("Avondale", "AVD"), places: [{ name: "Cold room" }, { name: "cold room" }] }).success,
    ).toBe(false);
    expect(sitePatch.safeParse({ places: [] }).success).toBe(false);
  });
});

describe("adding a site (W-03)", () => {
  let avondaleId: string;

  it("adds it with its places in order, and says so in Activity", async () => {
    const site = await createSite(actor(), input("Avondale", "AVD", ["Shop floor", "Back store"]));
    avondaleId = site.id;
    expect(site).toMatchObject({
      name: "Avondale",
      code: "AVD",
      phone: "+263 24 233 4410",
      places: "Shop floor, back store",
      priceList: "Retail",
      state: "OPEN",
      isDefault: false,
      tills: 0,
      stockValue: "0.00",
      sub: "0 tills · US$0.00 in stock",
    });
    const places = await prisma.stockLocation.findMany({ where: { siteId: site.id }, orderBy: { sortOrder: "asc" } });
    expect(places.map((place) => [place.code, place.name, place.sortOrder])).toEqual([
      ["SHOP", "Shop floor", 0],
      ["BACK", "Back store", 1],
    ]);
    const [event] = await events(site.id);
    expect(event).toMatchObject({ eventType: "RETAIL_SITE.CREATED", actor: ownerId });
  });

  it("refuses a name an open site has, and a code any site has", async () => {
    const name = await refusal(createSite(actor(), input("avondale", "AV2")));
    expect(name).toMatchObject({ status: 409, message: "There is already a site called Avondale.", opts: { field: "name" } });
    const code = await refusal(createSite(actor(), input("Avondale East", "AVD")));
    expect(code).toMatchObject({ status: 409, message: "Avondale already has the code AVD.", opts: { field: "code" } });
    const list = await refusal(createSite(actor(), { ...input("Avondale East", "AVE"), priceListId: crypto.randomUUID() }));
    expect(list).toMatchObject({ status: 400, opts: { field: "priceListId" } });
  });

  it("stops at the plan's limit with the plan's sentence", async () => {
    await createSite(actor(), input("Borrowdale", "BDL"));
    expect((await siteNewContext(companyId)).plan).toEqual({ name: "Grow", maxSites: 3, openSites: 3 });
    const full = await refusal(createSite(actor(), input("Mount Pleasant", "MTP")));
    expect(full).toMatchObject({ status: 409, message: "Your Grow plan has no room for another site.", opts: { code: "PLAN_LIMIT" } });
    expect(await prisma.site.count({ where: { companyId, name: "Mount Pleasant" } })).toBe(0);
  });

  it("lists every open site with totals, and hides the value from someone who may not see cost", async () => {
    const line = await prisma.stockLocation.findFirstOrThrow({ where: { siteId: mainId, code: "SHOP" } });
    await stockLine(mainId, line.id, "CASTLE", 24, 1.5);
    const seen = await listSites(companyId, { canSeeCost: true });
    expect(seen.data.map((row) => [row.name, row.state, row.tills, row.stockValue])).toEqual([
      ["Avondale", "OPEN", 0, "0.00"],
      ["Borrowdale", "OPEN", 0, "0.00"],
      ["Harare Main Branch", "DEFAULT", 1, "36.00"],
    ]);
    expect(seen.totals).toEqual({ count: 3, tills: 1, stockValue: "36.00" });
    const clerk = await listSites(companyId, { canSeeCost: false, q: "hre" });
    expect(clerk.data).toHaveLength(1);
    expect(clerk.data[0]!.stockValue).toBeNull();
    expect(clerk.totals.stockValue).toBeNull();
    expect(await getSite(otherCompanyId, avondaleId, true)).toBeNull();
  });
});

describe("places inside a site (W-66)", () => {
  it("adds Cold room and removes Back store, moving its stock to the shop floor", async () => {
    const site = await getSite(companyId, (await prisma.site.findFirstOrThrow({ where: { companyId, code: "AVD" } })).id, true);
    const [shop, back] = site!.placeList;
    const held = await stockLine(site!.id, back!.id, "GIN", 6, 16.4);
    const empty = await stockLine(site!.id, back!.id, "RUM", 0, 12);
    expect(site!.placeList.find((place) => place.id === back!.id)?.hasStock).toBe(false);

    const changed = await updateSite(actor(), site!.id, {
      places: [{ id: shop!.id, name: "Shop floor" }, { name: "Cold room" }],
    });
    expect(changed.places).toBe("Shop floor, cold room");

    const lines = await prisma.inventoryItem.findMany({ where: { id: { in: [held, empty] } }, select: { id: true, locationId: true } });
    expect(lines.every((line) => line.locationId === shop!.id)).toBe(true);
    const moves = await prisma.stockMovement.findMany({ where: { itemId: { in: [held, empty] } } });
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({
      itemId: held,
      movementType: "TRANSFER",
      reason: "PLACE_MOVE",
      sourceType: "RETAIL_STOCK_TRANSFER",
      toLocationId: shop!.id,
      notes: "Place Back store removed",
    });
    expect((await prisma.stockLocation.findUniqueOrThrow({ where: { id: back!.id } })).isActive).toBe(false);

    const changedEvent = (await events(site!.id)).find((event) => event.eventType === "RETAIL_SITE.CHANGED");
    expect(JSON.parse(changedEvent!.payloadJson ?? "{}")).toMatchObject({
      placesAdded: ["Cold room"],
      placesRemoved: ["Back store"],
      stockMoved: 1,
    });

    // Back store again comes back under its old code; the order follows the list.
    const again = await updateSite(actor(), site!.id, { places: [{ name: "Back store" }, { name: "Shop floor" }, { name: "Cold room" }] });
    expect(again.places).toBe("Back store, shop floor, cold room");
    expect((await prisma.stockLocation.findUniqueOrThrow({ where: { id: back!.id } })).isActive).toBe(true);
  });

  it("makes another site the default, and will not leave the shop without one", async () => {
    const borrowdale = await prisma.site.findFirstOrThrow({ where: { companyId, code: "BDL" } });
    const unset = await refusal(updateSite(actor(), mainId, { isDefault: false }));
    expect(unset).toMatchObject({ status: 409, message: "Make another site the default first.", opts: { code: "DEFAULT_SITE" } });

    const made = await updateSite(actor(), borrowdale.id, { isDefault: true, phone: "+263 24 288 1100", priceListId: wholesaleListId });
    expect(made).toMatchObject({ isDefault: true, state: "DEFAULT", phone: "+263 24 288 1100", priceList: "Wholesale" });
    expect((await getSite(companyId, mainId, true))!.state).toBe("OPEN");
    await updateSite(actor(), mainId, { isDefault: true });
  });

  it("changes only what a PATCH sends: Make default and a places edit leave phone, address and hours", async () => {
    // Left out stays left out; sent empty clears.
    expect(sitePatch.parse({ isDefault: true }).phone).toBeUndefined();
    expect(sitePatch.parse({ isDefault: true }).address).toBeUndefined();
    expect(sitePatch.parse({ isDefault: true }).openingHours).toBeUndefined();
    expect(sitePatch.parse({ phone: "", address: null, openingHours: " " })).toEqual({ phone: null, address: null, openingHours: null });

    const details = { phone: "+263 24 270 5521", address: "14 Samora Machel Avenue, Harare", openingHours: "Mon to Sat 08:00 to 22:00" };
    await updateSite(actor(), mainId, sitePatch.parse({ phone: "0242705521", address: details.address, openingHours: details.openingHours }));
    const kept = () => getSite(companyId, mainId, true).then((site) => site && { phone: site.phone, address: site.address, openingHours: site.openingHours });
    expect(await kept()).toEqual(details);

    const borrowdale = await prisma.site.findFirstOrThrow({ where: { companyId, code: "BDL" } });
    await updateSite(actor(), borrowdale.id, sitePatch.parse({ isDefault: true }));
    await updateSite(actor(), mainId, sitePatch.parse({ isDefault: true }));
    expect(await kept()).toEqual(details);

    const shop = (await getSite(companyId, mainId, true))!.placeList[0]!;
    await updateSite(actor(), mainId, sitePatch.parse({ places: [{ id: shop.id, name: "Shop floor" }] }));
    await updateSite(actor(), mainId, sitePatch.parse({ name: "Harare Main Branch" }));
    expect(await kept()).toEqual(details);
    expect((await prisma.site.findUniqueOrThrow({ where: { id: borrowdale.id } })).phone).toBe("+263 24 288 1100");
  });

  it("refuses another site's place by id, even under a name this site has", async () => {
    const avondale = await getSite(companyId, (await prisma.site.findFirstOrThrow({ where: { companyId, code: "AVD" } })).id, true);
    const theirs = avondale!.placeList.find((place) => place.name === "Shop floor")!;
    const refused = await refusal(updateSite(actor(), mainId, sitePatch.parse({ places: [{ id: theirs.id, name: "Shop floor" }] })));
    expect(refused).toMatchObject({ status: 400, message: "One of those places is not at this site.", opts: { field: "places" } });
    expect((await prisma.stockLocation.findUniqueOrThrow({ where: { id: theirs.id } })).siteId).toBe(avondale!.id);
  });

  it("records the price list it sold from before", async () => {
    await updateSite(actor(), mainId, sitePatch.parse({ priceListId: wholesaleListId }));
    await updateSite(actor(), mainId, sitePatch.parse({ priceListId: retailListId }));
    const changed = (await events(mainId))
      .filter((event) => event.eventType === "RETAIL_SITE.CHANGED")
      .map((event) => JSON.parse(event.payloadJson ?? "{}").changes?.priceList)
      .filter(Boolean);
    expect(changed.slice(-2)).toEqual([
      { from: "Retail", to: "Wholesale" },
      { from: "Wholesale", to: "Retail" },
    ]);
  });
});

describe("closing a site", () => {
  it("refuses the default site, a site with an open shift, and a site with stock — with the count", async () => {
    expect(await refusal(closeSite(actor(), mainId))).toMatchObject({ status: 409, opts: { code: "DEFAULT_SITE" } });

    const avondale = await prisma.site.findFirstOrThrow({ where: { companyId, code: "AVD" } });
    const stocked = await refusal(closeSite(actor(), avondale.id));
    expect(stocked).toMatchObject({
      status: 409,
      message: "1 product still has stock here. Move it or count it to zero first.",
      opts: { code: "HAS_STOCK" },
    });

    const borrowdale = await prisma.site.findFirstOrThrow({ where: { companyId, code: "BDL" } });
    const till = await prisma.retailRegister.create({
      data: { companyId, siteId: borrowdale.id, code: `TILL-9-${stamp}`, name: "Borrowdale till" },
      select: { id: true, code: true },
    });
    const shift = await prisma.retailShift.create({
      data: { companyId, siteId: borrowdale.id, shiftNo: `SH-${stamp}`, registerCode: till.code, registerName: "Borrowdale till", registerId: till.id, cashierId: ownerId, cashierName: "Tendai Mhlanga" },
      select: { id: true },
    });
    expect(await refusal(closeSite(actor(), borrowdale.id))).toMatchObject({ opts: { code: "SHIFT_OPEN" } });
    await prisma.retailShift.delete({ where: { id: shift.id } });
    await prisma.retailRegister.delete({ where: { id: till.id } });
  });

  it("closes a site with nothing left: its tills stop, it shows under Closed, its history stays", async () => {
    const borrowdale = await prisma.site.findFirstOrThrow({ where: { companyId, code: "BDL" } });
    const till = await prisma.retailRegister.create({
      data: { companyId, siteId: borrowdale.id, code: `TILL-B`, name: "Borrowdale till" },
      select: { id: true },
    });
    const device = await prisma.retailDevice.create({
      data: { companyId, registerId: till.id, kind: "COUNTER_MINI", keyHash: `key-${stamp}`, pairedById: ownerId },
      select: { id: true },
    });

    const closed = await closeSite(actor(), borrowdale.id);
    // SET-03: the closed site's tills lose their devices, with the reason.
    expect(await prisma.retailDevice.findUniqueOrThrow({ where: { id: device.id } })).toMatchObject({
      unpairReason: "SITE_CLOSED",
      unpairedById: ownerId,
    });
    expect(closed).toMatchObject({ state: "CLOSED", tills: 0, sub: "Closed · 0 tills · US$0.00 in stock" });
    const row = await prisma.site.findUniqueOrThrow({ where: { id: borrowdale.id } });
    expect(row).toMatchObject({ isActive: false, closedById: ownerId });
    expect(row.closedAt).toBeInstanceOf(Date);
    expect(await prisma.retailRegister.count({ where: { siteId: borrowdale.id, isActive: true } })).toBe(0);

    expect((await listSites(companyId, { canSeeCost: true })).data.map((site) => site.code)).not.toContain("BDL");
    expect((await listSites(companyId, { state: "closed", canSeeCost: true })).data.map((site) => site.code)).toEqual(["BDL"]);
    expect(await refusal(updateSite(actor(), borrowdale.id, { name: "Borrowdale Village" }))).toMatchObject({ status: 409 });
    expect((await events(borrowdale.id)).map((event) => event.eventType)).toContain("RETAIL_SITE.CLOSED");

    // Its name is free for an open site again; the plan counts open sites only.
    expect((await siteNewContext(companyId)).plan?.openSites).toBe(2);
  });
});
