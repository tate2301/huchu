import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";
import { createPriceList, setPriceListsState } from "@/lib/retail/price-lists/service";
import { changePrices, defaultPriceList } from "@/lib/retail/prices/change";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

/**
 * `pos/sales` on the price engine (PRD-05): a line sent at a price the engine
 * no longer charges, with no reason, is refused with the sentence that sends
 * the till to ring it again; with a reason it is an override and SET-06's
 * rule judges it; the line records the list it was priced from, the lower
 * list winning; a replay at a price changed after it was rung goes in, as
 * before. Against the test database, on a paired till.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { POST as SELL } from "./route";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const key = `pricing-key-${stamp}`;
let shop: TestShop;
let shiftId = "";
let castleId = "";
let retailId = "";
let beerId = "";

beforeAll(async () => {
  shop = await makeTestShop("Sale pricing");
  retailId = (await defaultPriceList(prisma, shop.companyId)).id;
  beerId = (await prisma.retailCategory.create({ data: { companyId: shop.companyId, name: "Beer", ageRestricted: false }, select: { id: true } })).id;
  castleId = (
    await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.86", categoryId: beerId, ageCheck: false }, { siteId: shop.mainId, onHand: 50 })
  ).productId;
  const cashierId = (
    await prisma.user.create({
      data: { companyId: shop.companyId, name: "Chipo Dube", role: "CASHIER", email: `chipo-${stamp}@pricing.test`, password: "x" },
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
        openedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      },
      select: { id: true },
    })
  ).id;
  validateSessionMock.mockResolvedValue({
    session: {
      user: { id: cashierId, companyId: shop.companyId, role: "CASHIER", name: "Chipo Dube", email: `chipo-${stamp}@pricing.test`, enabledFeatures: ["retail.core"] },
    },
  });
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  const { companyId } = shop;
  await prisma.retailSalePayment.deleteMany({ where: { sale: { companyId } } });
  await prisma.retailSaleLine.deleteMany({ where: { sale: { companyId } } });
  await prisma.retailSale.deleteMany({ where: { companyId } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await prisma.retailDevice.deleteMany({ where: { companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.productPriceChange.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

function sell(ref: string, unitPrice: number, extra: Record<string, unknown> = {}) {
  return SELL(
    new NextRequest("http://pos.test.localtest.me/api/v2/retail/pos/sales", {
      method: "POST",
      headers: { cookie: `${DEVICE_COOKIE}=${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        clientRef: `${ref}-${stamp}`,
        shiftId,
        items: [{ productId: castleId, quantity: 1, unitPrice }],
        payments: [{ tenderType: "CASH", currency: "USD", amount: 5 }],
        ...extra,
      }),
    }),
  ).then(async (response) => ({ status: response.status, body: (await response.json()) as Record<string, unknown> & { id?: string } }));
}

const lineOf = (saleId: string | undefined) =>
  prisma.retailSaleLine.findFirstOrThrow({ where: { saleId: saleId! }, select: { unitPrice: true, priceListId: true } });

describe("a sale on the price engine", () => {
  it("refuses a price the till no longer has, with no reason, and posts nothing", async () => {
    const stale = await sell("stale", 1.1);
    expect(stale).toMatchObject({ status: 409, body: { error: "Prices changed while you were selling. The till has the new prices; ring it again." } });
    expect(await prisma.retailSale.count({ where: { companyId: shop.companyId, clientRef: `stale-${stamp}` } })).toBe(0);
  });

  it("posts at the engine's price, the line naming Retail", async () => {
    const sold = await sell("retail", 1.2);
    expect(sold.status).toBe(201);
    const line = await lineOf(sold.body.id);
    expect([line.unitPrice.toFixed(2), line.priceListId]).toEqual(["1.20", retailId]);
  });

  it("charges the lower list when another applies, and names it on the line", async () => {
    const happy = await createPriceList(shop.owner(), {
      name: `Beer hour ${stamp}`,
      startFrom: { listId: retailId },
      prices: "OFF",
      by: "10%",
      audience: "EVERYONE",
      when: "ALWAYS",
      siteId: null,
      categoryIds: [beerId],
      switchOn: true,
    });
    const at = await sell("happy", 1.08);
    expect(at.status).toBe(201);
    const line = await lineOf(at.body.id);
    expect([line.unitPrice.toFixed(2), line.priceListId]).toEqual(["1.08", happy.data.id]);
    // Retail's price is now the stale one.
    expect((await sell("retail-stale", 1.2)).status).toBe(409);
    await setPriceListsState(shop.owner(), [happy.data.id], "PAUSED");
  });

  it("judges a price with a reason by the till rules, against the engine's price", async () => {
    const above = await sell("override", 1.3, { overrideReason: "Price check" });
    expect(above).toMatchObject({ status: 409, body: { needsApprover: true } });
    expect(await prisma.retailSale.count({ where: { companyId: shop.companyId, clientRef: `override-${stamp}` } })).toBe(0);
  });

  it("takes a replay rung before the price changed, as before", async () => {
    await prisma.$transaction((tx) =>
      changePrices(tx, {
        companyId: shop.companyId,
        actor: shop.owner(),
        listId: retailId,
        rows: [{ productId: castleId, price: "1.25" }],
        source: "TYPED",
        limits: { priceChanges: "MANAGERS", belowCostNeedsOwner: true },
      }),
    );
    const replay = await sell("replay", 1.2, { offlineCreatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString() });
    expect(replay.status).toBe(201);
    const line = await lineOf(replay.body.id);
    expect([line.unitPrice.toFixed(2), line.priceListId]).toEqual(["1.20", retailId]);
  });
});
