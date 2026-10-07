import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { changePrices, defaultPriceList } from "@/lib/retail/prices/change";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

/**
 * `GET pos/pricing` (PRD-05): the till's snapshot with its version as the
 * ETag; the same version asked again answers 304; a price change gives a new
 * version; a scheduled change that has come due is applied before the
 * snapshot is read. A stock clerk, who does not sell, is refused.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { GET } from "./route";

let shop: TestShop;
let castleId = "";
let retailId = "";

const LIMITS = { priceChanges: "MANAGERS" as const, belowCostNeedsOwner: true };

beforeAll(async () => {
  shop = await makeTestShop("Pricing snapshot");
  retailId = (await defaultPriceList(prisma, shop.companyId)).id;
  castleId = (await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.86" }, { siteId: shop.mainId, onHand: 50 })).productId;
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  await prisma.productPriceChange.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
});

function as(role: string) {
  validateSessionMock.mockResolvedValue({
    session: { user: { id: shop.ownerId, companyId: shop.companyId, role, name: "Tendai Mhlanga", email: "owner@pricing.test", enabledFeatures: ["retail.core"] } },
  });
}

const ask = (etag?: string) =>
  GET(
    new NextRequest(`http://pos.test.localtest.me/api/v2/retail/pos/pricing?siteId=${shop.mainId}`, {
      headers: etag ? { "if-none-match": etag } : {},
    }),
  );

const change = (price: string, effectiveAt?: Date) =>
  prisma.$transaction((tx) =>
    changePrices(tx, {
      companyId: shop.companyId,
      actor: shop.owner(),
      listId: retailId,
      rows: [{ productId: castleId, price }],
      source: "TYPED",
      limits: LIMITS,
      effectiveAt: effectiveAt ?? null,
    }),
  );

describe("GET pos/pricing", () => {
  it("answers the snapshot with its version as the ETag, the same until something changes, then 304", async () => {
    as("SUPERADMIN");
    const first = await ask();
    expect(first.status).toBe(200);
    const body = (await first.json()) as { version: string; lists: Array<{ id: string }>; prices: Array<{ productId: string; unitPrice: number }>; defaultListId: string };
    expect(first.headers.get("ETag")).toBe(`"${body.version}"`);
    expect(body.defaultListId).toBe(retailId);
    expect(body.lists.map((list) => list.id)).toEqual([retailId]);
    expect(body.prices).toEqual([{ priceListId: retailId, productId: castleId, minQuantity: 1, unitPrice: 1.2 }]);

    const again = await ask();
    expect(again.headers.get("ETag")).toBe(first.headers.get("ETag"));
    expect((await ask(first.headers.get("ETag")!)).status).toBe(304);
  });

  it("gives a new version after a price change", async () => {
    as("SUPERADMIN");
    const before = (await ask()).headers.get("ETag")!;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await change("1.30");
    const after = await ask(before);
    expect(after.status).toBe(200);
    expect(after.headers.get("ETag")).not.toBe(before);
    const body = (await after.json()) as { prices: Array<{ unitPrice: number }> };
    expect(body.prices[0]?.unitPrice).toBe(1.3);
  });

  it("applies a change that has come due before reading", async () => {
    as("SUPERADMIN");
    await change("1.40", new Date(Date.now() + 60 * 60 * 1000));
    await prisma.productPriceChange.updateMany({
      where: { companyId: shop.companyId, appliedAt: null },
      data: { effectiveAt: new Date(Date.now() - 1000) },
    });
    const body = (await (await ask()).json()) as { prices: Array<{ unitPrice: number }> };
    expect(body.prices[0]?.unitPrice).toBe(1.4);
    expect(await prisma.productPriceChange.count({ where: { companyId: shop.companyId, appliedAt: null } })).toBe(0);
  });

  it("refuses a role that does not sell", async () => {
    as("STOCK_CLERK");
    expect((await ask()).status).toBe(403);
  });
});
