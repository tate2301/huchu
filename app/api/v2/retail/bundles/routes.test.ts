import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { loadBundleSnapshot } from "@/lib/retail/pricing/snapshot";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

/**
 * Bundles' routes (PRD-08, W-13) against the test database: a manager makes
 * a Braai pack and a buy-more deal; a one-item set, a price that saves
 * nothing and a barcode another product has are refused under their field;
 * a cashier and a bookkeeper may read but not make one, a stock clerk not
 * even read; pause takes it off the tills' snapshot and Put on sale brings
 * it back; Stop selling it is for good and a change after it is refused.
 */

let shop: TestShop;
const ids: Record<string, string> = {};
const who = { role: "MANAGER" };

vi.mock("@/app/api/v2/retail/_helpers", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/app/api/v2/retail/_helpers")>();
  return {
    ...real,
    requireRetailSession: async () => ({
      response: null,
      session: { user: { id: shop.managerId, companyId: shop.companyId, name: "Tafara Nyathi", role: who.role } },
    }),
  };
});

const { POST: create } = await import("./route");
const { GET: read, PATCH: change } = await import("./[id]/route");
const { POST: stop } = await import("./[id]/stop/route");
const { POST: pause } = await import("./pause/route");
const { POST: resume } = await import("./resume/route");
const { POST: duplicate } = await import("./duplicate/route");
const { POST: packs } = await import("../packs/route");

const request = (path: string, method: string, body?: unknown) =>
  new NextRequest(`http://shop.test/api/v2/retail${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async (response: Response) => ({ status: response.status, body: (await response.json()) as Record<string, unknown> & { data?: { id: string } } });

async function as<T>(role: string, run: () => Promise<T>): Promise<T> {
  who.role = role;
  try {
    return await run();
  } finally {
    who.role = "MANAGER";
  }
}

const braai = () => ({
  kind: "FIXED_SET",
  name: "Braai pack",
  items: [
    { productId: ids.castle, quantity: 6 },
    { productId: ids.ice, quantity: 1 },
    { productId: ids.charcoal, quantity: 1 },
  ],
  price: "9.50",
  days: "EVERY_DAY",
  until: "No end date",
  barcode: "6001234500044",
});

beforeAll(async () => {
  shop = await makeTestShop("Bundles");
  for (const [code, name, price] of [
    ["castle", "Castle Lager 340ml", "1.20"],
    ["ice", "Ice 2kg bag", "1.50"],
    ["charcoal", "Charcoal 4kg", "1.80"],
    ["savanna", "Savanna Dry 330ml", "1.85"],
  ] as const) {
    ids[code] = (await addTestProduct(shop.companyId, { name, price, cost: "0.50", barcode: code === "castle" ? "6001108012345" : undefined }, { siteId: shop.mainId, onHand: 30 })).productId;
  }
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  await prisma.retailBundle.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
});

describe("making a bundle", () => {
  it("refuses a cashier and a bookkeeper; a stock clerk cannot even read one", async () => {
    expect((await as("CASHIER", () => create(request("/bundles", "POST", braai())))).status).toBe(403);
    expect((await as("FINANCE_OFFICER", () => create(request("/bundles", "POST", braai())))).status).toBe(403);
    expect((await as("CASHIER", () => packs(request("/packs", "POST", { singleId: ids.castle, size: 6, price: "7.00" })))).status).toBe(403);
    expect((await as("STOCK_CLERK", () => read(request(`/bundles/${ids.castle}`, "GET"), params(ids.castle!)))).status).toBe(403);
  });

  it("refuses one item, a price that saves nothing, and a barcode a product has", async () => {
    expect(await json(await create(request("/bundles", "POST", { ...braai(), items: [{ productId: ids.castle, quantity: 1 }] })))).toMatchObject({
      status: 400,
      body: { error: "A bundle needs at least two items.", fieldErrors: { items: "A bundle needs at least two items." } },
    });
    expect(await json(await create(request("/bundles", "POST", { ...braai(), price: "11.00" })))).toMatchObject({
      status: 400,
      body: { fieldErrors: { price: "That is not a saving: bought apart they come to US$10.50." } },
    });
    expect(await json(await create(request("/bundles", "POST", { ...braai(), barcode: "6001108012345" })))).toMatchObject({
      status: 400,
      body: { fieldErrors: { barcode: "Castle Lager 340ml already has this barcode." } },
    });
  });

  it("makes it on sale with its code, its category the first item's, and says so", async () => {
    const made = await json(await create(request("/bundles", "POST", braai())));
    expect(made).toMatchObject({ status: 201, body: { message: "Braai pack is on sale at US$9.50." } });
    ids.braai = made.body.data!.id;
    const stored = await prisma.retailBundle.findUniqueOrThrow({ where: { id: ids.braai }, include: { items: true } });
    expect(stored.code).toMatch(/^BND-\d{4}$/);
    expect(stored.items.map((item) => item.quantity)).toEqual([6, 1, 1]);
    const view = await json(await as("CASHIER", () => read(request(`/bundles/${ids.braai}`, "GET"), params(ids.braai!))));
    expect(view.body.data).toMatchObject({ boughtApart: 10.5, saves: 1, canMake: 5, limitingItem: "Castle Lager 340ml", margin: null });
  });

  it("makes a buy-more deal, refusing Any outside 2 to 24", async () => {
    const deal = { kind: "BUY_MORE", name: "Any 3 ciders", items: [{ productId: ids.savanna }], buyQuantity: 3, price: "5.00", days: "WEEKENDS", until: "31 December 2026" };
    expect((await json(await create(request("/bundles", "POST", { ...deal, buyQuantity: 1 })))).body).toMatchObject({ fieldErrors: { buyQuantity: "Any is 2 to 24." } });
    const made = await json(await create(request("/bundles", "POST", deal)));
    expect(made.status).toBe(201);
    const stored = await prisma.retailBundle.findUniqueOrThrow({ where: { id: made.body.data!.id } });
    expect(stored).toMatchObject({ buyQuantity: 3, days: "WEEKENDS", daysOfWeek: [6, 7] });
    expect(stored.endsOn?.toISOString().slice(0, 10)).toBe("2026-12-31");
  });
});

describe("changing, pausing and stopping it", () => {
  it("changes the price and says what changed", async () => {
    const saved = await json(await change(request(`/bundles/${ids.braai}`, "PATCH", { price: "9.00", tillButton: false }), params(ids.braai!)));
    expect(saved).toMatchObject({ status: 200, body: { changed: 2, message: "Braai pack saved." } });
    const event = await prisma.platformAuditEvent.findFirstOrThrow({ where: { entityId: ids.braai, eventType: "RETAIL_BUNDLE.CHANGED" } });
    expect(event.payloadJson).toContain('"label":"Price"');
  });

  it("pauses it off the tills' snapshot and puts it back on sale", async () => {
    const onTills = async () => (await loadBundleSnapshot(shop.companyId, shop.mainId)).bundles.some((bundle) => bundle.id === ids.braai);
    expect(await onTills()).toBe(true);
    expect((await json(await pause(request("/bundles/pause", "POST", { ids: [ids.braai] })))).body).toMatchObject({ changed: 1 });
    expect(await onTills()).toBe(false);
    expect((await json(await resume(request("/bundles/resume", "POST", { ids: [ids.braai] })))).body).toMatchObject({ changed: 1 });
    expect(await onTills()).toBe(true);
  });

  it("duplicates it as a copy with a new code", async () => {
    const copied = await json(await duplicate(request("/bundles/duplicate", "POST", { ids: [ids.braai] })));
    expect(copied.body).toMatchObject({ created: [{ name: "Braai pack (copy)" }] });
  });

  it("stops it for good, and then refuses a change", async () => {
    expect((await stop(request(`/bundles/${ids.braai}/stop`, "POST"), params(ids.braai!))).status).toBe(200);
    expect(await json(await change(request(`/bundles/${ids.braai}`, "PATCH", { price: "8.50" }), params(ids.braai!)))).toMatchObject({
      status: 409,
      body: { error: "It was stopped. Duplicate it to sell it again." },
    });
    expect((await loadBundleSnapshot(shop.companyId, shop.mainId)).bundles.some((bundle) => bundle.id === ids.braai)).toBe(false);
  });
});
