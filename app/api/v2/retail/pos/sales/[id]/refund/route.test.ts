import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";

/**
 * SET-06, W-64: "Manager PIN for refunds over" holds for a sale's refunds
 * together. A cashier who hands a US$31.20 sale back in two halves of
 * US$15.60 gets the first through on her own and is asked for a manager on
 * the second, which takes the sale's refunds over US$20.00. The reason kept on
 * the refund is the listed reason alone; the approver is in the audit event.
 * Against the test database, on a paired till, with only the sign-in faked.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { POST as REFUND } from "./route";
import { POST as SELL } from "../../route";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const key = `refund-key-${stamp}`;
let companyId = "";
let cashierId = "";
let managerId = "";
let shiftId = "";
let productId = "";

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Refund ${stamp}`, slug: `refund-${stamp}` }, select: { id: true } })).id;
  await prisma.retailPostingSettings.create({ data: { companyId, schedule: "EVERY_SALE" } });
  const owner = await prisma.user.create({
    data: { companyId, name: "Tendai Mhlanga", role: "SUPERADMIN", email: `owner-${stamp}@refund.test`, password: "x" },
    select: { id: true },
  });
  managerId = (
    await prisma.user.create({
      data: { companyId, name: "Tafara Nyathi", role: "MANAGER", email: `tafara-${stamp}@refund.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  cashierId = (
    await prisma.user.create({
      data: { companyId, name: "Chipo Dube", role: "CASHIER", email: `chipo-${stamp}@refund.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  await prisma.retailTillPin.create({ data: { companyId, userId: managerId, pinHash: await bcrypt.hash("2580", 4) } });
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
        openedAt: new Date(Date.now() - 60 * 60 * 1000),
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
  validateSessionMock.mockResolvedValue({
    session: {
      user: {
        id: cashierId,
        companyId,
        role: "CASHIER",
        name: "Chipo Dube",
        email: `chipo-${stamp}@refund.test`,
        enabledFeatures: ["retail.core"],
      },
    },
  });
});

afterAll(async () => {
  if (!companyId) return;
  const sales = { sale: { companyId } };
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
  await prisma.retailTillPin.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.taxTemplateLine.deleteMany({ where: { template: { companyId } } });
  await prisma.postingRule.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

const headers = { cookie: `${DEVICE_COOKIE}=${key}`, "content-type": "application/json" };

async function refund(saleId: string, lineId: string, body: Record<string, unknown> = {}) {
  return REFUND(
    new NextRequest(`http://pos.test.localtest.me/api/v2/retail/pos/sales/${saleId}/refund`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        shiftId,
        reason: "Changed mind",
        lines: [{ saleLineId: lineId, quantity: 4 }],
        payments: [{ tenderType: "CASH", amount: 15.6 }],
        ...body,
      }),
    }),
    { params: Promise.resolve({ id: saleId }) },
  );
}

describe("a sale refunded in pieces (SET-06, W-64)", () => {
  let saleId = "";
  let lineId = "";

  beforeAll(async () => {
    // Eight Castles at US$3.90: US$31.20, over the shop's US$20.00 refund limit.
    const response = await SELL(
      new NextRequest("http://pos.test.localtest.me/api/v2/retail/pos/sales", {
        method: "POST",
        headers,
        body: JSON.stringify({
          clientRef: `eight-castles-${stamp}`,
          shiftId,
          items: [{ productId, quantity: 8 }],
          payments: [{ tenderType: "CASH", currency: "USD", amount: 31.2 }],
        }),
      }),
    );
    expect(response.status).toBe(201);
    const sold = await prisma.retailSale.findFirstOrThrow({
      where: { companyId, clientRef: `eight-castles-${stamp}` },
      include: { lines: true },
    });
    expect(sold.totalAmount.toFixed(2)).toBe("31.20");
    saleId = sold.id;
    lineId = sold.lines[0]!.id;
  });

  it("lets the first half through without a PIN", async () => {
    const response = await refund(saleId, lineId);
    expect(response.status).toBe(201);
  });

  it("asks for a manager on the second half, which takes the sale's refunds over the limit", async () => {
    const response = await refund(saleId, lineId);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      needsApprover: true,
      reason: "Refunds over US$20.00 need a manager PIN.",
    });
    expect(await prisma.retailSale.count({ where: { companyId, sourceSaleId: saleId } })).toBe(1);
  });

  it("takes it with Tafara's PIN, keeping the listed reason and naming her in the audit", async () => {
    const response = await refund(saleId, lineId, { approver: { userId: managerId, pin: "2580" } });
    expect(response.status).toBe(201);
    const data = (await response.json()) as { id: string; overrideReason: string };
    expect(data.overrideReason).toBe("Changed mind");
    const event = await prisma.platformAuditEvent.findFirstOrThrow({
      where: { companyId, eventType: "RETAIL_SALE.REFUNDED", entityId: data.id },
      select: { payloadJson: true },
    });
    expect(JSON.parse(event.payloadJson!)).toMatchObject({ approvedById: managerId, approvedByName: "Tafara Nyathi" });
  });
});
