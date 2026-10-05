/**
 * Products' list, against a real database (20-products PRD-01): the
 * `retail-products` loader gives each product its on hand, 30 days of sales
 * net of refunds, cover and stock word; the list's tabs count Selling, Low
 * stock, Archived and All; and stopping and restarting a sale moves a product
 * between the tabs with one audit event each — refused for a binned product
 * and for another company's.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { money, quantity } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { PRODUCT_REPORTS } from "@/lib/reports/definitions/retail/products";
import { resolveListQuery, runList, type ListContext } from "@/lib/reports/list-query";
import { PRODUCT_LOADERS } from "@/lib/reports/loaders/retail/products";
import type { ListSpec } from "@/lib/reports/types";
import { upsertShelfListing } from "@/lib/retail/shelf-listing";

import { parseSellingIds, SellingRefusal, setProductsSelling } from "./selling";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let otherCompanyId: string;
let siteId: string;
let userId: string;
const ids: Record<string, string> = {};

const spec = PRODUCT_REPORTS[0]!.list as ListSpec;
const actor = () => ({ companyId, userId, userName: "Tafara Nyathi", userRole: "MANAGER" });

async function product(code: string, name: string, onHand: number, reorderAt: number, price: number) {
  const locationId = (await prisma.stockLocation.findFirstOrThrow({ where: { siteId }, select: { id: true } })).id;
  const item = await prisma.inventoryItem.create({
    data: {
      itemCode: `${code}-${stamp}`,
      name,
      category: "OTHER",
      unit: "bottle",
      siteId,
      locationId,
      currentStock: quantity(onHand),
      minStock: quantity(reorderAt),
    },
    select: { id: true },
  });
  ids[code] = await upsertShelfListing({
    companyId,
    productId: null,
    sku: `${code}-${stamp}`,
    name,
    inventoryItemId: item.id,
    unitPrice: price,
    taxPercent: 15,
  });
  return item.id;
}

async function sell(code: string, itemId: string, units: number, saleType: "SALE" | "REFUND", daysAgo: number) {
  const at = new Date(Date.now() - daysAgo * 86_400_000);
  const sign = saleType === "SALE" ? 1 : -1;
  const sale = await prisma.retailSale.create({
    data: {
      companyId,
      saleNo: `S-${code}-${saleType}-${daysAgo}-${stamp}`,
      siteId,
      cashierId: userId,
      cashierName: "Chipo Dube",
      saleType,
      status: "POSTED",
      subtotal: money(0),
      discountAmount: money(0),
      taxAmount: money(0),
      totalAmount: money(0),
      tenderedAmount: money(0),
      changeAmount: money(0),
      currency: "USD",
      exchangeRate: quantity(1),
      baseAmount: money(0),
      postedAt: at,
    },
    select: { id: true },
  });
  await prisma.retailSaleLine.create({
    data: {
      companyId,
      saleId: sale.id,
      inventoryItemId: itemId,
      productId: ids[code]!,
      itemName: code,
      quantity: quantity(sign * units),
      unitPrice: money(1),
      discountAmount: money(0),
      taxAmount: money(0),
      lineTotal: money(sign * units),
    },
  });
}

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Products ${stamp}`, slug: `prd-${stamp}` }, select: { id: true } })).id;
  otherCompanyId = (
    await prisma.company.create({ data: { name: `Other ${stamp}`, slug: `prd-o-${stamp}` }, select: { id: true } })
  ).id;
  userId = (
    await prisma.user.create({
      data: { email: `prd01-${stamp}@example.test`, name: "Tafara Nyathi", role: "MANAGER", companyId, password: "x" },
      select: { id: true },
    })
  ).id;
  siteId = (await prisma.site.create({ data: { companyId, code: `M-${stamp}`, name: "Harare Main Branch" }, select: { id: true } })).id;
  await prisma.stockLocation.create({ data: { siteId, code: `F-${stamp}`, name: "Shop floor" } });

  const amarula = await product("AMARULA", "Amarula Cream 750ml", 13, 12, 18.25);
  const coke = await product("COKE", "Coca-Cola 500ml", 180, 48, 0.75);
  await product("BOLS", "Bols Brandy 750ml", 6, 6, 14.2);
  // 66 sold and 2 refunded in the window, and 40 sold before it: 64 counted.
  await sell("AMARULA", amarula, 66, "SALE", 3);
  await sell("AMARULA", amarula, 2, "REFUND", 2);
  await sell("AMARULA", amarula, 40, "SALE", 45);
  await sell("COKE", coke, 216, "SALE", 10);
});

afterAll(async () => {
  for (const id of [companyId, otherCompanyId].filter(Boolean)) {
    await prisma.platformAuditEvent.deleteMany({ where: { companyId: id } });
    await prisma.retailSaleLine.deleteMany({ where: { companyId: id } });
    await prisma.retailSale.deleteMany({ where: { companyId: id } });
    await prisma.inventoryItem.deleteMany({ where: { site: { companyId: id } } });
    await prisma.stockLocation.deleteMany({ where: { site: { companyId: id } } });
    await prisma.productPrice.deleteMany({ where: { companyId: id } });
    await prisma.priceList.deleteMany({ where: { companyId: id } });
    await prisma.product.deleteMany({ where: { companyId: id } });
    await prisma.site.deleteMany({ where: { companyId: id } });
    await prisma.user.deleteMany({ where: { companyId: id } });
    await prisma.company.deleteMany({ where: { id } });
  }
});

const ctx: ListContext = {
  role: "MANAGER",
  userId: "u",
  now: new Date(),
  timeZone: "Africa/Harare",
  can: () => true,
  seeCost: true,
};

/** The event's payload, stored as JSON text or as JSON. */
const payloadOf = (raw: unknown): { name?: string } => (typeof raw === "string" ? JSON.parse(raw) : (raw as { name?: string }));

async function list(query: { tab?: string; filters?: Record<string, string> } = {}) {
  const loader = PRODUCT_LOADERS["retail-products"]!;
  const reportCtx = { companyId, userId: "u", role: "MANAGER" };
  const loaded = await loader.options!(reportCtx);
  const resolved = resolveListQuery(spec, { page: 1, size: 50, filters: query.filters ?? {}, tab: query.tab }, loaded, ctx);
  const { rows } = await loader.load(reportCtx, {});
  return runList(spec, rows, resolved, ctx, { loaded }).result;
}

describe("the Products list (retail-products)", () => {
  it("each row's figures: on hand with its unit, sold net of refunds, cover, price, VAT", async () => {
    const page = await list();
    const amarula = page.rows.find((row) => row.id === ids.AMARULA)!;
    expect(amarula).toMatchObject({
      name: "Amarula Cream 750ml",
      onHand: 13,
      unitWord: "bottles",
      sold30: 64,
      cover: "6 days",
      coverPct: 30,
      price: 18.25,
      vat: "15%",
      stock: "Low",
      flag: "Low",
      cardMeta: `AMARULA-${stamp} · 13 bottles · 6 days`,
    });
    const bols = page.rows.find((row) => row.id === ids.BOLS)!;
    expect(bols).toMatchObject({ sold30: 0, cover: null, stock: "Low" });
    expect(page.totals.sold30).toBe(64 + 216);
  });

  it("tabs count before filters; Low stock is selling and low", async () => {
    const page = await list({ tab: "low" });
    expect(page.tabs).toEqual({ selling: 3, low: 2, archived: 0, all: 3 });
    expect(page.rows.map((row) => row.name).sort()).toEqual(["Amarula Cream 750ml", "Bols Brandy 750ml"]);
    const instock = await list({ filters: { stock: "low" } });
    expect(instock.total).toBe(2);
  });

  it("stopping a sale moves products to Archived with one event each; selling again brings them back", async () => {
    expect(await setProductsSelling({ actor: actor(), ids: [ids.BOLS!, ids.COKE!], selling: false })).toBe(2);
    // Already archived: left alone, not counted.
    expect(await setProductsSelling({ actor: actor(), ids: [ids.BOLS!], selling: false })).toBe(0);
    let page = await list({ tab: "archived" });
    expect(page.tabs).toEqual({ selling: 1, low: 1, archived: 2, all: 3 });
    const bols = page.rows.find((row) => row.id === ids.BOLS)!;
    // An archived product is never low; the card says Archived.
    expect(bols).toMatchObject({ state: "Archived", stock: "In stock", flag: "Archived" });

    const events = await prisma.platformAuditEvent.findMany({
      where: { companyId, entityId: { in: [ids.BOLS!, ids.COKE!] } },
      select: { eventType: true, entityType: true, payloadJson: true },
    });
    expect(events.map((event) => event.eventType).sort()).toEqual(["RETAIL_PRODUCT.ARCHIVED", "RETAIL_PRODUCT.ARCHIVED"]);
    expect(events.every((event) => event.entityType === "Product")).toBe(true);
    expect(events.map((event) => payloadOf(event.payloadJson).name).sort()).toEqual(["Bols Brandy 750ml", "Coca-Cola 500ml"]);

    expect(await setProductsSelling({ actor: actor(), ids: [ids.COKE!], selling: true })).toBe(1);
    page = await list();
    expect(page.tabs).toEqual({ selling: 2, low: 1, archived: 1, all: 3 });
    expect(
      await prisma.platformAuditEvent.count({ where: { companyId, entityId: ids.COKE!, eventType: "RETAIL_PRODUCT.UNARCHIVED" } }),
    ).toBe(1);
  });

  it("refuses another company's product, a binned one, and a bad request, changing nothing", async () => {
    const refusal = async (promise: Promise<unknown>) => {
      try {
        await promise;
      } catch (error) {
        return error as SellingRefusal;
      }
      throw new Error("expected a refusal");
    };
    const elsewhere = await refusal(
      setProductsSelling({ actor: { ...actor(), companyId: otherCompanyId }, ids: [ids.AMARULA!], selling: false }),
    );
    expect([elsewhere.status, elsewhere.message]).toEqual([404, "Product not found"]);

    await prisma.product.update({ where: { id: ids.BOLS! }, data: { archivedAt: new Date() } });
    const binned = await refusal(setProductsSelling({ actor: actor(), ids: [ids.AMARULA!, ids.BOLS!], selling: false }));
    expect([binned.status, binned.message]).toEqual([409, "Bols Brandy 750ml is in the bin. Restore it to change it."]);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: ids.AMARULA! } })).isActive).toBe(true);
    // The bin is not on the list at all.
    expect((await list({ tab: "all" })).tabs?.all).toBe(2);

    expect(parseSellingIds({ ids: [] })).toMatchObject({ error: "Tick at least one product." });
    expect(parseSellingIds({ ids: ["nope"] })).toMatchObject({ error: "That is not one of this shop's products." });
    expect(parseSellingIds({ ids: Array.from({ length: 501 }, () => crypto.randomUUID()) })).toMatchObject({
      error: "Tick 500 or fewer products.",
    });
  });
});
