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
 *
 * `PATCH /stock/lines/[id]` and `GET`/`PUT /stock/reorder` (STK-02): a bad
 * value answers under its field, another shop's line is not found, the
 * reorder levels save all or none, and a stock clerk may not change them.
 */

let shop: TestShop;
let other: TestShop;
let amarula: { productId: string; itemId: string };
let jameson: { productId: string; itemId: string };
let foreign: { productId: string; itemId: string };
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
const { PATCH: patchLine } = await import("./lines/[id]/route");
const { GET: readReorder, PUT: saveReorder } = await import("./reorder/route");

const request = (path: string, body: unknown, method = "POST") =>
  new NextRequest(`http://shop.test/api/v2/retail/stock/${path}`, {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

/** A body as sent, not as JSON: what a broken client or a hand-typed request sends. */
const raw = (path: string, body: string, method: string) =>
  new NextRequest(`http://shop.test/api/v2/retail/stock/${path}`, { method, body, headers: { "Content-Type": "application/json" } });

const minStock = async (itemId: string) =>
  (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId }, select: { minStock: true } })).minStock?.toNumber() ?? null;

beforeAll(async () => {
  shop = await makeTestShop("StockRoutes");
  amarula = await addTestProduct(shop.companyId, { name: "Amarula Cream 750ml", price: "18.25", cost: "13.03" }, { onHand: 13 });
  jameson = await addTestProduct(shop.companyId, { name: "Jameson Irish Whiskey 750ml", price: "27.90", cost: "22.15" }, { onHand: 9, reorderAt: 12 });
  other = await makeTestShop("StockRoutesOther");
  foreign = await addTestProduct(other.companyId, { name: "Gordon’s Gin 750ml", price: "16.40", cost: "12.40" }, { onHand: 18, reorderAt: 6 });
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  const { companyId } = shop;
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
  if (other) await destroyProvisionedTenant(other.companyId);
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

describe("PATCH /stock/lines/[id]", () => {
  const patch = (id: string, body: unknown) => patchLine(request(`lines/${id}`, body, "PATCH"), { params: Promise.resolve({ id }) });

  it("refuses a level below nothing under its field", async () => {
    const answer = await patch(jameson.itemId, { reorderAt: -1 });
    expect(answer.status).toBe(400);
    expect(await answer.json()).toMatchObject({ fieldErrors: { reorderAt: "Reorder at is a number, 0 or more." } });
    const zero = await patch(jameson.itemId, { reorderQty: 0 });
    expect(await zero.json()).toMatchObject({ fieldErrors: { reorderQty: "Reorder is a number above 0." } });
  });

  it("refuses a body that is not JSON, or that changes nothing, saving nothing", async () => {
    const before = await minStock(jameson.itemId);
    const broken = await patchLine(raw(`lines/${jameson.itemId}`, "reorderAt=4", "PATCH"), { params: Promise.resolve({ id: jameson.itemId }) });
    expect(broken.status).toBe(400);
    expect(await broken.json()).toMatchObject({ error: "Nothing to change." });
    for (const body of [{}, { colour: "red" }, []]) {
      const answer = await patch(jameson.itemId, body);
      expect(answer.status).toBe(400);
      expect(await answer.json()).toMatchObject({ error: "Nothing to change." });
    }
    expect(await minStock(jameson.itemId)).toBe(before);
  });

  it("does not find another shop's line", async () => {
    const answer = await patch(foreign.itemId, { reorderAt: 4 });
    expect(answer.status).toBe(404);
    expect(await answer.json()).toMatchObject({ error: "That stock line is not this shop’s." });
    expect(await minStock(foreign.itemId)).toBe(6);
  });

  it("changes the levels and the shelf, and says so on the product", async () => {
    const answer = await patch(jameson.itemId, { reorderAt: 14, reorderQty: "24", shelf: "Shelf 2, top" });
    expect(answer.status).toBe(200);
    const body = await answer.json();
    expect(body.data).toMatchObject({ id: jameson.itemId, reorderAt: 14, reorderQty: 24, shelf: "Shelf 2, top" });
    expect(body.changed.map((change: { label: string }) => change.label)).toEqual(["Reorder at", "Reorder", "Shelf"]);
    const events = await prisma.platformAuditEvent.findMany({
      where: { companyId: shop.companyId, entityType: "Product", entityId: jameson.productId, eventType: "RETAIL_RECORD.EDITED" },
    });
    expect(events.map((event) => (JSON.parse(event.payloadJson ?? "{}") as { label: string }).label).sort()).toEqual(["Reorder", "Reorder at", "Shelf"]);
  });

  it("refuses a place that is not at the line's site", async () => {
    const elsewhere = await prisma.stockLocation.findFirstOrThrow({ where: { siteId: other.mainId }, select: { id: true } });
    const answer = await patch(jameson.itemId, { placeId: elsewhere.id });
    expect(answer.status).toBe(400);
    expect(await answer.json()).toMatchObject({ fieldErrors: { placeId: "That place is not at this site." } });
  });

  it("is not for a stock clerk", async () => {
    as.role = "STOCK_CLERK";
    try {
      expect((await patch(jameson.itemId, { reorderAt: 10 })).status).toBe(403);
    } finally {
      as.role = "SUPERADMIN";
    }
  });
});

describe("GET and PUT /stock/reorder", () => {
  const put = (body: unknown) => saveReorder(request("reorder", body, "PUT"));

  it("reads what each ticked line sells, its level and its cost", async () => {
    const answer = await readReorder(new NextRequest(`http://shop.test/api/v2/retail/stock/reorder?lineIds=${amarula.itemId},${jameson.itemId}`));
    expect(answer.status).toBe(200);
    const body = await answer.json();
    expect(body.keepDays).toBe(14);
    expect(body.data.map((line: { product: string }) => line.product)).toEqual(["Amarula Cream 750ml", "Jameson Irish Whiskey 750ml"]);
    expect(body.data[0]).toMatchObject({ lineId: amarula.itemId, perDay: 0, leadDays: 0, caseSize: null, unitCost: 13.03 });
  });

  it("refuses a body that is not JSON", async () => {
    const answer = await saveReorder(raw("reorder", "levels=40", "PUT"));
    expect(answer.status).toBe(400);
    expect(await answer.json()).toMatchObject({ error: "Nothing to change." });
  });

  it("saves nothing when one line is another shop's", async () => {
    const before = await minStock(amarula.itemId);
    const answer = await put({ levels: [{ lineId: amarula.itemId, reorderAt: 40 }, { lineId: foreign.itemId, reorderAt: 40 }] });
    expect(answer.status).toBe(404);
    expect(await minStock(amarula.itemId)).toBe(before);
    expect(await minStock(foreign.itemId)).toBe(6);
  });

  it("refuses a bad level under its line, saving nothing", async () => {
    const answer = await put({ levels: [{ lineId: amarula.itemId, reorderAt: 40 }, { lineId: jameson.itemId, reorderAt: -3 }] });
    expect(answer.status).toBe(400);
    expect(await answer.json()).toMatchObject({ fieldErrors: { "levels.1": "Reorder at is a number, 0 or more." } });
    expect(await minStock(amarula.itemId)).toBeNull();
  });

  it("saves every level, and Activity says what changed", async () => {
    const answer = await put({ levels: [{ lineId: amarula.itemId, reorderAt: "40" }, { lineId: jameson.itemId, reorderAt: 14 }] });
    expect(answer.status).toBe(200);
    // Jameson was already 14: only Amarula changed.
    expect(await answer.json()).toMatchObject({ saved: 1 });
    expect(await minStock(amarula.itemId)).toBe(40);
    const event = await prisma.platformAuditEvent.findFirstOrThrow({
      where: { companyId: shop.companyId, entityId: amarula.productId, eventType: "RETAIL_RECORD.EDITED" },
    });
    expect(JSON.parse(event.payloadJson ?? "{}")).toMatchObject({ field: "reorderAt", label: "Reorder at", from: null, to: "40" });
  });

  it("is not for a stock clerk", async () => {
    as.role = "STOCK_CLERK";
    try {
      expect((await put({ levels: [{ lineId: amarula.itemId, reorderAt: 1 }] })).status).toBe(403);
    } finally {
      as.role = "SUPERADMIN";
    }
  });
});
