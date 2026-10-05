import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";

/**
 * SET-05, W-05: the server stamps the shop's ZiG rate on every ZiG payment and
 * ignores any rate the till sends — on a sale replayed from the offline queue
 * too, which takes the same path (`createRetailSaleTransaction`) as one rung now.
 * Against the test database, on a paired till, with only the sign-in faked.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { POST } from "./route";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const key = `sync-key-${stamp}`;
const HOUR = 60 * 60 * 1000;
let companyId = "";
let cashierId = "";
let shiftId = "";
let productId = "";

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Sync ${stamp}`, slug: `sync-${stamp}` }, select: { id: true } })).id;
  const owner = await prisma.user.create({
    data: { companyId, name: "Tendai Mhlanga", role: "SUPERADMIN", email: `owner-${stamp}@sync.test`, password: "x" },
    select: { id: true },
  });
  cashierId = (
    await prisma.user.create({
      data: { companyId, name: "Chipo Dube", role: "CASHIER", email: `chipo-${stamp}@sync.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  const site = await prisma.site.create({ data: { companyId, name: "Harare Main Branch", code: "HRE" }, select: { id: true } });
  const location = await prisma.stockLocation.create({ data: { siteId: site.id, code: "FLOOR", name: "Shop floor" } });
  const till = await prisma.retailRegister.create({
    data: { companyId, siteId: site.id, code: "FRONT", name: "Front till" },
    select: { id: true, code: true, name: true },
  });
  const device = await prisma.retailDevice.create({
    data: { companyId, registerId: till.id, kind: "BROWSER", label: "Windows PC", keyHash: hashDeviceKey(key), pairedById: owner.id },
    select: { id: true },
  });
  shiftId = (
    await prisma.retailShift.create({
      data: {
        companyId,
        shiftNo: `SH-${stamp}`,
        registerCode: till.code,
        registerName: till.name,
        registerId: till.id,
        deviceId: device.id,
        siteId: site.id,
        cashierId,
        cashierName: "Chipo Dube",
        openedAt: new Date(Date.now() - 4 * HOUR),
      },
      select: { id: true },
    })
  ).id;
  productId = (
    await prisma.product.create({
      data: { companyId, code: `CASTLE-${stamp}`, name: "Castle Lager 340ml", standardPrice: 3.9 },
      select: { id: true },
    })
  ).id;
  await prisma.inventoryItem.create({
    data: {
      itemCode: `CASTLE-${stamp}`,
      name: "Castle Lager 340ml",
      category: "BEVERAGES",
      unit: "pieces",
      siteId: site.id,
      locationId: location.id,
      currentStock: 50,
      unitCost: 2,
      productId,
    },
  });
  // The shop's rate, set an hour ago: 26.80 ZiG to the dollar.
  await prisma.currencyRate.create({
    data: {
      companyId,
      baseCurrency: "USD",
      quoteCurrency: "ZWG",
      rate: 26.8,
      effectiveDate: new Date(Date.now() - HOUR),
      createdById: owner.id,
    },
  });
  validateSessionMock.mockResolvedValue({
    session: {
      user: {
        id: cashierId,
        companyId,
        role: "CASHIER",
        name: "Chipo Dube",
        email: `chipo-${stamp}@sync.test`,
        enabledFeatures: ["retail.core"],
      },
    },
  });
});

afterAll(async () => {
  if (!companyId) return;
  const sales = { sale: { companyId } };
  await prisma.retailSalePayment.deleteMany({ where: sales });
  await prisma.retailSaleLine.deleteMany({ where: sales });
  await prisma.retailSale.deleteMany({ where: { companyId } });
  await prisma.stockMovement.deleteMany({ where: { item: { site: { companyId } } } });
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId } } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await prisma.retailDevice.deleteMany({ where: { companyId } });
  await prisma.retailRegister.deleteMany({ where: { companyId } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId } } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  // The sale's posting seeds the shop's books and writes its journal.
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.taxTemplateLine.deleteMany({ where: { template: { companyId } } });
  await prisma.postingRule.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

function sale(id: string, payment: Record<string, unknown>, soldAt = new Date(Date.now() - 5 * 60 * 1000)) {
  return {
    clientOperationId: id,
    operation: "create-sale",
    offlineCreatedAt: soldAt.toISOString(),
    payload: {
      clientRef: `${id}-${stamp}`,
      shiftId,
      items: [{ productId, quantity: 1 }],
      payments: [payment],
      offlineCreatedAt: soldAt.toISOString(),
      offlineCreated: true,
    },
  };
}

async function sync(operations: unknown[]) {
  const response = await POST(
    new NextRequest("http://pos.test.localtest.me/api/v2/retail/pos/sync", {
      method: "POST",
      headers: { cookie: `${DEVICE_COOKIE}=${key}`, "content-type": "application/json" },
      body: JSON.stringify({ operations }),
    }),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    results: Array<{ clientOperationId: string; status: string; serverId?: string; error?: string; accountingStatus?: string }>;
  };
  return new Map(body.results.map((result) => [result.clientOperationId, result]));
}

async function storedPayment(saleId: string) {
  const stored = await prisma.retailSale.findUniqueOrThrow({ where: { id: saleId }, include: { payments: true } });
  return { sale: stored, payment: stored.payments[0]! };
}

describe("a ZiG cash sale replayed through pos/sync", () => {
  it("is stored at the shop's rate when the till sends none, or another", async () => {
    const results = await sync([
      sale("zig-no-rate", { tenderType: "CASH", currency: "ZWG", amount: 105 }),
      sale("zig-own-rate", { tenderType: "CASH", currency: "ZWG", amount: 105, exchangeRate: 5 }),
    ]);

    for (const id of ["zig-no-rate", "zig-own-rate"]) {
      const result = results.get(id)!;
      // And it balances in the books: the base amount, less the change.
      expect(result).toMatchObject({ status: "synced", accountingStatus: "POSTED" });
      const { sale: stored, payment } = await storedPayment(result.serverId!);
      expect(payment).toMatchObject({ tenderType: "CASH", currency: "ZWG" });
      expect(payment.exchangeRate.toString()).toBe("26.8");
      // ZiG 105 at 26.80 is US$3.92 against US$3.90: two cents change, in dollars.
      expect(payment.baseAmount.toString()).toBe("3.92");
      expect(stored.changeAmount?.toString()).toBe("0.02");
    }
  });

  it("fails the operation for a sale rung before the shop had a rate", async () => {
    const results = await sync([
      sale("zig-before-rate", { tenderType: "CASH", currency: "ZWG", amount: 105 }, new Date(Date.now() - 2 * HOUR)),
    ]);
    expect(results.get("zig-before-rate")).toMatchObject({
      status: "failed",
      error: "There is no ZiG rate yet. Set it in Payments.",
    });
    expect(await prisma.retailSale.count({ where: { companyId, clientRef: `zig-before-rate-${stamp}` } })).toBe(0);
  });
});
