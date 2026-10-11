import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { computeNavBadges } from "@/lib/retail/nav-badges";
import { PROMOTIONS_NAV_BADGE } from "@/lib/retail/nav-badges/products";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

/**
 * Promotions' routes (PRD-09, W-17) against the test database: a manager
 * makes one and is told when it starts; a cashier and a bookkeeper read but
 * cannot make, change or end one; a stock clerk cannot even read; ends before
 * starts and a code the shop has are refused under their field; a running
 * one's Starts is refused (409); End now ends it, the nav badge counts one
 * fewer, and it cannot be changed after; pause, resume and duplicate post ids.
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
const { GET: chart } = await import("./[id]/chart/route");
const { POST: pause } = await import("./pause/route");
const { POST: resume } = await import("./resume/route");
const { POST: end } = await import("./end/route");
const { POST: duplicate } = await import("./duplicate/route");

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

const festive = () => ({
  name: "Festive season US$2 off spirits",
  kind: "AMOUNT",
  value: "2.00",
  appliesTo: "PRODUCTS",
  productIds: [ids.jameson],
  starts: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  ends: null,
  audience: "EVERYONE",
  stacks: false,
  code: "PROMO-FESTIVE",
});

beforeAll(async () => {
  shop = await makeTestShop("Promotion routes");
  ids.jameson = (await addTestProduct(shop.companyId, { name: "Jameson Irish Whiskey 750ml", price: "27.90", cost: "22.15" }, { siteId: shop.mainId, onHand: 9 })).productId;
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  await prisma.retailPromotion.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
});

describe("who may do what", () => {
  it("refuses a cashier and a bookkeeper a new one; a stock clerk cannot read one", async () => {
    expect((await as("CASHIER", () => create(request("/promotions", "POST", festive())))).status).toBe(403);
    expect((await as("FINANCE_OFFICER", () => create(request("/promotions", "POST", festive())))).status).toBe(403);
    expect((await as("STOCK_CLERK", () => read(request(`/promotions/${ids.jameson}`, "GET"), params(ids.jameson!)))).status).toBe(403);
  });
});

describe("making one", () => {
  it("refuses an end before the start and a code the shop has, under their fields", async () => {
    expect(await json(await create(request("/promotions", "POST", { ...festive(), starts: "2026-10-25T00:00", ends: "2026-10-24T23:00" })))).toMatchObject({
      status: 400,
      body: { error: "It ends before it starts.", fieldErrors: { ends: "It ends before it starts." } },
    });
    const made = await json(await create(request("/promotions", "POST", festive())));
    expect(made).toMatchObject({ status: 201, body: { message: "Festive season US$2 off spirits is running now." } });
    ids.festive = made.body.data!.id;
    expect(await json(await create(request("/promotions", "POST", { ...festive(), name: "Again" })))).toMatchObject({
      status: 400,
      body: { fieldErrors: { code: "There is already a promotion called PROMO-FESTIVE." } },
    });
  });

  it("lets a cashier and a bookkeeper read it, with its figures and its weeks", async () => {
    const view = await json(await as("CASHIER", () => read(request(`/promotions/${ids.festive}`, "GET"), params(ids.festive!))));
    expect(view).toMatchObject({ status: 200, body: { data: { code: "PROMO-FESTIVE", state: "RUNNING", valueLabel: "US$2.00", appliesToLabel: "1 product" } } });
    const weeks = await json(await as("FINANCE_OFFICER", () => chart(request(`/promotions/${ids.festive}/chart?range=3m`, "GET"), params(ids.festive!))));
    expect(weeks.status).toBe(200);
    expect(Array.isArray((weeks.body.data as unknown as { weeks: unknown[] }).weeks)).toBe(true);
    expect((await as("CASHIER", () => end(request("/promotions/end", "POST", { ids: [ids.festive] })))).status).toBe(403);
    expect((await as("FINANCE_OFFICER", () => change(request(`/promotions/${ids.festive}`, "PATCH", { name: "x" }), params(ids.festive!)))).status).toBe(403);
  });
});

describe("changing and ending it", () => {
  it("refuses a running promotion's Starts, and saves its end", async () => {
    expect(await json(await change(request(`/promotions/${ids.festive}`, "PATCH", { starts: "2026-12-01T00:00" }), params(ids.festive!)))).toMatchObject({
      status: 409,
      body: { error: "It has already started. Change when it ends instead." },
    });
    expect(await json(await change(request(`/promotions/${ids.festive}`, "PATCH", { ends: "2027-01-31" }), params(ids.festive!)))).toMatchObject({
      status: 200,
      body: { changed: 1, message: "Promotion saved." },
    });
    const stored = await prisma.retailPromotion.findUniqueOrThrow({ where: { id: ids.festive } });
    expect(stored.endsAt?.toISOString()).toBe("2027-01-31T21:59:00.000Z");
  });

  it("pauses, resumes, duplicates; ends it, counts one fewer on the badge, and refuses a change after", async () => {
    const badge = async () =>
      computeNavBadges({ companyId: shop.companyId, userId: shop.managerId, role: "MANAGER" }, [PROMOTIONS_NAV_BADGE]);
    expect(await badge()).toEqual({ "/retail/products/promotions": "1 on" });
    expect((await json(await pause(request("/promotions/pause", "POST", { ids: [ids.festive] })))).body).toMatchObject({ changed: 1 });
    expect(await badge()).toEqual({});
    expect((await json(await resume(request("/promotions/resume", "POST", { ids: [ids.festive] })))).body).toMatchObject({ changed: 1 });
    expect((await json(await duplicate(request("/promotions/duplicate", "POST", { ids: [ids.festive] })))).body).toMatchObject({
      created: 1,
      data: [{ name: "Festive season US$2 off spirits (copy)" }],
    });
    expect((await json(await end(request("/promotions/end", "POST", { ids: [ids.festive] })))).body).toMatchObject({ changed: 1 });
    expect(await badge()).toEqual({});
    expect(await json(await change(request(`/promotions/${ids.festive}`, "PATCH", { name: "Later" }), params(ids.festive!)))).toMatchObject({
      status: 409,
      body: { error: "It has ended. Duplicate it to run it again." },
    });
    const events = await prisma.platformAuditEvent.findMany({ where: { entityId: ids.festive }, select: { eventType: true } });
    expect(events.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["RETAIL_PROMOTION.CREATED", "RETAIL_PROMOTION.CHANGED", "RETAIL_PROMOTION.PAUSED", "RETAIL_PROMOTION.RESUMED", "RETAIL_PROMOTION.ENDED"]),
    );
  });
});
