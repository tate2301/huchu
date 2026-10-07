import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";
import { loadPromotionSnapshot } from "@/lib/retail/pricing/snapshot";
import { priceSale } from "@/lib/retail/pricing/sale";
import { createPromotion, movePromotions } from "@/lib/retail/promotions/service";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

/**
 * `pos/sales` with promotions (PRD-09) on a paired till, against the test
 * database: a spirit rung while "Festive season US$2 off spirits" runs takes
 * US$2.00 off each bottle, its line keeping the promotion and what it took
 * off, and the sale's total, VAT and journal follow; a till that still sends
 * the old `promotionId` is refused; ended, the promotion leaves the till's
 * snapshot and the next spirit sells at its shelf price. On 25 October the
 * month-end cider deal, priced by the till's own sum over the server's
 * snapshot, rings two Savanna at US$5.00 with the promotion on their line.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { POST as SELL } from "./route";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const key = `promotions-key-${stamp}`;
let shop: TestShop;
let shiftId = "";
let spiritsId = "";
let cidersId = "";
const ids: Record<string, string> = {};
let festiveId = "";
let ciderId = "";

beforeAll(async () => {
  shop = await makeTestShop("Sale promotions");
  await prisma.retailPostingSettings.create({ data: { companyId: shop.companyId, schedule: "EVERY_SALE" } });
  spiritsId = (await prisma.retailCategory.create({ data: { companyId: shop.companyId, name: "Spirits", ageRestricted: false }, select: { id: true } })).id;
  const beer = (await prisma.retailCategory.create({ data: { companyId: shop.companyId, name: "Beer", ageRestricted: false }, select: { id: true } })).id;
  cidersId = (await prisma.retailCategory.create({ data: { companyId: shop.companyId, name: "Ciders", ageRestricted: false }, select: { id: true } })).id;
  const add = async (code: string, name: string, price: string, categoryId: string) => {
    ids[code] = (await addTestProduct(shop.companyId, { name, price, cost: "1.00", categoryId, ageCheck: false }, { siteId: shop.mainId, onHand: 40 })).productId;
  };
  await add("jameson", "Jameson Irish Whiskey 750ml", "27.90", spiritsId);
  await add("castle", "Castle Lager 340ml", "1.20", beer);
  await add("savanna", "Savanna Dry 330ml", "3.10", cidersId);
  await add("hunters", "Hunter’s Gold 330ml", "2.90", cidersId);

  festiveId = (
    await createPromotion(shop.owner(), {
      name: "Festive season US$2 off spirits",
      kind: "AMOUNT",
      value: "2.00",
      appliesTo: "CATEGORIES",
      categoryIds: [spiritsId],
      starts: new Date(Date.now() - 60 * 60 * 1000).toISOString().slice(0, 16),
      ends: null,
      audience: "EVERYONE",
      stacks: false,
      code: "PROMO-FESTIVE",
    })
  ).id;
  ciderId = (
    await createPromotion(
      shop.owner(),
      {
        name: "Month-end two for US$5 ciders",
        kind: "BUY_X_PAY",
        value: "5.00",
        buyQuantity: 2,
        appliesTo: "PRODUCTS",
        productIds: [ids.savanna!, ids.hunters!],
        starts: "2026-10-25T00:00",
        ends: "2026-10-31T23:59",
        audience: "EVERYONE",
        stacks: false,
        code: "MONTHEND-CIDER",
      },
      new Date("2026-10-07T10:00:00Z"),
    )
  ).id;

  const cashierId = (
    await prisma.user.create({
      data: { companyId: shop.companyId, name: "Chipo Dube", role: "CASHIER", email: `chipo-${stamp}@promotions.test`, password: "x" },
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
      user: { id: cashierId, companyId: shop.companyId, role: "CASHIER", name: "Chipo Dube", email: `chipo-${stamp}@promotions.test`, enabledFeatures: ["retail.core"] },
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
  await prisma.retailPromotion.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

type Line = { productId: string; quantity: number; unitPrice: number };

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
  ).then(async (response) => ({ status: response.status, body: (await response.json()) as Record<string, unknown> & { id?: string } }));
}

describe("a running promotion at the till", () => {
  it("takes US$2.00 off each spirit, keeps the promotion on its line, and nothing off the beer", async () => {
    const sold = await sell(
      "festive",
      [
        { productId: ids.jameson!, quantity: 2, unitPrice: 27.9 },
        { productId: ids.castle!, quantity: 1, unitPrice: 1.2 },
      ],
      53,
    );
    expect(sold.status).toBe(201);
    const sale = await prisma.retailSale.findUniqueOrThrow({ where: { id: sold.body.id! }, include: { lines: true } });
    // 2 × 27.90 − 4.00 + 1.20.
    expect(sale.totalAmount.toFixed(2)).toBe("53.00");
    const spirit = sale.lines.find((line) => line.productId === ids.jameson)!;
    expect([spirit.promotionId, spirit.promotionDiscount.toFixed(2), spirit.lineTotal.toFixed(2)]).toEqual([festiveId, "4.00", "51.80"]);
    const beer = sale.lines.find((line) => line.productId === ids.castle)!;
    expect([beer.promotionId, beer.promotionDiscount.toFixed(2)]).toEqual([null, "0.00"]);
    // The money holds: each line is its shelf less what came off; the promotion is within the line's discount, on the shelf's basis.
    for (const line of sale.lines) {
      const shelf = line.quantity.times(line.unitPrice);
      expect(shelf.minus(line.lineTotal).toFixed(2)).toBe(line.promotionDiscount.toFixed(2));
    }
    expect(sale.subtotal.minus(sale.discountAmount).plus(sale.taxAmount).toFixed(2)).toBe(sale.totalAmount.toFixed(2));
    const entries = await prisma.journalEntry.findMany({ where: { companyId: shop.companyId, sourceId: sale.id }, select: { lines: { select: { debit: true, credit: true } } } });
    const journal = entries.flatMap((entry) => entry.lines);
    expect(Math.round(journal.reduce((sum, row) => sum + row.debit, 0) * 100)).toBe(Math.round(journal.reduce((sum, row) => sum + row.credit, 0) * 100));
  });

  it("refuses a till that still picks a promotion itself", async () => {
    const sold = await sell("old-till", [{ productId: ids.castle!, quantity: 1, unitPrice: 1.2 }], 1.2, { promotionId: festiveId });
    expect(sold).toMatchObject({ status: 400, body: { error: "Promotions come off on their own now. Update the till and ring it again." } });
  });

  it("ended, leaves the till's snapshot, and the next spirit sells at its shelf price", async () => {
    expect((await loadPromotionSnapshot(shop.companyId, shop.mainId)).promotions.map((promotion) => promotion.code).sort()).toEqual([
      "MONTHEND-CIDER",
      "PROMO-FESTIVE",
    ]);
    expect(await movePromotions(shop.owner(), [festiveId], "end")).toBe(1);
    expect((await loadPromotionSnapshot(shop.companyId, shop.mainId)).promotions.map((promotion) => promotion.code)).toEqual(["MONTHEND-CIDER"]);
    const sold = await sell("after-end", [{ productId: ids.jameson!, quantity: 1, unitPrice: 27.9 }], 27.9);
    expect(sold.status).toBe(201);
    const line = await prisma.retailSaleLine.findFirstOrThrow({ where: { saleId: sold.body.id! } });
    expect([line.promotionId, line.lineTotal.toFixed(2)]).toEqual([null, "27.90"]);
  });
});

describe("the month-end cider deal on 25 October", () => {
  it("rings two Savanna at US$5.00 by the till's sum over the server's snapshot, the promotion on the line", async () => {
    const at = new Date("2026-10-25T10:00:00Z");
    const snapshot = await loadPromotionSnapshot(shop.companyId, shop.mainId, at);
    const priced = priceSale({
      lines: [
        { key: "s", productId: ids.savanna!, categoryId: cidersId, quantity: 2, unitPrice: 3.1, taxPercent: 15.5, taxInclusive: true, lineDiscount: 0 },
      ],
      bundles: [],
      promotions: snapshot.promotions,
      at,
      siteId: shop.mainId,
    });
    if ("error" in priced) throw new Error(priced.error);
    expect(priced.checkout.total).toBe(5);
    expect(priced.pieces[0]).toMatchObject({ promotionId: ciderId, promotionDiscount: 1.2 });
    // A day before, it is not on yet.
    const before = priceSale({
      lines: [{ key: "s", productId: ids.savanna!, categoryId: cidersId, quantity: 2, unitPrice: 3.1, taxPercent: 15.5, taxInclusive: true, lineDiscount: 0 }],
      bundles: [],
      promotions: snapshot.promotions,
      at: new Date("2026-10-24T10:00:00Z"),
      siteId: shop.mainId,
    });
    if ("error" in before) throw new Error(before.error);
    expect(before.checkout.total).toBe(6.2);
  });
});
