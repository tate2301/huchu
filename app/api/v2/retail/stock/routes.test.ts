import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

/**
 * `POST /stock/adjustments` and `POST /stock/case-breaks` (STK-04), against
 * the test database: once the adjustment commits it is saved, so a journal
 * that fails after it still answers 201 (a retry would take the stock off
 * twice); a How many too big for the line is answered under the field, not as
 * a 500; and a role that holds neither right is told it cannot adjust stock.
 */

let shop: TestShop;
let amarula: { productId: string; itemId: string };
const as = { role: "SUPERADMIN", journalFails: false };

vi.mock("@/app/api/v2/retail/_helpers", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/app/api/v2/retail/_helpers")>();
  return {
    ...real,
    requireRetailSession: async () => ({
      response: null,
      session: { user: { id: shop.ownerId, companyId: shop.companyId, name: "Tendai Mhlanga", role: as.role } },
    }),
    postRetailJournal: async (...args: Parameters<typeof real.postRetailJournal>) => {
      if (as.journalFails) throw new Error("the books are down");
      return real.postRetailJournal(...args);
    },
  };
});

const { POST: adjust } = await import("./adjustments/route");
const { POST: breakCase } = await import("./case-breaks/route");

const request = (path: string, body: unknown) =>
  new NextRequest(`http://shop.test/api/v2/retail/stock/${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

beforeAll(async () => {
  shop = await makeTestShop("StockRoutes");
  amarula = await addTestProduct(shop.companyId, { name: "Amarula Cream 750ml", price: "18.25", cost: "13.03" }, { onHand: 13 });
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  const { companyId } = shop;
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

describe("POST /stock/adjustments", () => {
  it("answers 201 with the saved adjustment when its journal fails after the commit", async () => {
    as.journalFails = true;
    try {
      const answer = await adjust(
        request("adjustments", { productId: amarula.productId, why: "BROKEN", n: "2", note: "Dropped while restocking the shelf." }),
      );
      expect(answer.status).toBe(201);
      const body = await answer.json();
      expect(body).toMatchObject({ data: { delta: -2, onHand: 11, value: 26.06 }, message: "2 off Amarula Cream 750ml. 11 left." });
      expect(body.data.reference).toMatch(/^ADJ-\d{4}$/);
      expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: amarula.itemId } })).currentStock.toNumber()).toBe(11);
    } finally {
      as.journalFails = false;
    }
  });

  it("refuses a How many too big for the line under the field", async () => {
    const answer = await adjust(request("adjustments", { productId: amarula.productId, why: "FOUND", n: "99999999999999999999", note: "Found." }));
    expect(answer.status).toBe(400);
    expect(await answer.json()).toMatchObject({ fieldErrors: { n: "That is more than a shop holds." } });
  });

  it("refuses a photo that did not come from this shop's uploads under the field", async () => {
    const answer = await adjust(
      request("adjustments", { productId: amarula.productId, why: "BROKEN", n: "1", note: "Dropped.", photoUrl: "javascript:alert(1)" }),
    );
    expect(answer.status).toBe(400);
    expect(await answer.json()).toMatchObject({ fieldErrors: { photoUrl: "Add the photo again; that one did not come from here." } });
  });
});

describe("POST /stock/case-breaks", () => {
  it("tells a bookkeeper they cannot adjust stock", async () => {
    as.role = "FINANCE_OFFICER";
    try {
      const answer = await breakCase(request("case-breaks", { caseProductId: amarula.productId, cases: 1 }));
      expect(answer.status).toBe(403);
      expect(await answer.json()).toMatchObject({ error: "Your role cannot adjust stock" });
    } finally {
      as.role = "SUPERADMIN";
    }
  });
});
