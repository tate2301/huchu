import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { createBundle } from "@/lib/retail/bundles/service";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";
import type { PricingSnapshot } from "@/lib/retail/pricing/engine";
import { priceSale } from "@/lib/retail/pricing/sale";
import { createPack } from "@/lib/retail/products/packs";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

/**
 * `pos/sales` with bundles and cases (PRD-08) on a paired till, against the
 * test database: a Braai pack rung as one totals its price, its component
 * lines summing to it and naming it, stock off each; three Savanna come to
 * the buy-more price on their own; a Castle single with none on the shelf
 * opens a case inside the sale, under one BRK reference, with no journal of
 * its own, and the sale's journal balances. The till's own sum over what
 * `pos/catalog` and `pos/pricing` give it comes to what the server stores; a
 * cashier's discount on a line a deal splits is shared over its pieces; a
 * sale promotion takes nothing off a bundled unit.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { GET as CATALOG } from "../catalog/route";
import { GET as PRICING } from "../pricing/route";
import { POST as SELL } from "./route";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const key = `bundles-key-${stamp}`;
let shop: TestShop;
let shiftId = "";
const ids: Record<string, string> = {};
const items: Record<string, string> = {};
let braaiId = "";
let promotionId = "";

beforeAll(async () => {
  shop = await makeTestShop("Sale bundles");
  // The sale's journal is read at once: this shop posts with every sale (SET-09).
  await prisma.retailPostingSettings.create({ data: { companyId: shop.companyId, schedule: "EVERY_SALE" } });
  const category = async (name: string) =>
    (await prisma.retailCategory.create({ data: { companyId: shop.companyId, name, ageRestricted: false }, select: { id: true } })).id;
  const beer = await category("Beer");
  const ice = await category("Ice and mixers");
  const ciders = await category("Ciders");
  const add = async (code: string, name: string, price: string, cost: string, categoryId: string, onHand: number) => {
    const made = await addTestProduct(shop.companyId, { name, price, cost, categoryId, ageCheck: false }, { siteId: shop.mainId, onHand });
    ids[code] = made.productId;
    items[code] = made.itemId;
  };
  await add("castle", "Castle Lager 340ml", "1.20", "0.86", beer, 60);
  await add("ice", "Ice 2kg bag", "1.50", "0.60", ice, 10);
  await add("charcoal", "Charcoal 4kg", "3.90", "2.10", ice, 10);
  await add("savanna", "Savanna Dry 330ml", "1.85", "1.38", ciders, 20);
  await add("hunters", "Hunter’s Gold 330ml", "1.85", "1.31", ciders, 20);
  braaiId = (
    await createBundle(shop.owner(), {
      kind: "FIXED_SET",
      name: "Braai pack",
      items: [
        { productId: ids.castle!, quantity: 6 },
        { productId: ids.ice!, quantity: 1 },
        { productId: ids.charcoal!, quantity: 1 },
      ],
      price: "11.00",
      days: "EVERY_DAY",
      until: null,
    })
  ).id;
  await createBundle(shop.owner(), {
    kind: "BUY_MORE",
    name: "Any 3 ciders",
    items: [
      { productId: ids.savanna!, quantity: 1 },
      { productId: ids.hunters!, quantity: 1 },
    ],
    buyQuantity: 3,
    price: "5.00",
    days: "EVERY_DAY",
    until: null,
  });

  // Savanna may come off at most 30%; a cashier may give up to 40% without a manager.
  await prisma.product.update({ where: { id: ids.savanna! }, data: { maxDiscountPercent: new Prisma.Decimal(30) } });
  await prisma.retailTillRules.create({ data: { companyId: shop.companyId, maxCashierDiscountPercent: new Prisma.Decimal(40) } });
  promotionId = (
    await prisma.retailPromotion.create({
      data: { companyId: shop.companyId, promoCode: `TEN-${stamp}`, name: "Ten off", type: "PERCENT", value: new Prisma.Decimal(10) },
      select: { id: true },
    })
  ).id;

  const cashierId = (
    await prisma.user.create({
      data: { companyId: shop.companyId, name: "Chipo Dube", role: "CASHIER", email: `chipo-${stamp}@bundles.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  const till = await prisma.retailRegister.create({
    data: { companyId: shop.companyId, siteId: shop.mainId, code: "FRONT", name: "Front till" },
    select: { id: true, code: true, name: true },
  });
  const device = await prisma.retailDevice.create({
    data: { companyId: shop.companyId, registerId: till.id, kind: "BROWSER", label: "Windows PC", keyHash: hashDeviceKey(key), pairedById: shop.ownerId },
    select: { id: true },
  });
  shiftId = (
    await prisma.retailShift.create({
      data: {
        companyId: shop.companyId,
        shiftNo: `SH-${stamp}`,
        registerCode: till.code,
        registerName: till.name,
        registerId: till.id,
        deviceId: device.id,
        siteId: shop.mainId,
        cashierId,
        cashierName: "Chipo Dube",
        openedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
      select: { id: true },
    })
  ).id;
  validateSessionMock.mockResolvedValue({
    session: {
      user: { id: cashierId, companyId: shop.companyId, role: "CASHIER", name: "Chipo Dube", email: `chipo-${stamp}@bundles.test`, enabledFeatures: ["retail.core"] },
    },
  });
}, 90_000);

afterAll(async () => {
  if (!shop) return;
  const { companyId } = shop;
  await prisma.retailSalePayment.deleteMany({ where: { sale: { companyId } } });
  await prisma.retailSaleLine.deleteMany({ where: { sale: { companyId } } });
  await prisma.retailSale.deleteMany({ where: { companyId } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await prisma.retailDevice.deleteMany({ where: { companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.retailBundle.deleteMany({ where: { companyId } });
  await prisma.retailPromotion.deleteMany({ where: { companyId } });
  await prisma.retailTillRules.deleteMany({ where: { companyId } });
  await prisma.productPriceChange.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

type Line = { productId: string; quantity: number; unitPrice: number; discountAmount?: number; bundleId?: string; bundleRef?: string };

function sell(ref: string, lines: Line[], pay: number, extra: Record<string, unknown> = {}) {
  return SELL(
    new NextRequest("http://pos.test.localtest.me/api/v2/retail/pos/sales", {
      method: "POST",
      headers: { cookie: `${DEVICE_COOKIE}=${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        clientRef: `${ref}-${stamp}`,
        shiftId,
        idChecked: true,
        items: lines,
        payments: [{ tenderType: "CASH", currency: "USD", amount: pay }],
        ...extra,
      }),
    }),
  ).then(async (response) => ({ status: response.status, body: (await response.json()) as Record<string, unknown> & { id?: string; totalAmount?: unknown } }));
}

/** What the till reads: its shelf (`pos/catalog`) and its price snapshot (`pos/pricing`). */
async function tillReads() {
  const ask = (path: string) => new NextRequest(`http://pos.test.localtest.me${path}`, { headers: { cookie: `${DEVICE_COOKIE}=${key}` } });
  const shelf = (await (await CATALOG(ask("/api/v2/retail/pos/catalog?search="))).json()) as {
    data: Array<{ productId: string; unitPrice: number; taxPercent: number; taxInclusive: boolean }>;
  };
  const snapshot = (await (await PRICING(ask("/api/v2/retail/pos/pricing"))).json()) as PricingSnapshot;
  return { shelf: new Map(shelf.data.map((item) => [item.productId, item])), snapshot };
}

const totalOf = async (saleId: string) => (await prisma.retailSale.findUniqueOrThrow({ where: { id: saleId }, select: { totalAmount: true } })).totalAmount.toFixed(2);

const onHand = async (code: string) => (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: items[code]! }, select: { currentStock: true } })).currentStock.toNumber();

async function balanced(saleId: string) {
  const entries = await prisma.journalEntry.findMany({ where: { companyId: shop.companyId, sourceId: saleId }, select: { lines: { select: { debit: true, credit: true } } } });
  const lines = entries.flatMap((entry) => entry.lines);
  return { entries: entries.length, debit: Math.round(lines.reduce((s, l) => s + l.debit, 0) * 100), credit: Math.round(lines.reduce((s, l) => s + l.credit, 0) * 100) };
}

describe("a sale with bundles", () => {
  it("sells a Braai pack at US$11.00, its lines summing to it and naming it, stock off each", async () => {
    const before = { castle: await onHand("castle"), ice: await onHand("ice"), charcoal: await onHand("charcoal") };
    const sold = await sell(
      "braai",
      [
        { productId: ids.castle!, quantity: 6, unitPrice: 1.2, bundleId: braaiId, bundleRef: "1" },
        { productId: ids.ice!, quantity: 1, unitPrice: 1.5, bundleId: braaiId, bundleRef: "1" },
        { productId: ids.charcoal!, quantity: 1, unitPrice: 3.9, bundleId: braaiId, bundleRef: "1" },
      ],
      11,
    );
    expect(sold.status).toBe(201);
    const sale = await prisma.retailSale.findUniqueOrThrow({ where: { id: sold.body.id! }, include: { lines: true } });
    expect(sale.totalAmount.toFixed(2)).toBe("11.00");
    expect(sale.lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0)).toFixed(2)).toBe("11.00");
    expect(new Set(sale.lines.map((line) => line.bundleId))).toEqual(new Set([braaiId]));
    expect(new Set(sale.lines.map((line) => line.bundleRef))).toEqual(new Set([`${sale.id}:1`]));
    expect([await onHand("castle"), await onHand("ice"), await onHand("charcoal")]).toEqual([before.castle - 6, before.ice - 1, before.charcoal - 1]);
    const posted = await balanced(sale.id);
    expect(posted.entries).toBeGreaterThan(0);
    expect(posted.debit).toBe(posted.credit);
  });

  it("refuses a set that is not the bundle", async () => {
    const sold = await sell("not-braai", [{ productId: ids.castle!, quantity: 5, unitPrice: 1.2, bundleId: braaiId, bundleRef: "1" }], 6);
    expect(sold).toMatchObject({
      status: 400,
      body: { error: "That is not a Braai pack: it needs 6 × Castle Lager 340ml, 1 × Ice 2kg bag, 1 × Charcoal 4kg." },
    });
  });

  it("takes three Savanna at US$5.00 on its own, and a fourth at its own price", async () => {
    const three = await sell("ciders", [{ productId: ids.savanna!, quantity: 3, unitPrice: 1.85 }], 5);
    expect(three.status).toBe(201);
    const sale = await prisma.retailSale.findUniqueOrThrow({ where: { id: three.body.id! }, include: { lines: true } });
    expect(sale.totalAmount.toFixed(2)).toBe("5.00");
    expect(sale.lines[0]!.bundleId).not.toBeNull();

    const four = await sell("ciders-4", [{ productId: ids.savanna!, quantity: 2, unitPrice: 1.85 }, { productId: ids.hunters!, quantity: 2, unitPrice: 1.85 }], 10);
    expect(four.status).toBe(201);
    const fourth = await prisma.retailSale.findUniqueOrThrow({ where: { id: four.body.id! }, include: { lines: true } });
    expect(fourth.totalAmount.toFixed(2)).toBe("6.85");
    expect(fourth.lines).toHaveLength(3);
  });
});

describe("the till and the server come to one total", () => {
  it("prices a basket with a buy-more deal and a split line as the server stores it", async () => {
    const { shelf, snapshot } = await tillReads();
    expect(snapshot.bundles.map((bundle) => bundle.name).sort()).toEqual(["Any 3 ciders", "Braai pack"]);
    const basket = [
      { productId: ids.savanna!, quantity: 3, discountAmount: 0 },
      { productId: ids.hunters!, quantity: 2, discountAmount: 0.3 },
      { productId: ids.castle!, quantity: 1, discountAmount: 0 },
    ];
    // As the till's checkout memo prices it (`components/retail/till/state.tsx`).
    const till = priceSale({
      lines: basket.map((item) => {
        const listed = shelf.get(item.productId)!;
        return {
          key: item.productId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: listed.unitPrice,
          taxPercent: listed.taxPercent,
          taxInclusive: listed.taxInclusive,
          lineDiscount: item.discountAmount,
        };
      }),
      bundles: snapshot.bundles,
      at: new Date(),
      siteId: snapshot.siteId,
    });
    if ("error" in till) throw new Error(till.error);
    expect(till.bundleSaving).toBe(0.55);

    const sold = await sell(
      "till-total",
      basket.map((item) => ({ ...item, unitPrice: shelf.get(item.productId)!.unitPrice })),
      till.checkout.total,
      { overrideReason: "Dented can" },
    );
    expect(sold.status).toBe(201);
    expect(await totalOf(sold.body.id!)).toBe(till.checkout.total.toFixed(2));
  });
});

describe("the cashier's discount on a line a deal splits", () => {
  it("is judged against the ceiling on the line as rung: US$1.00 off four Savanna sells", async () => {
    const sold = await sell("savanna-off", [{ productId: ids.savanna!, quantity: 4, unitPrice: 1.85, discountAmount: 1 }], 5.85, {
      overrideReason: "Dented cans",
    });
    expect(sold.status).toBe(201);
    expect(await totalOf(sold.body.id!)).toBe("5.85");
  });

  it("is given in full: four Hunter's with US$2.50 off come to US$4.35", async () => {
    const sold = await sell("hunters-off", [{ productId: ids.hunters!, quantity: 4, unitPrice: 1.85, discountAmount: 2.5 }], 4.35, {
      overrideReason: "Last of the batch",
    });
    expect(sold.status).toBe(201);
    const sale = await prisma.retailSale.findUniqueOrThrow({ where: { id: sold.body.id! }, include: { lines: { orderBy: { quantity: "asc" } } } });
    expect(sale.totalAmount.toFixed(2)).toBe("4.35");
    expect(sale.lines.map((entry) => [entry.quantity.toNumber(), entry.lineTotal.toFixed(2)])).toEqual([
      [1, "1.23"],
      [3, "3.12"],
    ]);
  });
});

describe("a sale promotion beside a bundle", () => {
  it("takes nothing off a Braai pack, and its 10% off the Castle beside it", async () => {
    const sold = await sell(
      "braai-promo",
      [
        { productId: ids.castle!, quantity: 6, unitPrice: 1.2, bundleId: braaiId, bundleRef: "1" },
        { productId: ids.ice!, quantity: 1, unitPrice: 1.5, bundleId: braaiId, bundleRef: "1" },
        { productId: ids.charcoal!, quantity: 1, unitPrice: 3.9, bundleId: braaiId, bundleRef: "1" },
        { productId: ids.castle!, quantity: 1, unitPrice: 1.2 },
      ],
      12.08,
      { promotionId },
    );
    expect(sold.status).toBe(201);
    const sale = await prisma.retailSale.findUniqueOrThrow({ where: { id: sold.body.id! }, include: { lines: true } });
    expect(sale.totalAmount.toFixed(2)).toBe("12.08");
    const inPack = sale.lines.filter((entry) => entry.bundleId === braaiId);
    expect(inPack.reduce((sum, entry) => sum.plus(entry.lineTotal), new Prisma.Decimal(0)).toFixed(2)).toBe("11.00");
  });
});

describe("a single the shelf has run out of", () => {
  it("opens a case inside the sale: cases 2 → 1, singles 0 → 23, one BRK reference, no journal for the break", async () => {
    const theCase = await createPack(shop.owner(), { singleId: ids.castle!, size: 24, price: "26.00", breakAtTill: true });
    const caseLine = await prisma.inventoryItem.findFirstOrThrow({ where: { productId: theCase.productId, siteId: shop.mainId }, select: { id: true } });
    await prisma.inventoryItem.update({ where: { id: caseLine.id }, data: { currentStock: new Prisma.Decimal(2), unitCost: new Prisma.Decimal("20.64") } });
    await prisma.inventoryItem.update({ where: { id: items.castle! }, data: { currentStock: new Prisma.Decimal(0) } });

    const sold = await sell("single", [{ productId: ids.castle!, quantity: 1, unitPrice: 1.2 }], 1.2);
    expect(sold.status).toBe(201);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: caseLine.id } })).currentStock.toNumber()).toBe(1);
    expect(await onHand("castle")).toBe(23);
    const breaks = await prisma.stockMovement.findMany({
      where: { reason: "CASE_BROKEN", itemId: { in: [caseLine.id, items.castle!] } },
      select: { reference: true },
    });
    expect(breaks).toHaveLength(2);
    expect(new Set(breaks.map((row) => row.reference)).size).toBe(1);
    expect(breaks[0]!.reference).toMatch(/^BRK-/);
    expect(await prisma.journalEntry.count({ where: { companyId: shop.companyId, sourceId: { contains: breaks[0]!.reference! } } })).toBe(0);
    const posted = await balanced(sold.body.id!);
    expect(posted.entries).toBeGreaterThan(0);
    expect(posted.debit).toBe(posted.credit);
  });

  it("refuses when there is no case to open either", async () => {
    await prisma.inventoryItem.updateMany({ where: { productId: { not: null }, product: { packOfId: ids.castle! } }, data: { currentStock: new Prisma.Decimal(0) } });
    await prisma.inventoryItem.update({ where: { id: items.castle! }, data: { currentStock: new Prisma.Decimal(0) } });
    const sold = await sell("none", [{ productId: ids.castle!, quantity: 1, unitPrice: 1.2 }], 1.2);
    expect(sold.status).toBeGreaterThanOrEqual(400);
  });
});
