import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";
import { saveCountLine, startCount, submitCount } from "@/lib/retail/stock/counts";

/**
 * The count review routes (STK-06), against the test database: a stock clerk
 * may not approve, send back, say why or cancel (403); a manager approves
 * once and a second approval is 409; over the owner's limit a manager is
 * refused with the owner named; the shelf renames until the count is
 * approved; bad bodies are answered under their field or as 400.
 */

let shop: TestShop;
let clerkId: string;
let gin: string;
let jw: string;
const as = { userId: "", role: "SUPERADMIN", name: "Tendai Mhlanga" };

vi.mock("@/app/api/v2/retail/_helpers", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/app/api/v2/retail/_helpers")>();
  return {
    ...real,
    requireRetailSession: async () => ({
      response: null,
      session: { user: { id: as.userId, companyId: shop.companyId, name: as.name, role: as.role } },
    }),
  };
});

const { PATCH: rename } = await import("./[id]/route");
const { PATCH: why } = await import("./[id]/lines/[lineId]/route");
const { POST: approve } = await import("./[id]/approve/route");
const { POST: recount } = await import("./[id]/recount/route");
const { POST: cancel } = await import("./[id]/cancel/route");
const { POST: approveMany } = await import("./approve/route");

const request = (path: string, body: unknown, method = "POST") =>
  new NextRequest(`http://shop.test/api/v2/retail/stock/counts/${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

function act(who: "owner" | "manager" | "clerk") {
  if (who === "owner") Object.assign(as, { userId: shop.ownerId, role: "SUPERADMIN", name: "Tendai Mhlanga" });
  if (who === "manager") Object.assign(as, { userId: shop.managerId, role: "MANAGER", name: "Tafara Nyathi" });
  if (who === "clerk") Object.assign(as, { userId: clerkId, role: "STOCK_CLERK", name: "Tendai Sibanda" });
}

const GRANTS = { view: true, update: true, approve: true, seeCost: true };

async function toApprove(itemId: string, figure: string) {
  const count = await startCount(shop.manager(), { scope: "PRODUCTS", lineIds: [itemId], siteId: shop.mainId, counterId: shop.managerId, blind: true, keepSelling: true });
  const row = await prisma.retailStockCountLine.findFirstOrThrow({ where: { countId: count.id } });
  await saveCountLine(shop.manager(), GRANTS, count.id, row.id, figure);
  await submitCount(shop.manager(), GRANTS, count.id);
  return { id: count.id, countNo: count.countNo, lineId: row.id };
}

beforeAll(async () => {
  shop = await makeTestShop("CountRoutes");
  clerkId = (
    await prisma.user.create({
      data: { email: `clerk-${shop.companyId}@shop.test`, name: "Tendai Sibanda", role: "STOCK_CLERK", companyId: shop.companyId },
      select: { id: true },
    })
  ).id;
  gin = (await addTestProduct(shop.companyId, { name: "Gordon’s Gin 750ml", price: "16.40", cost: "12.40" }, { onHand: 22 })).itemId;
  jw = (await addTestProduct(shop.companyId, { name: "Johnnie Walker Black 750ml", price: "45.00", cost: "33.60" }, { onHand: 10 })).itemId;
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  const { companyId } = shop;
  await prisma.notificationRecipient.deleteMany({ where: { notification: { companyId } } });
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.retailMessage.deleteMany({ where: { companyId } });
  await prisma.retailStockCount.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

describe("who may review a count", () => {
  it("refuses a stock clerk every review action, and changes nothing", async () => {
    const count = await toApprove(gin, "20");
    act("clerk");
    expect((await approve(request(`${count.id}/approve`, undefined), params({ id: count.id }))).status).toBe(403);
    expect((await recount(request(`${count.id}/recount`, {}), params({ id: count.id }))).status).toBe(403);
    expect((await cancel(request(`${count.id}/cancel`, undefined), params({ id: count.id }))).status).toBe(403);
    expect((await approveMany(request("approve", { ids: [count.id] }))).status).toBe(403);
    expect(
      (await why(request(`${count.id}/lines/${count.lineId}`, { why: "BROKEN" }, "PATCH"), params({ id: count.id, lineId: count.lineId }))).status,
    ).toBe(403);
    expect((await prisma.retailStockCount.findUniqueOrThrow({ where: { id: count.id } })).status).toBe("TO_APPROVE");
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: gin } })).currentStock.toNumber()).toBe(22);

    act("manager");
    const answered = await approve(request(`${count.id}/approve`, undefined), params({ id: count.id }));
    expect(answered.status).toBe(200);
    expect((await answered.json()).data).toMatchObject({ differenceValue: -24.8 });
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: gin } })).currentStock.toNumber()).toBe(20);

    const again = await approve(request(`${count.id}/approve`, undefined), params({ id: count.id }));
    expect(again.status).toBe(409);
    expect((await again.json()).error).toBe("This count is not waiting for approval.");
  });

  it("refuses a manager over the owner's limit and names the owner", async () => {
    const count = await toApprove(jw, "6");
    act("manager");
    const refused = await approve(request(`${count.id}/approve`, undefined), params({ id: count.id }));
    expect(refused.status).toBe(403);
    expect((await refused.json()).error).toBe("Over US$100.00 needs the owner. Tendai Mhlanga has been told.");
    act("owner");
    expect((await approve(request(`${count.id}/approve`, undefined), params({ id: count.id }))).status).toBe(200);
  });
});

describe("what the review takes", () => {
  it("says why on a waiting count, renames the shelf until it is approved, and answers bad bodies", async () => {
    const count = await toApprove(gin, "19");
    act("manager");
    const said = await why(request(`${count.id}/lines/${count.lineId}`, { why: "BROKEN" }, "PATCH"), params({ id: count.id, lineId: count.lineId }));
    expect(said.status).toBe(200);
    expect((await prisma.retailStockCountLine.findUniqueOrThrow({ where: { id: count.lineId } })).why).toBe("BROKEN");
    expect(
      (await why(request(`${count.id}/lines/${count.lineId}`, { why: "LOST" }, "PATCH"), params({ id: count.id, lineId: count.lineId }))).status,
    ).toBe(400);

    const renamed = await rename(request(count.id, { name: "Spirits shelf" }, "PATCH"), params({ id: count.id }));
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).data).toMatchObject({ name: "Spirits shelf" });
    const edit = await prisma.platformAuditEvent.findFirstOrThrow({ where: { entityId: count.id, eventType: "RETAIL_RECORD.EDITED" } });
    expect(JSON.parse(edit.payloadJson ?? "{}")).toMatchObject({ label: "Shelf", to: "Spirits shelf" });
    expect((await rename(request(count.id, { name: "" }, "PATCH"), params({ id: count.id }))).status).toBe(400);
    expect((await approveMany(request("approve", { ids: [] }))).status).toBe(400);
    expect((await recount(request(`${count.id}/recount`, { lineIds: ["not-an-id"] }), params({ id: count.id }))).status).toBe(400);

    act("owner");
    expect((await approve(request(`${count.id}/approve`, undefined), params({ id: count.id }))).status).toBe(200);
    const late = await rename(request(count.id, { name: "Back shelf" }, "PATCH"), params({ id: count.id }));
    expect(late.status).toBe(409);
    expect((await late.json()).error).toBe("Approved counts do not change.");
    const closed = await why(request(`${count.id}/lines/${count.lineId}`, { why: "FOUND" }, "PATCH"), params({ id: count.id, lineId: count.lineId }));
    expect(closed.status).toBe(409);
    expect((await cancel(request(`${count.id}/cancel`, undefined), params({ id: count.id }))).status).toBe(409);
  });
});
