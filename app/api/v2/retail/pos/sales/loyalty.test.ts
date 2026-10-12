import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";
import { balance } from "@/lib/retail/loyalty/ledger";

/**
 * Points at the till through `POST pos/sales` (CUS-01, W-46): a Gold
 * customer's US$21.40 earns 32, 500 points spent take US$5.00 off spread
 * over the lines, a balance under "Spend from" is refused in the till's
 * words, a replay may not spend, and a full refund takes the 32 back.
 * Against the test database, on a paired till, with only the sign-in faked.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));
vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));
vi.stubEnv("PLATFORM_ROOT_DOMAIN", "apps.localtest.me");

const { POST: SELL } = await import("./route");
const { POST: REFUND } = await import("./[id]/refund/route");

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const slug = `points-${stamp}`;
const key = `points-key-${stamp}`;
const host = `pos.${slug}.apps.localtest.me`;
let companyId = "";
let siteId = "";
let shiftId = "";
let tapiwaId = "";
let rudoId = "";
let wineId = "";

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Points ${stamp}`, slug }, select: { id: true } })).id;
  const owner = await prisma.user.create({
    data: { companyId, name: "Tendai Mhlanga", role: "SUPERADMIN", email: `owner-${stamp}@points.test`, password: "x" },
    select: { id: true },
  });
  const cashierId = (
    await prisma.user.create({
      data: { companyId, name: "Chipo Dube", role: "CASHIER", email: `chipo-${stamp}@points.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  await prisma.retailShopProfile.create({ data: { companyId, businessType: "GENERAL" } });
  // The cashier refunds US$21.40 on her own.
  await prisma.retailTillRules.create({ data: { companyId, refundPinOver: 100 } });
  siteId = (await prisma.site.create({ data: { companyId, name: "Harare Main Branch", code: `MAIN-${stamp}` }, select: { id: true } })).id;
  const location = await prisma.stockLocation.create({ data: { siteId, code: `FLOOR-${stamp}`, name: "Shop floor" } });
  const till = await prisma.retailRegister.create({ data: { companyId, siteId, code: "FRONT", name: "Front till" }, select: { id: true, code: true, name: true } });
  const device = await prisma.retailDevice.create({
    data: { companyId, registerId: till.id, kind: "BROWSER", label: "Windows PC", keyHash: hashDeviceKey(key), pairedById: owner.id },
    select: { id: true },
  });
  shiftId = (
    await prisma.retailShift.create({
      data: {
        companyId,
        shiftNo: "SH-00500",
        registerCode: till.code,
        registerName: till.name,
        registerId: till.id,
        deviceId: device.id,
        siteId,
        cashierId,
        cashierName: "Chipo Dube",
        openedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
      select: { id: true },
    })
  ).id;
  wineId = (await prisma.product.create({ data: { companyId, code: `WINE-${stamp}`, name: "Four Cousins 750ml", standardPrice: 10.7 }, select: { id: true } })).id;
  await prisma.inventoryItem.create({
    data: { itemCode: `WINE-${stamp}`, name: "Four Cousins 750ml", category: "GROCERIES", unit: "pieces", siteId, locationId: location.id, currentStock: 100, unitCost: 5, productId: wineId },
  });
  tapiwaId = (await prisma.customer.create({ data: { companyId, name: "Tapiwa Marange" }, select: { id: true } })).id;
  rudoId = (await prisma.customer.create({ data: { companyId, name: "Rudo Moyo" }, select: { id: true } })).id;
  // Gold: US$1,600 spent in the last year.
  await prisma.retailSale.create({
    data: { companyId, saleNo: `OLD-${stamp}`, siteId, customerId: tapiwaId, totalAmount: 1600, baseAmount: 1600, postedAt: new Date(Date.now() - 30 * 86_400_000) },
  });
  await prisma.retailPointsEntry.create({ data: { companyId, customerId: tapiwaId, kind: "EARNED", points: 2400 } });
  await prisma.retailPointsEntry.create({ data: { companyId, customerId: rudoId, kind: "EARNED", points: 320 } });

  validateSessionMock.mockResolvedValue({
    session: { user: { id: cashierId, companyId, role: "CASHIER", name: "Chipo Dube", email: `chipo-${stamp}@points.test`, enabledFeatures: ["retail.core"] } },
  });
});

afterAll(async () => {
  if (!companyId) return;
  const sales = { sale: { companyId } };
  await prisma.retailPointsEntry.deleteMany({ where: { companyId } });
  await prisma.retailSalePayment.deleteMany({ where: sales });
  await prisma.retailSaleLine.deleteMany({ where: { companyId, sourceLineId: { not: null } } });
  await prisma.retailSaleLine.deleteMany({ where: sales });
  await prisma.retailSale.deleteMany({ where: { companyId, sourceSaleId: { not: null } } });
  await prisma.retailSale.deleteMany({ where: { companyId } });
  await prisma.stockMovement.deleteMany({ where: { item: { site: { companyId } } } });
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId } } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await prisma.retailDevice.deleteMany({ where: { companyId } });
  await prisma.retailRegister.deleteMany({ where: { companyId } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId } } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.retailMessage.deleteMany({ where: { companyId } });
  await prisma.retailShopProfile.deleteMany({ where: { companyId } });
  await prisma.retailTillRules.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.taxTemplateLine.deleteMany({ where: { template: { companyId } } });
  await prisma.postingRule.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

type Body = Record<string, unknown> & { id?: string; error?: string; totalAmount?: unknown; loyalty?: Record<string, unknown> | null };

function request(path: string, body: unknown) {
  return new NextRequest(`http://${host}/api/v2/retail/${path}`, {
    method: "POST",
    headers: { host, cookie: `${DEVICE_COOKIE}=${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const read = async (response: Response) => ({ status: response.status, body: (await response.json()) as Body });
const sell = (ref: string, body: Record<string, unknown>) =>
  SELL(request("pos/sales", { clientRef: `${ref}-${stamp}`, shiftId, items: [{ productId: wineId, quantity: 2 }], ...body })).then(read);

let goldSaleId = "";

describe("points at the till", () => {
  it("earns a Gold customer 32 on US$21.40", async () => {
    const sold = await sell("gold", { customerId: tapiwaId, payments: [{ tenderType: "CASH", amount: 21.4 }] });
    expect(sold.status).toBe(201);
    goldSaleId = sold.body.id!;
    expect(sold.body.loyalty).toEqual({ earned: 32, spent: 0, balance: 2432, tier: "Gold" });
    const rows = await prisma.retailPointsEntry.findMany({ where: { saleId: goldSaleId } });
    expect(rows).toEqual([expect.objectContaining({ kind: "EARNED", points: 32, actorName: "Chipo Dube" })]);
  });

  it("takes US$5.00 off for 500 points, spread over the lines, and the payment is the reduced total", async () => {
    const sold = await sell("spend", { customerId: tapiwaId, pointsToSpend: 500, payments: [{ tenderType: "CASH", amount: 16.4 }] });
    expect(sold.status).toBe(201);
    expect(Number(sold.body.totalAmount)).toBe(16.4);
    expect(sold.body.loyalty).toMatchObject({ spent: 500, earned: 24 });
    const lines = await prisma.retailSaleLine.findMany({ where: { saleId: sold.body.id! }, select: { lineTotal: true } });
    expect(lines.reduce((sum, line) => sum + Number(line.lineTotal), 0)).toBeCloseTo(16.4, 2);
    const spent = await prisma.retailPointsEntry.findFirstOrThrow({ where: { saleId: sold.body.id!, kind: "SPENT" } });
    expect(spent.points).toBe(-500);
    expect(spent.value.toFixed(2)).toBe("5.00");
    const sale = await prisma.retailSale.findUniqueOrThrow({ where: { id: sold.body.id! }, select: { notes: true } });
    expect(sale.notes ?? "").not.toContain("LOYALTY");
  });

  it("refuses points under Spend from in the till's words", async () => {
    const sold = await sell("short", { customerId: rudoId, pointsToSpend: 300, payments: [{ tenderType: "CASH", amount: 18.4 }] });
    expect(sold.status).toBe(400);
    expect(sold.body.error).toBe("Rudo needs 500 points to spend them. They have 320.");
    expect(await balance(prisma, rudoId)).toBe(320);
  });

  it("refuses a replay that spends points", async () => {
    const sold = await sell("replay", {
      customerId: tapiwaId,
      pointsToSpend: 500,
      offlineCreatedAt: new Date(Date.now() - 60_000).toISOString(),
      payments: [{ tenderType: "CASH", amount: 16.4 }],
    });
    expect(sold.status).toBe(409);
    expect(sold.body.error).toBe("Spending points needs the internet.");
  });

  it("takes the 32 back when the US$21.40 sale is refunded in full", async () => {
    const lines = await prisma.retailSaleLine.findMany({ where: { saleId: goldSaleId }, select: { id: true, quantity: true } });
    const refunded = await REFUND(
      request(`pos/sales/${goldSaleId}/refund`, {
        reason: "Damaged",
        lines: lines.map((line) => ({ saleLineId: line.id, quantity: String(Number(line.quantity)) })),
        to: "CASH",
      }),
      { params: Promise.resolve({ id: goldSaleId }) },
    ).then(read);
    expect(refunded.body.error ?? null).toBeNull();
    expect(refunded.status).toBe(201);
    const back = await prisma.retailPointsEntry.findMany({ where: { saleId: refunded.body.id! } });
    expect(back).toEqual([expect.objectContaining({ kind: "REVERSED", points: -32 })]);
  });
});

describe("a sale and its customer (CUS-02)", () => {
  it("names its customer by id only and never changes or adds one", async () => {
    const before = await prisma.customer.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true, email: true } });
    // The old upsert would have renamed Tapiwa, given Rudo this number, or added a customer.
    const named = await sell("named", {
      customerId: rudoId,
      customerName: "tapiwa marange",
      customerPhone: "+263774123388",
      customerEmail: "rudo@example.test",
      payments: [{ tenderType: "CASH", amount: 21.4 }],
    });
    expect(named.status).toBe(201);
    expect([named.body.customerName, named.body.customerPhone]).toEqual(["Rudo Moyo", null]);
    const walkIn = await sell("walk-in", { customerName: "Nyasha Gwenzi", customerPhone: "+263774123399", payments: [{ tenderType: "CASH", amount: 21.4 }] });
    expect(walkIn.status).toBe(201);
    const sale = await prisma.retailSale.findUniqueOrThrow({ where: { id: walkIn.body.id! }, select: { customerId: true, customerName: true } });
    expect(sale).toEqual({ customerId: null, customerName: null });
    const after = await prisma.customer.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true, email: true } });
    expect(after).toEqual(before);
  });

  it("refuses a customer merged away", async () => {
    const merged = await prisma.customer.create({ data: { companyId, name: "T. Marange", mergedIntoId: tapiwaId, archivedAt: new Date() }, select: { id: true } });
    const sold = await sell("merged", { customerId: merged.id, payments: [{ tenderType: "CASH", amount: 21.4 }] });
    expect(sold.status).toBe(400);
  });
});
