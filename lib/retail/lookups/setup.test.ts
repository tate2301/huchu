import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

import { addLookupOption, searchLookup, type LookupCtx } from "./index";

/** The `site` and `price-list` nouns (10-setup 4.2, C-28) against the test database. */

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let userId: string;
let mainId: string;
let retailId: string;

const as = (role: string): LookupCtx => ({ companyId, userId, userName: "Tendai Mhlanga", session: { user: { role } } });

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Site lookups ${stamp}`, slug: `site-lookups-${stamp}` }, select: { id: true } })).id;
  userId = (
    await prisma.user.create({
      data: { companyId, name: "Tendai Mhlanga", role: "SUPERADMIN", email: `owner-${stamp}@site-lookups.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  retailId = (await prisma.priceList.create({ data: { companyId, name: "Retail", kind: "RETAIL" }, select: { id: true } })).id;
  const product = await prisma.product.create({ data: { companyId, code: `CASTLE-${stamp}`, name: "Castle Lager 340ml" }, select: { id: true } });
  await prisma.productPrice.create({ data: { companyId, priceListId: retailId, productId: product.id, unitPrice: money("1.20") } });
  mainId = (await prisma.site.create({ data: { companyId, name: "Harare Main Branch", code: "HRE" }, select: { id: true } })).id;
  await prisma.site.create({ data: { companyId, name: "Borrowdale", code: "BDL" } });
  await prisma.retailShopProfile.create({ data: { companyId, defaultSiteId: mainId } });
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.stockLocation.deleteMany({ where: { site: { companyId } } });
  await prisma.retailShopProfile.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.productPrice.deleteMany({ where: { companyId } });
  await prisma.priceList.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("the site noun", () => {
  it("offers the open sites with the default first, to a stock clerk too", async () => {
    const answer = await searchLookup(as("STOCK_CLERK"), "site", {});
    expect(answer.status).toBe(200);
    if (answer.status !== 200) return;
    expect(answer.body.options.map((option) => [option.label, option.sub])).toEqual([
      ["Harare Main Branch", "Default"],
      ["Borrowdale", null],
    ]);
    expect(answer.body.add).toBeNull();
    const without = await searchLookup(as("STOCK_CLERK"), "site", { context: { exclude: mainId } });
    expect(without.status === 200 && without.body.options.map((option) => option.label)).toEqual(["Borrowdale"]);
    expect((await searchLookup(as("CASHIER"), "site", {})).status).toBe(403);
  });

  it("adds a site from a name and address, with a shop floor and the default list", async () => {
    const answer = await addLookupOption(as("SUPERADMIN"), "site", { name: "Avondale", address: "Avondale Shopping Centre, Harare" });
    expect(answer.status).toBe(201);
    if (answer.status !== 201) return;
    const site = await prisma.site.findUniqueOrThrow({
      where: { id: answer.body.option.id },
      include: { stockLocations: true },
    });
    expect(site).toMatchObject({ code: "AVO", location: "Avondale Shopping Centre, Harare", priceListId: retailId });
    expect(site.stockLocations.map((place) => place.name)).toEqual(["Shop floor"]);
    expect((await addLookupOption(as("MANAGER"), "site", { name: "Belgravia" })).status).toBe(403);
  });
});

describe("the price-list noun", () => {
  it("reads the lists with their product counts, and copies one as a new list", async () => {
    const found = await searchLookup(as("MANAGER"), "price-list", {});
    expect(found.status === 200 && found.body.options).toEqual([{ id: retailId, label: "Retail", sub: "Default, 1 product" }]);

    const added = await addLookupOption(as("MANAGER"), "price-list", { name: "Avondale prices", from: "" });
    expect(added.status).toBe(201);
    if (added.status !== 201) return;
    expect(added.body.option).toMatchObject({ label: "Avondale prices", sub: "1 product" });
    expect(await prisma.productPrice.count({ where: { priceListId: added.body.option.id } })).toBe(1);

    const twice = await addLookupOption(as("MANAGER"), "price-list", { name: "avondale prices", from: "Retail" });
    expect(twice).toMatchObject({ status: 400, body: { fieldErrors: { name: "There is already a price list called Avondale prices." } } });
    expect((await addLookupOption(as("STOCK_CLERK"), "price-list", { name: "Mine" })).status).toBe(403);
  });
});
