/**
 * The product record's tabs (PRD-04) against a real Postgres: Sales lists
 * every posted line of the product, a refund negative, newest first, with
 * its totals, and nothing voided; Price history every change on any list but
 * a cancelled one, a scheduled one marked; Suppliers its own supplier as the
 * Usual one; each answers only the roles the record shows it to.
 */
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { PRODUCT_REPORTS } from "@/lib/reports/definitions/retail/products";
import { fetchListPage } from "@/lib/reports/request";
import type { ListPageResponse } from "@/lib/reports/types";
import { addTestProduct, defaultListFor, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

let shop: TestShop;
let productId: string;
let itemId: string;
let registerId: string;
let afdisId: string;
const saleIds: Record<string, string> = {};

const session = (role: string) =>
  ({ user: { id: shop.ownerId, companyId: shop.companyId, role, enabledFeatures: ["retail.core", "retail.catalog", "stores.inventory"] }, expires: "" }) as AuthenticatedSession;

async function tab(source: string, role = "SUPERADMIN"): Promise<ListPageResponse | { status: number; error: string }> {
  const answer = await fetchListPage(session(role), source, { page: 1, size: 25, filters: { product: productId } });
  return "rows" in answer ? answer : { status: answer.status, error: answer.error };
}

async function rows(source: string, role = "SUPERADMIN"): Promise<ListPageResponse> {
  const answer = await tab(source, role);
  if (!("rows" in answer)) throw new Error(`refused: ${answer.error}`);
  return answer;
}

const DAY = 24 * 60 * 60 * 1000;

async function sale(saleNo: string, daysAgo: number, quantity: number, options: { refund?: boolean; voided?: boolean } = {}) {
  const postedAt = new Date(Date.now() - daysAgo * DAY);
  const created = await prisma.retailSale.create({
    data: {
      companyId: shop.companyId,
      saleNo,
      siteId: shop.mainId,
      registerId,
      cashierId: shop.managerId,
      cashierName: "Tafara Nyathi",
      saleType: options.refund ? "REFUND" : "SALE",
      status: options.voided ? "VOIDED" : "POSTED",
      totalAmount: new Prisma.Decimal(quantity * 18.25),
      postedAt,
      lines: {
        create: {
          companyId: shop.companyId,
          inventoryItemId: itemId,
          productId,
          itemName: "Amarula Cream 750ml",
          quantity: new Prisma.Decimal(quantity),
          unitPrice: new Prisma.Decimal("18.25"),
          lineTotal: new Prisma.Decimal(quantity * 18.25),
        },
      },
    },
    select: { id: true },
  });
  saleIds[saleNo] = created.id;
}

beforeAll(async () => {
  shop = await makeTestShop("ProductTabs");
  afdisId = (await prisma.vendor.create({ data: { companyId: shop.companyId, name: "Afdis Distillers" }, select: { id: true } })).id;
  await prisma.vendor.create({ data: { companyId: shop.companyId, name: "Delta Beverages" } });
  const created = await addTestProduct(shop.companyId, {
    name: "Amarula Cream 750ml",
    price: "16.90",
    cost: "13.03",
    supplierId: afdisId,
    categoryId: shop.ciderId,
  });
  productId = created.productId;
  itemId = created.itemId;
  // It went on the list a month ago.
  const month = new Date(Date.now() - 30 * DAY);
  await prisma.productPriceChange.updateMany({ where: { productId, source: "ADDED" }, data: { effectiveAt: month, appliedAt: month } });
  registerId = (
    await prisma.retailRegister.create({ data: { companyId: shop.companyId, code: "FRONT", name: "Front till", siteId: shop.mainId }, select: { id: true } })
  ).id;

  await sale("SALE-31790", 6, 1);
  await sale("SALE-31840", 4, 2);
  await sale("SALE-31862", 4 - 0.5, 1);
  await sale("REF-0004", 3, -1, { refund: true });
  await sale("SALE-31801", 2, 5, { voided: true });
  // Before the 30 days the tab opens on.
  await sale("SALE-30001", 45, 3);

  const listId = await defaultListFor(shop.companyId);
  const change = (fromPrice: string | null, toPrice: string, daysAgo: number, extra: Partial<Prisma.ProductPriceChangeUncheckedCreateInput> = {}) =>
    prisma.productPriceChange.create({
      data: {
        companyId: shop.companyId,
        priceListId: listId,
        productId,
        fromPrice: fromPrice === null ? null : new Prisma.Decimal(fromPrice),
        toPrice: new Prisma.Decimal(toPrice),
        source: "TYPED",
        effectiveAt: new Date(Date.now() - daysAgo * DAY),
        appliedAt: new Date(Date.now() - daysAgo * DAY),
        createdById: shop.ownerId,
        ...extra,
      },
    });
  await change("16.90", "17.50", 20);
  await change("17.50", "18.25", 4);
  await change("18.25", "19.00", -2, { appliedAt: null });
  await change("18.25", "20.00", -3, { appliedAt: null, cancelledAt: new Date() });
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  // A sale line holds its stock line; the sales go first.
  await prisma.retailSale.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
});

describe("Sales", () => {
  it("lists the posted lines of 30 days, newest first, a refund negative, each linking its sale, with totals", async () => {
    const page = await rows("retail-product-sales");
    expect(page.rows.map((row) => [row.saleNo, row.quantity, row.total])).toEqual([
      ["REF-0004", -1, -18.25],
      ["SALE-31862", 1, 18.25],
      ["SALE-31840", 2, 36.5],
      ["SALE-31790", 1, 18.25],
    ]);
    expect(page.rows[1]).toMatchObject({ saleId: saleIds["SALE-31862"], till: "Front till", cashier: "Tafara Nyathi", price: 18.25 });
    expect(page.total).toBe(4);
    expect(page.totals).toMatchObject({ quantity: 3, total: 54.75 });
  });

  it("is read by every role that reads the product", async () => {
    expect((await rows("retail-product-sales", "CASHIER")).total).toBe(4);
    expect((await rows("retail-product-sales", "STOCK_CLERK")).total).toBe(4);
  });
});

describe("Price history", () => {
  it("lists every change but a cancelled one, newest first, the scheduled one marked, with how it changed", async () => {
    const page = await rows("retail-product-price-history");
    expect(page.rows.map((row) => [row.from, row.to, row.how, row.state])).toEqual([
      [18.25, 19, "Typed", "Scheduled"],
      [17.5, 18.25, "Typed", null],
      [16.9, 17.5, "Typed", null],
      [null, 16.9, "Added", null],
    ]);
    expect(page.rows[0]).toMatchObject({ list: "Retail", by: "Tendai Mhlanga" });
    expect(String(page.rows[0]!.whenText)).toMatch(/^From /);
  });
});

describe("Suppliers", () => {
  it("names its own supplier as the usual one, its delivery figures blank rather than none", async () => {
    const page = await rows("retail-product-suppliers");
    expect(page.rows.map((row) => [row.supplier, row.usual, row.delivered, row.lastCost, row.lastDelivered])).toEqual([
      ["Afdis Distillers", "Usual", null, null, null],
    ]);
    expect(page.rows[0]).toMatchObject({ supplierId: afdisId, lastDeliveredText: null });
    expect(page.totals.delivered ?? null).toBeNull();
  });

  it("is refused to roles that may not see what the shop pays, and read by the bookkeeper", async () => {
    expect(await tab("retail-product-suppliers", "CASHIER")).toMatchObject({ status: 403 });
    expect(await tab("retail-product-suppliers", "STOCK_CLERK")).toMatchObject({ status: 403 });
    expect((await rows("retail-product-suppliers", "FINANCE_OFFICER")).total).toBe(1);
  });
});

describe("the tabs' columns", () => {
  // A track's least width: "110px", or the floor of "minmax(80px,1fr)".
  const least = (width: string | undefined) => Number(/^(?:minmax\()?(\d+)px/.exec(width ?? "")?.[1] ?? 0);
  const spec = (key: string) => PRODUCT_REPORTS.find((report) => report.key === key)!.list!;

  it("fit the record's main column (776px at 1440), so Total and its Σ are never cut off", () => {
    for (const key of ["retail-product-sales", "retail-product-price-history", "retail-product-suppliers"]) {
      const sum = spec(key).columns.reduce((total, column) => total + least(column.width), 0);
      expect(sum, key).toBeLessThanOrEqual(740);
    }
  });

  it("leads nowhere from a price-history row: each is of the product already open", () => {
    expect(spec("retail-product-price-history").rowHref).toBe("");
  });
});
