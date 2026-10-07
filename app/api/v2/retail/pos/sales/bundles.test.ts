import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { createBundle } from "@/lib/retail/bundles/service";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";
import { createPack } from "@/lib/retail/products/packs";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

/**
 * `pos/sales` with bundles and cases (PRD-08) on a paired till, against the
 * test database: a Braai pack rung as one totals its price, its component
 * lines summing to it and naming it, stock off each; three Savanna come to
 * the buy-more price on their own; a Castle single with none on the shelf
 * opens a case inside the sale, under one BRK reference, with no journal of
 * its own, and the sale's journal balances.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { POST as SELL } from "./route";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const key = `bundles-key-${stamp}`;
let shop: TestShop;
let shiftId = "";
const ids: Record<string, string> = {};
const items: Record<string, string> = {};
let braaiId = "";

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
  await prisma.productPriceChange.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

type Line = { productId: string; quantity: number; unitPrice: number; bundleId?: string; bundleRef?: string };

function sell(ref: string, lines: Line[], pay: number) {
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
      }),
    }),
  ).then(async (response) => ({ status: response.status, body: (await response.json()) as Record<string, unknown> & { id?: string; totalAmount?: unknown } }));
}

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
