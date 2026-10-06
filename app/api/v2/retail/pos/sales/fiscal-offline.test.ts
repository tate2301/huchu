import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";

/**
 * SET-08, W-06: "If ZIMRA cannot be reached · Stop selling". While the shop's
 * fiscal device last failed to reach FDMS within five minutes, a new sale on
 * a paired till is refused with 409 `FISCAL_OFFLINE` and nothing is written;
 * a sale the till rang offline is still taken in. Against the test database,
 * with only the sign-in faked.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { POST as SELL } from "./route";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const key = `offline-key-${stamp}`;
let companyId = "";
let shiftId = "";
let productId = "";
let providerId = "";

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Offline ${stamp}`, slug: `offline-${stamp}` }, select: { id: true } })).id;
  const owner = await prisma.user.create({
    data: { companyId, name: "Tendai Mhlanga", role: "SUPERADMIN", email: `owner-${stamp}@offline.test`, password: "x" },
    select: { id: true },
  });
  const cashierId = (
    await prisma.user.create({
      data: { companyId, name: "Chipo Dube", role: "CASHIER", email: `chipo-${stamp}@offline.test`, password: "x" },
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
      },
      select: { id: true },
    })
  ).id;
  productId = (
    await prisma.product.create({
      data: { companyId, code: `CASTLE-${stamp}`, name: "Castle Lager 340ml", standardPrice: 1.2 },
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
      unitCost: 0.8,
      productId,
    },
  });
  // A registered device that has not reached ZIMRA for a minute, in a shop that stops selling.
  providerId = (
    await prisma.fiscalisationProviderConfig.create({
      data: {
        companyId,
        providerKey: "ZIMRA_FDMS",
        deviceId: "0441-2209",
        apiBaseUrl: "http://127.0.0.1:9",
        registeredAt: new Date("2026-03-14T08:20:00Z"),
        lastOkAt: new Date(Date.now() - 10 * 60_000),
        lastFailedAt: new Date(Date.now() - 60_000),
      },
      select: { id: true },
    })
  ).id;
  await prisma.retailFiscalSettings.create({ data: { companyId, whenUnreachable: "STOP_SELLING" } });
  validateSessionMock.mockResolvedValue({
    session: {
      user: { id: cashierId, companyId, role: "CASHIER", name: "Chipo Dube", email: `chipo-${stamp}@offline.test`, enabledFeatures: ["retail.core"] },
    },
  });
});

afterAll(async () => {
  if (!companyId) return;
  const sales = { sale: { companyId } };
  await prisma.fiscalReceipt.deleteMany({ where: { companyId } });
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
  await prisma.retailFiscalSettings.deleteMany({ where: { companyId } });
  await prisma.fiscalisationProviderConfig.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await prisma.taxTemplateLine.deleteMany({ where: { template: { companyId } } });
  await prisma.postingRule.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

function sell(clientRef: string, extra: Record<string, unknown> = {}) {
  return SELL(
    new NextRequest("http://pos.test.localtest.me/api/v2/retail/pos/sales", {
      method: "POST",
      headers: { cookie: `${DEVICE_COOKIE}=${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        clientRef,
        shiftId,
        items: [{ productId, quantity: 1 }],
        payments: [{ tenderType: "CASH", currency: "USD", amount: 1.2 }],
        ...extra,
      }),
    }),
  );
}

describe("selling while ZIMRA cannot be reached (SET-08, W-06)", () => {
  it("refuses a new sale with FISCAL_OFFLINE when the shop stops selling, and writes nothing", async () => {
    const response = await sell(`stopped-${stamp}`);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "FISCAL_OFFLINE",
      error: "ZIMRA cannot be reached, and this shop stops selling until it answers. Try again in a few minutes.",
    });
    expect(await prisma.retailSale.count({ where: { companyId } })).toBe(0);
  });

  it("takes in a sale the till rang offline", async () => {
    const response = await sell(`rung-offline-${stamp}`, { offlineCreatedAt: new Date(Date.now() - 30_000).toISOString() });
    expect(response.status).toBe(201);
  });

  it("sells as before once the shop keeps selling", async () => {
    await prisma.retailFiscalSettings.update({ where: { companyId }, data: { whenUnreachable: "KEEP_SELLING" } });
    const response = await sell(`kept-${stamp}`);
    expect(response.status).toBe(201);
    expect(providerId).toBeTruthy();
  });
});
