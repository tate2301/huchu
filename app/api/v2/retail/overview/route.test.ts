import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { addTestSale, destroySalesShop, makeSalesShop, type SalesShop } from "@/lib/retail/floor/test-fixtures";
import { addTestProduct } from "@/lib/retail/products/test-fixtures";

/**
 * `GET /api/v2/retail/overview` (FLR-08) as the browser calls it: who may
 * read it, what each reader is given, and the input it refuses. Against the
 * test database, with only the sign-in faked.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { GET } from "./route";

let shop: SalesShop;
const people: Record<string, { id: string; role: string }> = {};

function as(who: string) {
  const person = people[who]!;
  validateSessionMock.mockResolvedValue({
    session: { user: { id: person.id, companyId: shop.companyId, role: person.role, name: who, email: `${who}@overview.test`, enabledFeatures: ["retail.core"] } },
  });
}

async function get(query = "") {
  const response = await GET(new NextRequest(`http://hurudza.test/api/v2/retail/overview${query}`));
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  shop = await makeSalesShop("Overview route");
  people.owner = { id: shop.ownerId, role: "SUPERADMIN" };
  people.manager = { id: shop.managerId, role: "MANAGER" };
  for (const [key, role] of [
    ["books", "FINANCE_OFFICER"],
    ["cashier", "CASHIER"],
    ["clerk", "STOCK_CLERK"],
  ] as const) {
    const user = await prisma.user.create({ data: { companyId: shop.companyId, name: key, role, email: `${key}-${shop.companyId}@overview.test` }, select: { id: true } });
    people[key] = { id: user.id, role };
  }
  // Something for every kind of Needs-action row: a drawer left open, a product under its level, a receipt waiting on ZIMRA.
  await prisma.retailShift.create({
    data: {
      companyId: shop.companyId,
      shiftNo: `SH-${Date.now()}`,
      registerCode: "FRONT",
      registerName: "Front till",
      registerId: shop.frontTill,
      siteId: shop.mainId,
      cashierId: shop.chipo,
      cashierName: "Chipo Dube",
      openedAt: new Date(Date.now() - 20 * 3_600_000),
    },
  });
  const low = await addTestProduct(shop.companyId, { name: "Jaggermeister 750ml", price: "30.00", cost: "20.00" }, { onHand: 2, reorderAt: 12 });
  const waiting = await addTestSale(shop, {
    saleNo: "SALE-OVERVIEW-1",
    at: new Date(Date.now() - 60_000),
    lines: [{ item: low, name: "Jaggermeister 750ml", quantity: 1, price: "8.70", cost: "5.00" }],
    deposit: "0.60",
    payments: [{ tender: "ECOCASH", amount: "9.30" }],
  });
  await prisma.retailSale.update({ where: { id: waiting.id }, data: { fiscalWaitsSince: new Date(Date.now() - 120_000) } });
}, 60_000);

afterAll(async () => {
  await prisma.retailShift.deleteMany({ where: { companyId: shop.companyId } });
  await destroySalesShop(shop);
});

describe("GET /overview", () => {
  it("gives the owner and the manager every tile and the open-shift action", async () => {
    for (const who of ["owner", "manager"]) {
      as(who);
      const { status, body } = await get();
      expect(status).toBe(200);
      expect(body.data.period).toBe("today");
      expect(body.data.can.openShift).toBe(true);
      expect(Object.keys(body.data.tiles).sort()).toEqual(
        ["basket", "byDay", "cashiers", "margin", "needsAction", "paid", "sales", "takings", "tillsNow", "toReorder", "topProducts"].sort(),
      );
      expect(body.data.sites.map((site: { name: string }) => site.name)).toHaveLength(2);
    }
  });

  it("lets the bookkeeper read it, without opening a shift", async () => {
    as("books");
    const { status, body } = await get("?period=month&siteId=all");
    expect(status).toBe(200);
    expect(body.data.can.openShift).toBe(false);
    expect(body.data.site).toBeNull();
    expect(body.data.tiles.takings.label).toBe("Takings this month");
  });

  it("opens on the caller's own site, and on every site when asked", async () => {
    as("manager");
    const own = (await get()).body.data;
    expect(own.site).toEqual({ id: shop.mainId, name: expect.any(String) });
    expect((await get("?siteId=all")).body.data.site).toBeNull();
    const second = (await get(`?siteId=${shop.secondId}`)).body.data;
    expect(second.site.id).toBe(shop.secondId);
  });

  it("gives each reader only the Needs-action rows they can act on", async () => {
    as("owner");
    const keys = (await get()).body.data.tiles.needsAction.map((row: { key: string }) => row.key);
    expect(keys).toEqual(["stale-shift", "low-stock", "not-fiscalised"]);
    as("manager");
    expect((await get()).body.data.tiles.needsAction.map((row: { key: string }) => row.key)).toEqual(keys);
    as("books");
    const { body } = await get();
    expect(body.data.tiles.needsAction.map((row: { key: string }) => row.key)).toEqual(["low-stock", "not-fiscalised"]);
  });

  it("splits takings by tender without the bottle deposit", async () => {
    as("owner");
    const { tiles } = (await get()).body.data;
    const paid = tiles.paid.reduce((sum: number, part: { value: string }) => sum + Number(part.value), 0);
    expect(paid).toBeCloseTo(Number(tiles.takings.value), 2);
    expect(tiles.takings.value).toBe("8.70");
  });

  it("refuses the cashier and the stock clerk", async () => {
    for (const who of ["cashier", "clerk"]) {
      as(who);
      const { status, body } = await get();
      expect(status).toBe(403);
      expect(body.error).toMatch(/^Your role cannot /);
    }
  });

  it("refuses a period it does not know and a site that is not the shop's", async () => {
    as("owner");
    expect(await get("?period=year")).toEqual({ status: 400, body: { error: "Choose today, this week or this month." } });
    expect((await get(`?siteId=${randomUUID()}`)).status).toBe(404);
  });
});
