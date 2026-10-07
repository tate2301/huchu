import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { defaultPriceList } from "@/lib/retail/prices/change";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

/**
 * A price list's prices (PRD-07), through its routes against the test
 * database: the worksheet's save is all or nothing and names each refused
 * row; products go on a list at its base less a percentage, following it when
 * that is the list's own rule, and come off any list but the default; Change
 * many prices refuses a manager's line under cost; and every route refuses a
 * role that may not change prices.
 */

let shop: TestShop;
let retailId: string;
let wholesaleId: string;
let amarula: string;
let castle: string;
let savanna: string;
let hunters: string;
const who = { role: "SUPERADMIN" };

vi.mock("@/app/api/v2/retail/_helpers", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/app/api/v2/retail/_helpers")>();
  return {
    ...real,
    requireRetailSession: async () => ({
      response: null,
      session: { user: { id: shop.ownerId, companyId: shop.companyId, name: "Tendai Mhlanga", role: who.role } },
    }),
  };
});

const { PATCH: savePrices } = await import("./[id]/prices/route");
const { POST: addProducts } = await import("./[id]/products/route");
const { POST: removeProducts } = await import("./[id]/products/remove/route");
const { POST: changeMany } = await import("../price-changes/route");
const { POST: preview } = await import("../price-changes/preview/route");
const { POST: cancel } = await import("../price-changes/[batchId]/cancel/route");

const request = (path: string, method: string, body?: unknown) =>
  new NextRequest(`http://shop.test/api/v2/retail${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function as<T>(role: string, run: () => Promise<T>): Promise<T> {
  who.role = role;
  try {
    return await run();
  } finally {
    who.role = "SUPERADMIN";
  }
}

const priceOn = async (listId: string, productId: string) =>
  (await prisma.productPrice.findFirst({ where: { priceListId: listId, productId } }))?.unitPrice.toFixed(2) ?? null;

beforeAll(async () => {
  shop = await makeTestShop("PriceWorksheet");
  amarula = (await addTestProduct(shop.companyId, { name: "Amarula Cream 750ml", price: "18.25", cost: "13.03" })).productId;
  castle = (await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.86" })).productId;
  savanna = (await addTestProduct(shop.companyId, { name: "Savanna Dry 330ml", price: "1.85", cost: "1.38" })).productId;
  hunters = (await addTestProduct(shop.companyId, { name: "Hunter’s Gold 330ml", price: "1.85", cost: "1.31" })).productId;
  retailId = (await defaultPriceList(prisma, shop.companyId)).id;
  wholesaleId = (
    await prisma.priceList.create({
      data: {
        companyId: shop.companyId,
        name: "Wholesale",
        state: "ON",
        minQuantity: 6,
        basis: "LIST",
        basisListId: retailId,
        adjustPercent: new Prisma.Decimal(-8),
      },
      select: { id: true },
    })
  ).id;
  await prisma.productPrice.create({
    data: { companyId: shop.companyId, priceListId: wholesaleId, productId: castle, minQuantity: 6, unitPrice: new Prisma.Decimal("1.10"), followsBase: true },
  });
}, 60_000);

afterAll(async () => {
  if (shop) await destroyProvisionedTenant(shop.companyId);
});

describe("PATCH /price-lists/[id]/prices", () => {
  it("saves the typed prices as one TYPED batch", async () => {
    const answer = await savePrices(
      request(`/price-lists/${retailId}/prices`, "PATCH", {
        changes: [
          { id: amarula, value: "18.99" },
          { id: castle, value: "US$ 1.25" },
        ],
      }),
      params(retailId),
    );
    expect(answer.status).toBe(200);
    const body = await answer.json();
    expect(body.data.saved).toBe(2);
    expect([await priceOn(retailId, amarula), await priceOn(retailId, castle)]).toEqual(["18.99", "1.25"]);
    const batch = await prisma.productPriceChange.findMany({ where: { batchId: body.data.batchId, priceListId: retailId } });
    expect(batch.map((row) => row.source)).toEqual(["TYPED", "TYPED"]);
    // Wholesale follows Retail: 1.25 less 8%.
    expect(await priceOn(wholesaleId, castle)).toBe("1.15");
  });

  it("refuses a manager's row under cost by its sentence, and saves nothing at all", async () => {
    const answer = await as("MANAGER", () =>
      savePrices(
        request(`/price-lists/${retailId}/prices`, "PATCH", {
          changes: [
            { id: amarula, value: "12.00" },
            { id: castle, value: "1.30" },
          ],
        }),
        params(retailId),
      ),
    );
    expect(answer.status).toBe(400);
    expect(await answer.json()).toEqual({
      error: "1 price was not saved.",
      details: { rows: [{ id: amarula, message: "Below cost needs the owner. It costs US$13.03." }] },
    });
    expect([await priceOn(retailId, amarula), await priceOn(retailId, castle)]).toEqual(["18.99", "1.25"]);
  });

  it("names a figure that is not one, and a product not on the list", async () => {
    const answer = await savePrices(
      request(`/price-lists/${wholesaleId}/prices`, "PATCH", {
        changes: [
          { id: castle, value: "abc" },
          { id: amarula, value: "17.00" },
        ],
      }),
      params(wholesaleId),
    );
    expect(answer.status).toBe(400);
    const body = await answer.json();
    expect(body.error).toBe("2 prices were not saved.");
    expect(Object.fromEntries(body.details.rows.map((row: { id: string; message: string }) => [row.id, row.message]))).toEqual({
      [castle]: "Write the price as a figure, like 2.10.",
      [amarula]: "That product is not on this list.",
    });
  });

  it("is refused to a cashier, who reads prices only", async () => {
    const answer = await as("CASHIER", () =>
      savePrices(request(`/price-lists/${retailId}/prices`, "PATCH", { changes: [{ id: amarula, value: "1.00" }] }), params(retailId)),
    );
    expect(answer.status).toBe(403);
    expect(await priceOn(retailId, amarula)).toBe("18.99");
  });
});

describe("adding products to a list", () => {
  it("prices them at Retail less 8% from 6, following Retail as the list's rule does, and skips those on it", async () => {
    const answer = await addProducts(
      request(`/price-lists/${wholesaleId}/products`, "POST", {
        productIds: [savanna, hunters, castle],
        pricedAt: "BASE_LESS",
        less: "8%",
        fromQuantity: 6,
      }),
      params(wholesaleId),
    );
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({
      data: { added: 2, skipped: 1 },
      message: "2 products added to Wholesale. 1 product was on it already.",
    });
    const rows = await prisma.productPrice.findMany({ where: { priceListId: wholesaleId, productId: { in: [savanna, hunters] } } });
    // round2(1.85 × 0.92) = 1.70.
    expect(rows.map((row) => [row.unitPrice.toFixed(2), row.minQuantity.toNumber(), row.followsBase])).toEqual([
      ["1.70", 6, true],
      ["1.70", 6, true],
    ]);
    const added = await prisma.productPriceChange.findMany({ where: { priceListId: wholesaleId, productId: savanna } });
    expect(added.map((row) => [row.source, row.fromPrice, row.toPrice?.toFixed(2)])).toEqual([["ADDED", null, "1.70"]]);
    const event = await prisma.platformAuditEvent.findFirstOrThrow({ where: { entityId: wholesaleId, eventType: "RETAIL_PRICE_LIST.PRODUCTS_ADDED" } });
    expect(JSON.parse(event.payloadJson ?? "{}")).toMatchObject({ count: 2, names: ["Hunter’s Gold 330ml", "Savanna Dry 330ml"] });
  });

  it("copies the base for each to be set, not following it, and says to set them", async () => {
    const answer = await addProducts(
      request(`/price-lists/${wholesaleId}/products`, "POST", { productIds: [amarula], pricedAt: "EACH" }),
      params(wholesaleId),
    );
    expect((await answer.json()).message).toBe("1 product added to Wholesale. Set each price in the list.");
    const row = await prisma.productPrice.findFirstOrThrow({ where: { priceListId: wholesaleId, productId: amarula } });
    expect([row.unitPrice.toFixed(2), row.minQuantity.toNumber(), row.followsBase]).toEqual(["18.99", 6, false]);
  });

  it("refuses a less that is not 0% to 90%", async () => {
    const answer = await addProducts(
      request(`/price-lists/${wholesaleId}/products`, "POST", { productIds: [savanna], pricedAt: "BASE_LESS", less: "95%" }),
      params(wholesaleId),
    );
    expect(answer.status).toBe(400);
    expect((await answer.json()).fieldErrors).toEqual({ less: "Make it 0% to 90%." });
  });
});

describe("removing products from a list", () => {
  it("refuses the default list with the sentence", async () => {
    const answer = await removeProducts(request(`/price-lists/${retailId}/products/remove`, "POST", { productIds: [castle] }), params(retailId));
    expect(answer.status).toBe(409);
    expect((await answer.json()).error).toBe("Products cannot leave Retail. Archive the product instead.");
  });

  it("takes them off another, keeping their history", async () => {
    const answer = await removeProducts(
      request(`/price-lists/${wholesaleId}/products/remove`, "POST", { productIds: [savanna, hunters] }),
      params(wholesaleId),
    );
    expect(await answer.json()).toEqual({ removed: 2 });
    expect(await priceOn(wholesaleId, savanna)).toBeNull();
    const removed = await prisma.productPriceChange.findFirstOrThrow({ where: { priceListId: wholesaleId, productId: savanna, source: "REMOVED" } });
    expect([removed.fromPrice?.toFixed(2), removed.toPrice]).toEqual(["1.70", null]);
  });

  it("is refused to a bookkeeper", async () => {
    const answer = await as("BOOKKEEPER", () =>
      removeProducts(request(`/price-lists/${wholesaleId}/products/remove`, "POST", { productIds: [castle] }), params(wholesaleId)),
    );
    expect(answer.status).toBe(403);
  });
});

describe("Change many prices", () => {
  it("previews the lines for whoever may change prices", async () => {
    const answer = await preview(
      request("/price-changes/preview", "POST", { listId: retailId, productIds: [castle], how: "RAISE", by: "5%", round: "UP_5" }),
    );
    expect((await answer.json()).lines).toEqual([
      { productId: castle, name: "Castle Lager 340ml", now: 1.25, margin: 31.2, next: 1.35, nextMargin: 36.3, belowCost: false, note: null },
    ]);
    const refused = await as("CASHIER", () =>
      preview(request("/price-changes/preview", "POST", { listId: retailId, productIds: [castle], how: "RAISE", by: "5%", round: "NO" })),
    );
    expect(refused.status).toBe(403);
  });

  it("refuses a manager's line under cost, under that line, and changes nothing", async () => {
    const answer = await as("MANAGER", () =>
      changeMany(
        request("/price-changes", "POST", {
          listId: retailId,
          lines: [
            { productId: savanna, price: "1.90", labels: 1 },
            { productId: castle, price: "0.80", labels: 1 },
          ],
          when: "NOW",
          printLabels: false,
        }),
      ),
    );
    expect(answer.status).toBe(400);
    expect(await answer.json()).toEqual({
      error: "1 price was not saved.",
      fieldErrors: { "lines.1": "Below cost needs the owner. It costs US$0.86." },
    });
    expect(await priceOn(retailId, savanna)).toBe("1.85");
  });

  it("schedules for the owner and undoes it while it waits; a cashier may do neither", async () => {
    const scheduled = await changeMany(
      request("/price-changes", "POST", { listId: retailId, lines: [{ productId: savanna, price: "1.90", labels: 0 }], when: "TONIGHT", printLabels: false }),
    );
    const body = await scheduled.json();
    expect(body.data.applied).toBe(false);
    expect(body.message).toMatch(/^1 price change (tonight|tomorrow) at 22:00\.$/);
    const refused = await as("CASHIER", () =>
      cancel(request(`/price-changes/${body.data.batchId}/cancel`, "POST"), { params: Promise.resolve({ batchId: body.data.batchId }) }),
    );
    expect(refused.status).toBe(403);
    const undone = await cancel(request(`/price-changes/${body.data.batchId}/cancel`, "POST"), { params: Promise.resolve({ batchId: body.data.batchId }) });
    expect(await undone.json()).toEqual({ cancelled: 1 });
    const cashier = await as("CASHIER", () =>
      changeMany(request("/price-changes", "POST", { listId: retailId, lines: [{ productId: savanna, price: "1.90", labels: 0 }], when: "NOW", printLabels: false })),
    );
    expect(cashier.status).toBe(403);
  });
});
