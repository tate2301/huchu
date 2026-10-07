import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { createPromotion, duplicatePromotions, loadPromotionView, movePromotions, PromotionRefusal, updatePromotion } from "./service";

/**
 * Promotions' rules and figures (PRD-09, 20-products 4.8) against the test
 * database: the sentences each refusal says under its field; a running one
 * keeps its start (409) and an ended one cannot change (409); a code is the
 * shop's once; and a record's figures read off the sale lines that carry it
 * — sold under it, the same days before it, the extra takings and what it
 * gave away.
 */

let shop: TestShop;
const ids: Record<string, string> = {};
const items: Record<string, string> = {};
const NOW = new Date("2026-10-07T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const refusal = async (run: Promise<unknown>) => {
  try {
    await run;
  } catch (error) {
    if (error instanceof PromotionRefusal) return { status: error.status, message: error.message, fields: error.fieldErrors };
    throw error;
  }
  throw new Error("It was not refused.");
};

const ciders = () => ({
  name: "Month-end two for US$5 ciders",
  kind: "BUY_X_PAY" as const,
  value: "5.00",
  buyQuantity: 2,
  appliesTo: "PRODUCTS" as const,
  productIds: [ids.savanna!, ids.hunters!],
  starts: "25 October, 00:00",
  ends: "31 October, 23:59",
  audience: "EVERYONE" as const,
  stacks: false,
  code: "MONTHEND-CIDER",
});

beforeAll(async () => {
  shop = await makeTestShop("Promotions");
  for (const [code, name, price] of [
    ["savanna", "Savanna Dry 330ml", "3.10"],
    ["hunters", "Hunter’s Gold 330ml", "2.90"],
    ["jameson", "Jameson Irish Whiskey 750ml", "27.90"],
  ] as const) {
    const made = await addTestProduct(shop.companyId, { name, price, cost: "1.00", categoryId: shop.ciderId }, { siteId: shop.mainId, onHand: 50 });
    ids[code] = made.productId;
    items[code] = made.itemId;
  }
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  await prisma.retailSaleLine.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.retailSale.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.retailPromotion.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
});

describe("making one", () => {
  it("says what is wrong under the field it belongs to", async () => {
    const actor = shop.manager();
    expect(await refusal(createPromotion(actor, { ...ciders(), starts: "someday" }, NOW))).toMatchObject({
      status: 400,
      fields: { starts: "Write it as 25 October, 00:00." },
    });
    expect(await refusal(createPromotion(actor, { ...ciders(), ends: "24 October, 23:00" }, NOW))).toMatchObject({
      fields: { ends: "It ends before it starts." },
    });
    expect(await refusal(createPromotion(actor, { ...ciders(), buyQuantity: 1 }, NOW))).toMatchObject({ fields: { buyQuantity: "Buy is 2 to 24." } });
    expect(await refusal(createPromotion(actor, { ...ciders(), kind: "PERCENT", value: "95" }, NOW))).toMatchObject({
      fields: { value: "Take at most 90% off." },
    });
    expect(await refusal(createPromotion(actor, { ...ciders(), productIds: [] }, NOW))).toMatchObject({
      fields: { productIds: "Pick the products it applies to." },
    });
    expect(await refusal(createPromotion(actor, { ...ciders(), code: "X" }, NOW))).toMatchObject({
      fields: { code: "A code is 3 to 30 letters, figures and dashes." },
    });
  });

  it("schedules it for the next 25 October, its products with it, and says when it starts", async () => {
    const made = await createPromotion(shop.manager(), ciders(), NOW);
    expect(made.message).toBe("Month-end two for US$5 ciders starts 25 October.");
    ids.cider = made.id;
    const stored = await prisma.retailPromotion.findUniqueOrThrow({ where: { id: made.id }, include: { products: true } });
    expect(stored).toMatchObject({ promoCode: "MONTHEND-CIDER", type: "BUY_X_PAY", buyQuantity: 2, scope: "PRODUCTS", createdById: shop.managerId });
    expect(stored.startsAt.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(stored.endsAt?.toISOString()).toBe("2026-10-31T21:59:00.000Z");
    expect(stored.products).toHaveLength(2);
    const event = await prisma.platformAuditEvent.findFirstOrThrow({ where: { entityId: made.id, eventType: "RETAIL_PROMOTION.CREATED" } });
    expect(JSON.parse(event.payloadJson!)).toMatchObject({ code: "MONTHEND-CIDER", from: "25 Oct 00:00" });
  });

  it("refuses a code the shop already has, and says a promotion starting now is running", async () => {
    expect(await refusal(createPromotion(shop.manager(), { ...ciders(), name: "Another" }, NOW))).toMatchObject({
      fields: { code: "There is already a promotion called MONTHEND-CIDER." },
    });
    const now = await createPromotion(shop.manager(), { ...ciders(), code: "NOW-CIDER", starts: "2026-10-07T00:00", ends: null }, NOW);
    expect(now.message).toBe("Month-end two for US$5 ciders is running now.");
    await prisma.retailPromotion.delete({ where: { id: now.id } });
  });
});

describe("changing one", () => {
  it("keeps a running promotion's start and kind, and an ended one as it is", async () => {
    const running = await createPromotion(
      shop.manager(),
      { ...ciders(), name: "Festive", code: "PROMO-FESTIVE", kind: "AMOUNT", value: "2.00", appliesTo: "PRODUCTS", productIds: [ids.jameson!], starts: "2026-09-02T00:00", ends: null },
      new Date("2026-09-01T10:00:00Z"),
    );
    ids.festive = running.id;
    expect(await refusal(updatePromotion(shop.manager(), running.id, { starts: "2026-09-03T00:00" }, NOW))).toMatchObject({
      status: 409,
      message: "It has already started. Change when it ends instead.",
    });
    expect(await refusal(updatePromotion(shop.manager(), running.id, { kind: "PERCENT" }, NOW))).toMatchObject({
      status: 400,
      message: "A running promotion keeps its kind.",
    });
    const saved = await updatePromotion(shop.manager(), running.id, { ends: "2026-12-31T23:59", value: "2.50" }, NOW);
    expect(saved).toMatchObject({ changed: 2, message: "Promotion saved." });

    expect(await movePromotions(shop.manager(), [running.id], "end", NOW)).toBe(1);
    expect(await refusal(updatePromotion(shop.manager(), running.id, { name: "Late" }, NOW))).toMatchObject({
      status: 409,
      message: "It has ended. Duplicate it to run it again.",
    });
  });

  it("pauses, resumes and duplicates as a copy from tomorrow", async () => {
    expect(await movePromotions(shop.manager(), [ids.cider!], "pause", NOW)).toBe(1);
    expect((await loadPromotionView(shop.companyId, ids.cider!, NOW))?.state).toBe("PAUSED");
    expect(await movePromotions(shop.manager(), [ids.cider!], "resume", NOW)).toBe(1);
    const [copy] = await duplicatePromotions(shop.manager(), [ids.cider!], NOW);
    const stored = await prisma.retailPromotion.findUniqueOrThrow({ where: { id: copy!.id } });
    expect(stored).toMatchObject({ name: "Month-end two for US$5 ciders (copy)", promoCode: "MONTHEND-CIDER-2", endsAt: null });
    expect(stored.startsAt.toISOString()).toBe("2026-10-07T22:00:00.000Z");
  });
});

describe("what it did", () => {
  it("reads sold under it, the same days before, the extra takings and what it gave away off the sale lines", async () => {
    const startsAt = new Date(NOW.getTime() - 10 * DAY);
    const promotion = await prisma.retailPromotion.create({
      data: {
        companyId: shop.companyId,
        promoCode: "PROMO-JAMESON",
        name: "Jameson US$2 off",
        type: "AMOUNT",
        value: new Prisma.Decimal(2),
        scope: "PRODUCTS",
        startsAt,
        products: { create: [{ productId: ids.jameson! }] },
      },
      select: { id: true },
    });
    let n = 0;
    const sell = async (at: Date, quantity: number, promoted: boolean) => {
      n += 1;
      const lineTotal = promoted ? (27.9 - 2) * quantity : 27.9 * quantity;
      await prisma.retailSale.create({
        data: {
          companyId: shop.companyId,
          saleNo: `S-PROMO-${n}`,
          siteId: shop.mainId,
          totalAmount: new Prisma.Decimal(lineTotal.toFixed(2)),
          postedAt: at,
          lines: {
            create: {
              companyId: shop.companyId,
              inventoryItemId: items.jameson!,
              productId: ids.jameson!,
              itemName: "Jameson Irish Whiskey 750ml",
              quantity: new Prisma.Decimal(quantity),
              unitPrice: new Prisma.Decimal("27.90"),
              lineTotal: new Prisma.Decimal(lineTotal.toFixed(2)),
              ...(promoted ? { promotionId: promotion.id, promotionDiscount: new Prisma.Decimal(2 * quantity) } : {}),
            },
          },
        },
      });
    };
    // Before: 4 bottles in the ten days before it started. While it ran: 3 and 2 under it.
    await sell(new Date(startsAt.getTime() - 3 * DAY), 4, false);
    await sell(new Date(startsAt.getTime() - 20 * DAY), 9, false);
    await sell(new Date(startsAt.getTime() + 2 * DAY), 3, true);
    await sell(new Date(startsAt.getTime() + 5 * DAY), 2, true);

    const view = await loadPromotionView(shop.companyId, promotion.id, NOW);
    expect(view?.figures).toMatchObject({
      soldUnder: 5,
      soldBefore: 4,
      soldChange: 25,
      givenAway: 10,
      givenEach: 2,
      // 5 × 25.90 − 4 × 27.90
      extraTakings: 17.9,
      perDollarGiven: 1.79,
      products: 1,
      notSold: 0,
      runningDays: 11,
    });
    expect(view?.appliesToLabel).toBe("1 product");
    expect(view?.unitWord).toBe("bottle");
    expect(view?.badge).toEqual({ label: "Running", tone: "ok" });
  });
});
