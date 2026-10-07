import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

/**
 * `POST /products` and `PATCH /products/[id]` (PRD-03), against the test
 * database: once the transaction commits the product is saved, so a journal
 * or a view that fails after it still answers 2xx (a retry would otherwise
 * refuse its own name); a body that is not fields, and a figure too big for
 * its column, are answered in words, not a 500.
 */

let shop: TestShop;
const after = { journalFails: false, viewFails: false };

vi.mock("@/app/api/v2/retail/_helpers", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/app/api/v2/retail/_helpers")>();
  return {
    ...real,
    requireRetailSession: async () => ({
      response: null,
      session: { user: { id: shop.ownerId, companyId: shop.companyId, name: "Tendai Mhlanga", role: "SUPERADMIN" } },
    }),
    postRetailJournal: async (...args: Parameters<typeof real.postRetailJournal>) => {
      if (after.journalFails) throw new Error("the books are down");
      return real.postRetailJournal(...args);
    },
  };
});

vi.mock("@/lib/retail/products/view", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/retail/products/view")>();
  return {
    ...real,
    loadProductView: async (...args: Parameters<typeof real.loadProductView>) => {
      if (after.viewFails) throw new Error("the view is down");
      return real.loadProductView(...args);
    },
  };
});

const { POST: add } = await import("./route");
const { PATCH: change } = await import("./[id]/route");

const request = (path: string, method: string, body: unknown) =>
  new NextRequest(`http://shop.test/api/v2/retail/products${path}`, {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  shop = await makeTestShop("ProductRoutes");
}, 60_000);

afterAll(async () => {
  if (shop) await destroyProvisionedTenant(shop.companyId);
});

describe("after the commit", () => {
  it("answers 201 with what was saved when the journal and the view fail, and a retry is refused by name", async () => {
    after.journalFails = true;
    after.viewFails = true;
    try {
      const body = { name: "Savanna Dry 330ml", categoryId: shop.ciderId, price: "2.10", cost: "1.38", openingStock: "48" };
      const answer = await add(request("", "POST", body));
      expect(answer.status).toBe(201);
      const { data } = await answer.json();
      expect(data).toMatchObject({ name: "Savanna Dry 330ml", price: 2.1, code: "SAVANNA-DRY-330ML" });

      const line = await prisma.inventoryItem.findFirstOrThrow({ where: { productId: data.id } });
      expect(line.currentStock.toNumber()).toBe(48);

      const retry = await add(request("", "POST", body));
      expect(retry.status).toBe(400);
      expect(await retry.json()).toMatchObject({ fieldErrors: { name: "There is already a product called Savanna Dry 330ml." } });

      const renamed = await change(request(`/${data.id}`, "PATCH", { name: "Savanna Dry 330ml can" }), params(data.id));
      expect(renamed.status).toBe(200);
      expect(await renamed.json()).toMatchObject({
        data: { id: data.id, name: "Savanna Dry 330ml can" },
        changed: [{ field: "name", from: "Savanna Dry 330ml", to: "Savanna Dry 330ml can" }],
      });
    } finally {
      after.journalFails = false;
      after.viewFails = false;
    }
  });
});

describe("what is answered in words", () => {
  it("answers a body that is not fields with no field, and a figure too big under its field", async () => {
    const garbled = await add(request("", "POST", "a string"));
    expect(garbled.status).toBe(400);
    expect(await garbled.json()).toEqual({ error: "Check the fields.", fieldErrors: {} });

    const big = await add(request("", "POST", { name: "Big", categoryId: shop.ciderId, price: "99999999999999.99" }));
    expect(big.status).toBe(400);
    expect(await big.json()).toMatchObject({ fieldErrors: { price: "Price is too big. Keep it under 10,000,000,000." } });
  });
});
