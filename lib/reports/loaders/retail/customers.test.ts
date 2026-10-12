/**
 * Customers (`retail-customers`, CUS-02) paged in the database, against the
 * test database: spend in 12 months nets voids and refunds, visits leave a
 * voided sale out, the tier comes from the spend or a live hold, each filter
 * and sort, totals equal to a SQL sum over the filtered customers, search by
 * phone digits, card digits and code, and a binned customer never lists.
 */
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { CUSTOMER_REPORTS } from "@/lib/reports/definitions/retail/customers";
import { resolveListQuery } from "@/lib/reports/list-query";
import type { ListQuery } from "@/lib/reports/types";
import { customerFigures } from "@/lib/retail/customers/stats";
import { dropLoyaltyShops, ledgerRow, loyaltyShop, testSale } from "@/lib/retail/loyalty/test-fixtures";

import { CUSTOMER_LOADERS } from "./customers";

const LIST = CUSTOMER_REPORTS[0]!.list!;
const loader = CUSTOMER_LOADERS["retail-customers"]!;
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

let shop: Awaited<ReturnType<typeof loyaltyShop>>;
let options: Awaited<ReturnType<NonNullable<typeof loader.options>>>;
const ids: Record<string, string> = {};

const ctx = () => ({ companyId: shop.companyId, userId: shop.ownerId, role: "SUPERADMIN" });
const page = (given: Partial<ListQuery> = {}) =>
  loader.page!(ctx(), resolveListQuery(LIST, { page: 1, size: 25, filters: {}, ...given }, options, { role: "SUPERADMIN", seeCost: true, defaultSite: null }));
const names = async (given: Partial<ListQuery> = {}) => (await page(given)).rows.map((row) => row.name);

async function customer(name: string, data: Partial<Prisma.CustomerUncheckedCreateInput> = {}) {
  const row = await prisma.customer.create({ data: { companyId: shop.companyId, name, ...data }, select: { id: true } });
  ids[name] = row.id;
  return row.id;
}

beforeAll(async () => {
  shop = await loyaltyShop("CustomersList");
  // The fixture's Tapiwa: the board's number, code and card.
  ids["Tapiwa Marange"] = shop.customerId;
  await prisma.customer.update({
    where: { id: shop.customerId },
    data: { phone: "+263774123388", code: "CUS-00141", cardNo: "600914000141", marketingConsent: true },
  });
  // US$1,600 ten days ago, US$100 of it refunded; a US$50 sale voided (its VOID nets it): US$1,500, one visit, Gold.
  const big = await testSale(shop, { total: "1600.00", customerId: shop.customerId, postedAt: ago(10) });
  await testSale(shop, { total: "-100.00", customerId: shop.customerId, saleType: "REFUND", sourceSaleId: big, postedAt: ago(9) });
  const voided = await testSale(shop, { total: "50.00", customerId: shop.customerId, postedAt: ago(8) });
  await prisma.retailSale.update({ where: { id: voided }, data: { status: "VOIDED" } });
  await testSale(shop, { total: "-50.00", customerId: shop.customerId, saleType: "VOID", sourceSaleId: voided, postedAt: ago(8) });
  // Two years ago: outside the 12 months.
  await testSale(shop, { total: "900.00", customerId: shop.customerId, postedAt: ago(500) });
  await ledgerRow(shop, { customerId: shop.customerId, kind: "EARNED", points: 1500 });

  // Silver by spend, Gold by a hold that has not run out.
  await customer("Nyasha Gwenzi", { phone: "+263712209014", code: "CUS-00142", cardNo: "600914000142", tierHeld: "Gold", tierHeldUntil: ago(-30) });
  await testSale(shop, { total: "600.00", customerId: ids["Nyasha Gwenzi"], postedAt: ago(45) });
  await ledgerRow(shop, { customerId: ids["Nyasha Gwenzi"]!, kind: "EARNED", points: 600 });

  // Bronze, last seen 100 days ago; a hold that ran out does not count.
  await customer("Rudo Chirwa", { phone: "+263785527710", code: "CUS-00143", cardNo: "600914000143", tierHeld: "Gold", tierHeldUntil: ago(5) });
  await testSale(shop, { total: "120.00", customerId: ids["Rudo Chirwa"], postedAt: ago(100) });

  // Never been: no sale at all.
  await customer("Simba Mutasa", { phone: "+263718840397", code: "CUS-00144", cardNo: "600914000144" });
  // In the bin: never listed.
  await customer("Binned Banda", { phone: "+263783015521", archivedAt: new Date(), isActive: false });
  await testSale(shop, { total: "5000.00", customerId: ids["Binned Banda"], postedAt: ago(3) });

  options = (await loader.options!(ctx())) as typeof options;
}, 120_000);

afterAll(async () => {
  await dropLoyaltyShops([shop.companyId]);
}, 60_000);

describe("the figures", () => {
  it("nets voids and refunds in the 12 months' spend, and leaves a voided sale out of visits", async () => {
    const row = (await page()).rows.find((entry) => entry.id === shop.customerId)!;
    expect(row).toMatchObject({ spend12m: 1500, visits: 1, points: 1500, tier: "Gold", tierTone: "gold", phone: "+263 77 412 3388" });
    expect(row.lastVisitAt).not.toBeNull();
    const [figures] = await customerFigures(shop.companyId, [shop.customerId]);
    expect(figures).toMatchObject({ spend12m: 1500, visits: 1, points: 1500, worth: 15, tier: "Gold" });
  });

  it("takes the tier from a live hold, and from the spend once a hold has run out", async () => {
    const rows = (await page()).rows;
    expect(rows.find((row) => row.name === "Nyasha Gwenzi")).toMatchObject({ tier: "Gold", spend12m: 600 });
    expect(rows.find((row) => row.name === "Rudo Chirwa")).toMatchObject({ tier: "Bronze", tierTone: "neutral", spend12m: 120 });
    expect(rows.find((row) => row.name === "Simba Mutasa")).toMatchObject({ tier: "Bronze", visits: 0, lastVisitAt: null, spend12m: 0 });
  });
});

describe("the list", () => {
  it("never lists a binned customer", async () => {
    expect(await names()).not.toContain("Binned Banda");
    expect((await page()).total).toBe(4);
  });

  it("sorts most spent first, and by each other sort", async () => {
    expect(await names()).toEqual(["Tapiwa Marange", "Nyasha Gwenzi", "Rudo Chirwa", "Simba Mutasa"]);
    expect(await names({ sort: "name" })).toEqual(["Nyasha Gwenzi", "Rudo Chirwa", "Simba Mutasa", "Tapiwa Marange"]);
    expect((await names({ sort: "points" })).slice(0, 2)).toEqual(["Tapiwa Marange", "Nyasha Gwenzi"]);
    expect((await names({ sort: "last-visit" })).slice(0, 3)).toEqual(["Tapiwa Marange", "Nyasha Gwenzi", "Rudo Chirwa"]);
    expect((await names({ sort: "longest" }))[0]).toBe("Simba Mutasa");
    expect((await names({ sort: "visits" }))[3]).toBe("Simba Mutasa");
    expect(await names({ sort: "newest" })).toHaveLength(4);
  });

  it("narrows by tier, last visit, messages and account", async () => {
    expect(await names({ filters: { tier: "Gold" } })).toEqual(["Tapiwa Marange", "Nyasha Gwenzi"]);
    expect(await names({ filters: { tier: "Bronze" } })).toEqual(["Rudo Chirwa", "Simba Mutasa"]);
    expect(await names({ filters: { lastVisit: "in-30" } })).toEqual(["Tapiwa Marange"]);
    expect(await names({ filters: { lastVisit: "30-90" } })).toEqual(["Nyasha Gwenzi"]);
    expect(await names({ filters: { lastVisit: "over-90" } })).toEqual(["Rudo Chirwa"]);
    expect(await names({ filters: { lastVisit: "never" } })).toEqual(["Simba Mutasa"]);
    expect(await names({ filters: { messages: "agreed" } })).toEqual(["Tapiwa Marange"]);
    expect(await names({ filters: { messages: "not-agreed" } })).toHaveLength(3);
    expect(await names({ filters: { account: "has" } })).toEqual([]);
    expect(await names({ filters: { account: "none" } })).toHaveLength(4);
  });

  it("totals every filtered customer, as a SQL sum does, whatever the page", async () => {
    const all = await page({ size: 25 });
    const second = await page({ size: 25, page: 2 });
    expect(second.totals).toEqual(all.totals);
    const sums = all.rows.reduce(
      (total, row) => ({ visits: total.visits + Number(row.visits), points: total.points + Number(row.points), spend: total.spend + Number(row.spend12m) }),
      { visits: 0, points: 0, spend: 0 },
    );
    expect(all.totals).toEqual({ visits: sums.visits, points: sums.points, spend12m: Math.round(sums.spend * 100) / 100 });
    const gold = await page({ filters: { tier: "Gold" } });
    expect(gold.totals).toEqual({ visits: 2, points: 2100, spend12m: 2100 });
    expect(gold.total).toBe(2);
  });

  it("finds a customer by the end of their phone, their card and their code", async () => {
    expect(await names({ q: "3388" })).toEqual(["Tapiwa Marange"]);
    expect(await names({ q: "0774 123 388" })).toEqual(["Tapiwa Marange"]);
    expect(await names({ q: "600914000141" })).toEqual(["Tapiwa Marange"]);
    expect(await names({ q: "CUS-00142" })).toEqual(["Nyasha Gwenzi"]);
    expect(await names({ q: "rudo" })).toEqual(["Rudo Chirwa"]);
    // Three digits are not enough for a phone.
    expect(await names({ q: "388" })).toEqual([]);
  });
});
