/**
 * The price-change core (PRD-03), against the test database: a manager's
 * below-cost price waits for the owner and nothing is written; the owner's
 * goes through; the shop's limits decide; a change on the default list moves
 * the fallback price too; a change dated later writes only its history row;
 * two runs of `applyDuePriceChanges` at once apply each due row once; and a
 * due change on a product in the bin is cancelled, not applied.
 */
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { createPriceList } from "@/lib/retail/price-lists/service";
import { updateProduct } from "@/lib/retail/products/update";

import { applyDuePriceChanges, changePrices, defaultPriceList, PriceRefusal, priceChangeNeedsOwner } from "./change";

let shop: TestShop;
let amarulaId: string;
let listId: string;

const LIMITS: { priceChanges: "MANAGERS" | "OWNER"; belowCostNeedsOwner: boolean } = { priceChanges: "MANAGERS", belowCostNeedsOwner: true };

beforeAll(async () => {
  shop = await makeTestShop("Prices");
  amarulaId = (await addTestProduct(shop.companyId, { name: "Amarula Cream 750ml", price: "18.25", cost: "13.03" })).productId;
  listId = (await defaultPriceList(prisma, shop.companyId)).id;
}, 60_000);

afterAll(async () => {
  if (shop) await destroyProvisionedTenant(shop.companyId);
});

const change = (actor: ReturnType<TestShop["owner"]>, price: string, limits = LIMITS, effectiveAt?: Date) =>
  prisma.$transaction((tx) =>
    changePrices(tx, {
      companyId: shop.companyId,
      actor,
      listId,
      rows: [{ productId: amarulaId, price }],
      source: "TYPED",
      limits,
      effectiveAt: effectiveAt ?? null,
    }),
  );

async function refused(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PriceRefusal) return error.refused;
    throw error;
  }
  return null;
}

const history = () => prisma.productPriceChange.findMany({ where: { productId: amarulaId }, orderBy: { createdAt: "asc" } });

describe("changing a price", () => {
  it("refuses a manager's price below cost with the sentence, and writes nothing", async () => {
    expect(await refused(change(shop.manager(), "12.00"))).toEqual({ [amarulaId]: "Below cost needs the owner. It costs US$13.03." });
    expect(await history()).toHaveLength(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: amarulaId } })).standardPrice.toFixed(2)).toBe("18.25");
  });

  it("lets the owner, and moves the fallback price with the default list", async () => {
    expect(await change(shop.owner(), "12.00")).toEqual({ applied: 1, scheduled: 0, refused: {} });
    const rows = await history();
    expect(rows.at(-1)).toMatchObject({ source: "TYPED", createdById: shop.ownerId });
    expect(rows.at(-1)!.fromPrice?.toFixed(2)).toBe("18.25");
    expect(rows.at(-1)!.toPrice?.toFixed(2)).toBe("12.00");
    expect((await prisma.product.findUniqueOrThrow({ where: { id: amarulaId } })).standardPrice.toFixed(2)).toBe("12.00");
    const events = await prisma.platformAuditEvent.findMany({ where: { entityId: amarulaId, eventType: "RETAIL_PRICE.CHANGED" } });
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0]!.payloadJson!)).toMatchObject({ list: "Retail", from: "18.25", to: "12.00", how: "TYPED" });
    await change(shop.owner(), "18.25");
  });

  it("lets a manager below cost when the shop does not ask the owner", async () => {
    expect((await change(shop.manager(), "12.50", { priceChanges: "MANAGERS", belowCostNeedsOwner: false })).applied).toBe(1);
    await change(shop.owner(), "18.25");
  });

  it("refuses a manager any change while the owner approves price changes", async () => {
    expect(await refused(change(shop.manager(), "19.00", { priceChanges: "OWNER", belowCostNeedsOwner: true }))).toEqual({
      [amarulaId]: "Price changes need the owner.",
    });
    // The owner never waits for themselves.
    const rule = { priceChanges: "OWNER" as const, belowCostNeedsOwner: true };
    expect(priceChangeNeedsOwner(rule, { userRole: "SUPERADMIN" }, { price: new Prisma.Decimal(1), cost: new Prisma.Decimal(13.03) })).toBeNull();
  });

  it("writes only the history for a change dated later, and applies it once when it comes due", async () => {
    const later = new Date(Date.now() + 60 * 60_000);
    expect(await change(shop.manager(), "19.50", LIMITS, later)).toEqual({ applied: 0, scheduled: 1, refused: {} });
    expect((await prisma.productPrice.findFirstOrThrow({ where: { productId: amarulaId, priceListId: listId } })).unitPrice.toFixed(2)).toBe("18.25");
    const before = await prisma.platformAuditEvent.count({ where: { entityId: amarulaId, eventType: "RETAIL_PRICE.CHANGED" } });

    expect(await applyDuePriceChanges(shop.companyId, new Date())).toBe(0);
    const due = new Date(later.getTime() + 1000);
    const runs = await Promise.all([applyDuePriceChanges(shop.companyId, due), applyDuePriceChanges(shop.companyId, due)]);
    expect(runs[0] + runs[1]).toBe(1);
    expect((await prisma.productPrice.findFirstOrThrow({ where: { productId: amarulaId, priceListId: listId } })).unitPrice.toFixed(2)).toBe("19.50");
    expect((await prisma.product.findUniqueOrThrow({ where: { id: amarulaId } })).standardPrice.toFixed(2)).toBe("19.50");
    const after = await prisma.platformAuditEvent.count({ where: { entityId: amarulaId, eventType: "RETAIL_PRICE.CHANGED" } });
    expect(after - before).toBe(1);
    expect(await applyDuePriceChanges(shop.companyId, due)).toBe(0);
  });

  it("cancels a change that comes due while its product is in the bin", async () => {
    const binned = await addTestProduct(shop.companyId, { name: "Two Keys Brandy 750ml", price: "8.00" });
    const later = new Date(Date.now() + 2 * 60 * 60_000);
    await prisma.$transaction((tx) =>
      changePrices(tx, {
        companyId: shop.companyId,
        actor: shop.owner(),
        listId,
        rows: [{ productId: binned.productId, price: "9.00" }],
        source: "TYPED",
        limits: LIMITS,
        effectiveAt: later,
      }),
    );
    await prisma.product.update({ where: { id: binned.productId }, data: { archivedAt: new Date(), isActive: false } });

    const due = new Date(later.getTime() + 1000);
    expect(await applyDuePriceChanges(shop.companyId, due)).toBe(0);
    const product = await prisma.product.findUniqueOrThrow({ where: { id: binned.productId } });
    expect(product.standardPrice.toFixed(2)).toBe("8.00");
    const [waiting] = await prisma.productPriceChange.findMany({ where: { productId: binned.productId, source: "TYPED" } });
    expect(waiting).toMatchObject({ appliedAt: null, cancelledAt: due });
    expect(await prisma.platformAuditEvent.count({ where: { entityId: binned.productId, eventType: "RETAIL_PRICE.CHANGED" } })).toBe(0);
  });
});

describe("followers (PRD-05)", () => {
  let castleId: string;
  let wholesaleId: string;
  let staffId: string;

  beforeAll(async () => {
    castleId = (await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.86" })).productId;
    const base = {
      prices: "OFF" as const,
      by: "8%",
      audience: "EVERYONE" as const,
      when: "ALWAYS" as const,
      siteId: null,
      categoryIds: [],
      switchOn: true,
    };
    wholesaleId = (await createPriceList(shop.owner(), { ...base, name: "Wholesale", startFrom: { listId } })).data.id;
    staffId = (await createPriceList(shop.owner(), { ...base, name: "Staff", startFrom: { cost: true }, prices: "ON", by: "5%" })).data.id;
  }, 60_000);

  const rowOn = (list: string, product: string) =>
    prisma.productPrice.findFirstOrThrow({ where: { priceListId: list, productId: product }, select: { unitPrice: true, followsBase: true } });

  const changeOn = (list: string, product: string, price: string) =>
    prisma.$transaction((tx) =>
      changePrices(tx, { companyId: shop.companyId, actor: shop.owner(), listId: list, rows: [{ productId: product, price }], source: "TYPED", limits: LIMITS }),
    );

  it("moves a following Wholesale row when Retail changes, with its own FOLLOWED history", async () => {
    expect((await rowOn(wholesaleId, castleId)).unitPrice.toFixed(2)).toBe("1.10");
    await changeOn(listId, castleId, "1.30");
    expect((await rowOn(wholesaleId, castleId)).unitPrice.toFixed(2)).toBe("1.20");
    const followed = await prisma.productPriceChange.findFirstOrThrow({
      where: { priceListId: wholesaleId, productId: castleId, source: "FOLLOWED" },
    });
    expect([followed.fromPrice?.toFixed(2), followed.toPrice?.toFixed(2)]).toEqual(["1.10", "1.20"]);
  });

  it("stops a row following once a price is typed on it", async () => {
    await changeOn(wholesaleId, castleId, "1.15");
    expect(await rowOn(wholesaleId, castleId)).toMatchObject({ followsBase: false });
    await changeOn(listId, castleId, "1.40");
    expect((await rowOn(wholesaleId, castleId)).unitPrice.toFixed(2)).toBe("1.15");
  });

  it("moves a follower's single price with the base's, and its break only with the base's break", async () => {
    const lagerId = (await addTestProduct(shop.companyId, { name: "Zambezi Lager 340ml", price: "1.20", cost: "0.86" })).productId;
    await prisma.$transaction((tx) =>
      changePrices(tx, {
        companyId: shop.companyId,
        actor: shop.owner(),
        listId,
        rows: [{ productId: lagerId, price: "1.00", minQuantity: 12 }],
        source: "TYPED",
        limits: LIMITS,
      }),
    );
    const sameId = (
      await createPriceList(shop.owner(), {
        name: "Same as Retail",
        startFrom: { listId },
        prices: "SAME",
        by: "",
        audience: "EVERYONE",
        when: "ALWAYS",
        siteId: null,
        categoryIds: [],
        switchOn: false,
      })
    ).data.id;
    const rows = () =>
      prisma.productPrice
        .findMany({ where: { priceListId: sameId, productId: lagerId }, orderBy: { minQuantity: "asc" }, select: { minQuantity: true, unitPrice: true } })
        .then((found) => found.map((row) => `${row.minQuantity.toString()} @ ${row.unitPrice.toFixed(2)}`));
    expect(await rows()).toEqual(["1 @ 1.20", "12 @ 1.00"]);

    await changeOn(listId, lagerId, "1.30");
    expect(await rows()).toEqual(["1 @ 1.30", "12 @ 1.00"]);

    await prisma.$transaction((tx) =>
      changePrices(tx, {
        companyId: shop.companyId,
        actor: shop.owner(),
        listId,
        rows: [{ productId: lagerId, price: "1.05", minQuantity: 12 }],
        source: "TYPED",
        limits: LIMITS,
      }),
    );
    expect(await rows()).toEqual(["1 @ 1.30", "12 @ 1.05"]);
  });

  it("moves a follower's list-minimum row (Wholesale from 6) with the base's single price", async () => {
    const ciderId = (await addTestProduct(shop.companyId, { name: "Savanna Dry 330ml", price: "1.80", cost: "1.20" })).productId;
    const fromSix = (
      await createPriceList(shop.owner(), {
        name: "From six",
        startFrom: { listId },
        prices: "OFF",
        by: "10%",
        audience: "EVERYONE",
        when: "ALWAYS",
        siteId: null,
        categoryIds: [],
        switchOn: false,
      })
    ).data.id;
    await prisma.priceList.update({ where: { id: fromSix }, data: { minQuantity: 6 } });
    await prisma.productPrice.updateMany({ where: { priceListId: fromSix, productId: ciderId }, data: { minQuantity: 6 } });
    await changeOn(listId, ciderId, "2.00");
    const row = await prisma.productPrice.findFirstOrThrow({ where: { priceListId: fromSix, productId: ciderId }, select: { minQuantity: true, unitPrice: true } });
    expect([row.minQuantity.toString(), row.unitPrice.toFixed(2)]).toEqual(["6", "1.80"]);
  });

  it("prices Staff's rows again when the cost changes", async () => {
    expect((await rowOn(staffId, castleId)).unitPrice.toFixed(2)).toBe("0.90");
    await prisma.$transaction((tx) => updateProduct(tx, { actor: shop.owner(), id: castleId, input: { cost: "1.00" }, limits: LIMITS }));
    expect((await rowOn(staffId, castleId)).unitPrice.toFixed(2)).toBe("1.05");
    expect(
      await prisma.productPriceChange.count({ where: { priceListId: staffId, productId: castleId, source: "FOLLOWED" } }),
    ).toBe(1);
  });
});
