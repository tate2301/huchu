import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { recordStockMovement } from "@/lib/inventory/stock-movements";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { activityWords } from "@/lib/retail/activity-words";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

/**
 * The product record's routes (PRD-04), against the test database: the
 * stock chart reads for every role that reads the product and refuses a
 * window it does not draw; the rail's changes are refused to roles that may
 * not change products, and a Reorder change lands on the default site's line
 * with its Activity sentence; No under a category that checks ID is refused
 * under its field; a cashier reads no cost and no margin.
 */

let shop: TestShop;
let productId: string;
let itemId: string;
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

const { GET: read, PATCH: change } = await import("./[id]/route");
const { GET: chart } = await import("./[id]/stock-chart/route");

const request = (path: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://shop.test/api/v2/retail/products${path}`, {
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

beforeAll(async () => {
  shop = await makeTestShop("ProductRecord");
  const created = await addTestProduct(shop.companyId, {
    name: "Amarula Cream 750ml",
    price: "18.25",
    cost: "13.03",
    categoryId: shop.ciderId,
    reorderAt: "12",
  });
  productId = created.productId;
  itemId = created.itemId;
  await prisma.inventoryItem.update({ where: { id: itemId }, data: { reorderQty: 24 } });
  // 20 in, then 7 sold.
  const move = (reason: "OPENING" | "SALE", quantity: number) =>
    recordStockMovement({
      companyId: shop.companyId,
      userId: shop.ownerId,
      itemId,
      movementType: reason === "OPENING" ? "RECEIPT" : "ISSUE",
      quantity,
      unit: "bottle",
      reason,
      reference: reason === "OPENING" ? "Opening" : "SALE-000001",
      sourceType: reason === "OPENING" ? "STOCK_ADJUSTMENT" : "RETAIL_SALE",
      sourceId: `${reason}-${itemId}`,
    });
  await move("OPENING", 20);
  await move("SALE", 7);
}, 60_000);

afterAll(async () => {
  if (shop) await destroyProvisionedTenant(shop.companyId);
});

describe("the stock chart", () => {
  it("draws 30 days ending today at what is on hand, with the reorder level, for a cashier too", async () => {
    const answer = await as("CASHIER", () => chart(request(`/${productId}/stock-chart`), params(productId)));
    expect(answer.status).toBe(200);
    const { data } = await answer.json();
    expect(data.days).toHaveLength(30);
    expect(data.days.at(-1)).toMatchObject({ onHand: 13, sold: 7, received: 20 });
    expect(data).toMatchObject({ onHand: 13, reorderAt: 12, received: [{ quantity: 20 }] });
    // Nothing rung on a till: not selling, so no run-out day and no advice.
    expect(data).toMatchObject({ perDay: 0, runsOutOn: null, projection: [], advice: null });
  });

  it("refuses a window it does not draw, and a product that is not the shop's", async () => {
    const wide = await chart(request(`/${productId}/stock-chart?days=500`), params(productId));
    expect(wide.status).toBe(400);
    expect(await wide.json()).toMatchObject({ error: "Ask for 7 to 90 days." });
    const words = await chart(request(`/${productId}/stock-chart?days=a`), params(productId));
    expect(words.status).toBe(400);
    const missing = await chart(request(`/9b1c7f0e-0000-4000-8000-000000000000/stock-chart`), params("9b1c7f0e-0000-4000-8000-000000000000"));
    expect(missing.status).toBe(404);
  });
});

describe("the record", () => {
  it("reads no cost and no margin for a cashier, and both for the owner", async () => {
    const cashier = await (await as("CASHIER", () => read(request(`/${productId}`), params(productId)))).json();
    expect(cashier.data).toMatchObject({ cost: null, margin: null, marginPerUnit: null, seesCost: false });
    const owner = await (await read(request(`/${productId}`), params(productId))).json();
    expect(owner.data).toMatchObject({ cost: 13.03, margin: 28.6, marginPerUnit: 5.22, seesCost: true, vatLabel: "15.5% included" });
    expect(owner.data.figures).toMatchObject({ sold30: 0, soldToday: 0, lastSale: null, coverDays: null });
  });

  it("refuses a change from a cashier and a stock clerk, and puts a Reorder change on the default site's line", async () => {
    for (const role of ["CASHIER", "STOCK_CLERK"]) {
      const refused = await as(role, () => change(request(`/${productId}`, "PATCH", { reorderQty: "30" }), params(productId)));
      expect(refused.status).toBe(403);
    }
    const saved = await as("MANAGER", () => change(request(`/${productId}`, "PATCH", { reorderQty: "30" }), params(productId)));
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ changed: [{ field: "reorderQty", from: "24", to: "30" }] });
    const line = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(line.reorderQty?.toNumber()).toBe(30);
    expect(line.siteId).toBe(shop.mainId);
    const event = await prisma.platformAuditEvent.findFirstOrThrow({
      where: { entityId: productId, eventType: "RETAIL_RECORD.EDITED" },
      orderBy: { createdAt: "desc" },
    });
    expect(activityWords(event.eventType, JSON.parse(event.payloadJson ?? "{}")).what).toBe("Changed Reorder from 24 to 30");
  });

  it("refuses No under a category that checks ID, under its field", async () => {
    const answer = await change(request(`/${productId}`, "PATCH", { ageCheck: false }), params(productId));
    expect(answer.status).toBe(400);
    expect(await answer.json()).toMatchObject({ fieldErrors: { ageCheck: "Ciders and coolers checks ID for every product in it." } });
  });
});
