import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { destroySalesShop, makeSalesShop, type SalesShop } from "@/lib/retail/floor/test-fixtures";

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
}, 60_000);

afterAll(async () => {
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
