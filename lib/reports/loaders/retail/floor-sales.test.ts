/**
 * Sales (`retail-sales`) paged in the database, against the test database:
 * the tabs count every sale whatever the filters say, the totals leave a
 * voided sale's money out and are the same on every page, a cashier sees
 * only what they rang, Till narrows the rows and the totals, search finds a
 * sale by what was on it and by its fiscal receipt, and Site starts at the
 * caller's own site.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { FLOOR_REPORTS } from "@/lib/reports/definitions/retail/floor";
import { canReadList, publicListSpec, resolveListQuery } from "@/lib/reports/list-query";
import type { ListQuery } from "@/lib/reports/types";
import { defaultSiteFor } from "@/lib/retail/floor/default-site";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { addTestSale, destroySalesShop, makeSalesShop, type SalesShop } from "@/lib/retail/floor/test-fixtures";

import { FLOOR_SALES_LOADERS } from "./floor-sales";

const LIST = FLOOR_REPORTS.find((source) => source.key === "retail-sales")!.list!;
const loader = FLOOR_SALES_LOADERS["retail-sales"]!;
let shop: SalesShop;
let options: Awaited<ReturnType<NonNullable<typeof loader.options>>>;

const owner = () => ({ companyId: shop.companyId, userId: shop.ownerId, role: "SUPERADMIN" });
const page = (ctx: { companyId: string; userId: string; role: string }, given: Partial<ListQuery> = {}) =>
  loader.page!(
    ctx,
    resolveListQuery(LIST, { page: 1, size: 25, filters: {}, ...given }, options, { role: ctx.role, seeCost: true, defaultSite: null }),
  );

beforeAll(async () => {
  shop = await makeSalesShop("FloorSales");
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
  const ice = (quantity: number) => ({ item: shop.ice, name: "Ice 2kg bag", quantity, price: "2.20", cost: "1.10" });
  const jameson = { item: shop.johnnie, name: "Jameson Irish Whiskey 750ml", quantity: 1, price: "27.90", cost: "22.15" };
  const sold = await addTestSale(shop, { saleNo: "SALE-00010", at: minutesAgo(30), lines: [jameson], customerId: shop.tinashe });
  await addTestSale(shop, {
    saleNo: "RFD-0044",
    at: minutesAgo(20),
    saleType: "REFUND",
    sourceSaleId: sold.id,
    customerId: shop.tinashe,
    lines: [{ ...jameson, quantity: -1, sourceLineId: sold.lineIds[0] }],
  });
  await addTestSale(shop, { saleNo: "SALE-00011", at: minutesAgo(15), lines: [ice(2)], till: "back", cashierId: shop.farai, customerId: shop.tapiwa });
  const voided = await addTestSale(shop, { saleNo: "SALE-00012", at: minutesAgo(10), lines: [ice(1)], till: "back", cashierId: shop.farai, status: "VOIDED" });
  await addTestSale(shop, { saleNo: "VOID-0001", at: minutesAgo(9), saleType: "VOID", sourceSaleId: voided.id, lines: [ice(-1)], till: "back", cashierId: shop.farai });
  const signed = await addTestSale(shop, { saleNo: "SALE-00013", at: minutesAgo(5), lines: [ice(3)], reviewReason: "Discount over the limit." });
  await prisma.fiscalReceipt.create({ data: { companyId: shop.companyId, retailSaleId: signed.id, status: "SUCCESS", receiptNumber: "FDMS 0441-2209 / 31866" } });
  // Last week: in All, not in Today.
  await addTestSale(shop, { saleNo: "SALE-00001", at: new Date(Date.now() - 8 * 24 * 3600_000), lines: [ice(1)] });
  options = (await loader.options!(owner())) as typeof options;
}, 120_000);

afterAll(async () => {
  await destroySalesShop(shop);
}, 60_000);

describe("retail-sales paged in the database", () => {
  it("never lists a void document, and counts the tabs whatever the filters say", async () => {
    const all = await page(owner(), { tab: "all" });
    expect(all.rows.map((row) => row.saleNo)).toEqual(["SALE-00013", "SALE-00012", "SALE-00011", "RFD-0044", "SALE-00010", "SALE-00001"]);
    expect(all.tabs).toEqual({ today: 5, refunds: 1, voids: 1, all: 6 });
    const narrowed = await page(owner(), { tab: "today", q: "nothing like this", filters: { till: shop.backTill } });
    expect(narrowed.total).toBe(0);
    expect(narrowed.tabs).toEqual(all.tabs);
  });

  it("totals every filtered row, leaving the voided sale's money out", async () => {
    const today = await page(owner(), { tab: "today" });
    // 27.90 − 27.90 + 4.40 + 6.60; the voided 2.20 is drawn but not counted.
    expect(today.totals).toEqual({ items: 8, total: 11 });
    const voided = today.rows.find((row) => row.saleNo === "SALE-00012")!;
    expect(voided).toMatchObject({ state: "Voided", total: 2.2, counted: null, totalTone: "ink-3" });
    expect(today.rows.find((row) => row.saleNo === "RFD-0044")).toMatchObject({ state: "Refund", total: -27.9, customer: "Tinashe Mavhunga" });
    expect(today.rows.find((row) => row.saleNo === "SALE-00013")).toMatchObject({ state: "To look at", customer: "Walk-in", customerTone: "faint" });
  });

  it("has the same totals on page 2 as on page 1", async () => {
    const first = await page(owner(), { tab: "all", size: 25 });
    const small = resolveListQuery(LIST, { page: 2, size: 25, filters: {}, tab: "all" }, options, { role: "SUPERADMIN", seeCost: true });
    const second = await loader.page!(owner(), { ...small, size: 2 });
    expect(second.page).toBe(2);
    expect(second.rows).toHaveLength(2);
    expect(second.totals).toEqual(first.totals);
  });

  it("shows a cashier only the sales they rang", async () => {
    const farai = await page({ companyId: shop.companyId, userId: shop.farai, role: "CASHIER" }, { tab: "all" });
    expect(farai.rows.map((row) => row.saleNo)).toEqual(["SALE-00012", "SALE-00011"]);
    expect(farai.tabs).toEqual({ today: 2, refunds: 0, voids: 1, all: 2 });
    const resolved = resolveListQuery(LIST, { page: 1, size: 25, filters: { cashier: shop.chipo } }, options, { role: "CASHIER", seeCost: false });
    expect(resolved.filters.cashier).toBe("any");
  });

  it("is read by owners, managers, bookkeepers and cashiers, never a stock clerk", () => {
    const reads = (role: string) => canReadList(LIST, { can: ([resource, action]) => canRetailRoleDo(role, resource, action) });
    expect(["SUPERADMIN", "MANAGER", "FINANCE_OFFICER", "CASHIER"].map(reads)).toEqual([true, true, true, true]);
    expect(reads("STOCK_CLERK")).toBe(false);
    expect(LIST.refusal ?? `Your role cannot view ${LIST.noun}`).toBe("Your role cannot view sales");
  });

  it("narrows the rows and the totals by till", async () => {
    const back = await page(owner(), { tab: "today", filters: { till: shop.backTill } });
    expect(back.rows.map((row) => row.saleNo)).toEqual(["SALE-00012", "SALE-00011"]);
    expect(back.totals).toEqual({ items: 3, total: 4.4 });
  });

  it("finds a sale by a product on it and by its fiscal receipt", async () => {
    const byProduct = await page(owner(), { tab: "all", q: "Jameson" });
    expect(byProduct.rows.map((row) => row.saleNo)).toEqual(["RFD-0044", "SALE-00010"]);
    const byReceipt = await page(owner(), { tab: "all", q: "0441-2209" });
    expect(byReceipt.rows.map((row) => row.saleNo)).toEqual(["SALE-00013"]);
  });

  it("starts Site at the caller's own site", async () => {
    // The owner sees every site: the shop's default site.
    expect(await defaultSiteFor(shop.companyId, shop.ownerId)).toBe(shop.mainId);
    // Farai works at Borrowdale only.
    await prisma.user.update({ where: { id: shop.farai }, data: { allSites: false, siteAccess: { create: { siteId: shop.secondId!, companyId: shop.companyId } } } });
    const faraiSite = await defaultSiteFor(shop.companyId, shop.farai);
    expect(faraiSite).toBe(shop.secondId);
    const ctx = { role: "SUPERADMIN", can: () => true, seeCost: true, defaultSite: faraiSite };
    const resolved = resolveListQuery(LIST, { page: 1, size: 25, filters: {} }, options, ctx);
    expect(resolved.filters.site).toBe(shop.secondId);
    expect(publicListSpec(LIST, ctx, options).filters.find((filter) => filter.key === "site")).toMatchObject({ default: shop.secondId });
    const atBorrowdale = await loader.page!(owner(), { ...resolved, tab: "all" });
    expect(atBorrowdale.rows.map((row) => row.saleNo)).toEqual(["SALE-00012", "SALE-00011"]);
  });
});
