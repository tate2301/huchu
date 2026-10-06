import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";

/**
 * What the till's next screens read off the server: an open price (airtime)
 * sold at what the cashier typed without a manager; the manager who approved
 * a sale, refund or void, named on it; the empties brought back, on their
 * supplier's ledger and on the Paid screen, and taken off again by a void;
 * the shop's name for a deposit value on the shelf; who signs the cash-up off
 * and the next shift's number on the till's context; and the non-cash takings
 * tender by tender on the open shift. Against the test database, on a paired
 * till at the shop's POS host, with only the sign-in faked.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

vi.stubEnv("PLATFORM_ROOT_DOMAIN", "apps.localtest.me");

const { POST: SELL } = await import("./sales/route");
const { POST: REFUND } = await import("./sales/[id]/refund/route");
const { POST: VOID } = await import("./sales/[id]/void/route");
const { GET: CATALOG } = await import("./catalog/route");
const { GET: CURRENT_SHIFT } = await import("./current-shift/route");
const { GET: ME } = await import("../devices/me/route");

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const slug = `tillfeat-${stamp}`;
const key = `tillfeat-key-${stamp}`;
const host = `pos.${slug}.apps.localtest.me`;
let companyId = "";
let siteId = "";
let cashierId = "";
let managerId = "";
let shiftId = "";
let castleId = "";
let zambeziId = "";
let airtimeId = "";
let deltaId = "";
const approver = () => ({ userId: managerId, pin: "2580" });

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Till features ${stamp}`, slug }, select: { id: true } })).id;
  const owner = await prisma.user.create({
    data: { companyId, name: "Tendai Mhlanga", role: "SUPERADMIN", email: `owner-${stamp}@tillfeat.test`, password: "x" },
    select: { id: true },
  });
  managerId = (
    await prisma.user.create({
      data: { companyId, name: "Tafara Nyathi", role: "MANAGER", email: `tafara-${stamp}@tillfeat.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  await prisma.user.create({
    data: { companyId, name: "Anesu Banda", role: "MANAGER", email: `anesu-${stamp}@tillfeat.test`, password: "x" },
  });
  cashierId = (
    await prisma.user.create({
      data: { companyId, name: "Chipo Dube", role: "CASHIER", email: `chipo-${stamp}@tillfeat.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  await prisma.retailTillPin.create({ data: { companyId, userId: managerId, pinHash: await bcrypt.hash("2580", 4) } });
  // A liquor store that takes deposits; no ID check or licence hours, which other tests cover.
  await prisma.retailShopProfile.create({
    data: { companyId, businessType: "LIQUOR", ageCheck: false, licenceHours: false, emptiesAndDeposits: true },
  });
  // A refund over US$1 needs a manager; every void does.
  await prisma.retailTillRules.create({ data: { companyId, refundPinOver: 1, voidPin: "ALWAYS" } });
  await prisma.retailDepositKind.create({ data: { companyId, amount: 0.1, name: "Bottles, 340 to 375ml" } });

  siteId = (await prisma.site.create({ data: { companyId, name: "Harare Main Branch", code: "HRE" }, select: { id: true } })).id;
  const location = await prisma.stockLocation.create({ data: { siteId, code: "FLOOR", name: "Shop floor" } });
  const till = await prisma.retailRegister.create({
    data: { companyId, siteId, code: "FRONT", name: "Front till" },
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
        shiftNo: "SH-00041",
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
  deltaId = (await prisma.vendor.create({ data: { companyId, name: "Delta Beverages" }, select: { id: true } })).id;

  const stocked = async (code: string, data: { name: string; standardPrice: number; returnable?: boolean; depositAmount?: number; supplierId?: string; openPrice?: boolean }) => {
    const id = (await prisma.product.create({ data: { companyId, code: `${code}-${stamp}`, ...data }, select: { id: true } })).id;
    await prisma.inventoryItem.create({
      data: {
        itemCode: `${code}-${stamp}`,
        name: data.name,
        category: "BEVERAGES",
        unit: "pieces",
        siteId,
        locationId: location.id,
        currentStock: 100,
        unitCost: 0.5,
        productId: id,
      },
    });
    return id;
  };
  castleId = await stocked("CASTLE", { name: "Castle Lager 340ml", standardPrice: 1.2, returnable: true, depositAmount: 0.1, supplierId: deltaId });
  zambeziId = await stocked("ZAMBEZI", { name: "Zambezi Lager 375ml", standardPrice: 1.2, returnable: true, depositAmount: 0.1 });
  airtimeId = await stocked("AIRTIME", { name: "Econet airtime", standardPrice: 1, openPrice: true });

  validateSessionMock.mockResolvedValue({
    session: {
      user: { id: cashierId, companyId, role: "CASHIER", name: "Chipo Dube", email: `chipo-${stamp}@tillfeat.test`, enabledFeatures: ["retail.core"] },
    },
  });
});

afterAll(async () => {
  if (!companyId) return;
  const sales = { sale: { companyId } };
  await prisma.retailEmptiesEntry.deleteMany({ where: { companyId } });
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
  await prisma.userSiteAccess.deleteMany({ where: { companyId } });
  await prisma.retailShopProfile.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.vendor.deleteMany({ where: { companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.taxTemplateLine.deleteMany({ where: { template: { companyId } } });
  await prisma.postingRule.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

type Body = Record<string, unknown> & { id?: string; error?: string };

function request(path: string, body?: unknown) {
  return new NextRequest(`http://${host}/api/v2/retail/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { host, cookie: `${DEVICE_COOKIE}=${key}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function read(response: Response): Promise<{ status: number; body: Body }> {
  return { status: response.status, body: await response.json() };
}

/** A sale rung now at the counter. */
const sell = (ref: string, body: Record<string, unknown>) =>
  SELL(request("pos/sales", { clientRef: `${ref}-${stamp}`, shiftId, ...body })).then(read);

const cash = (amount: number) => [{ tenderType: "CASH", currency: "USD", amount }];

const stored = (id: string | undefined) =>
  prisma.retailSale.findUniqueOrThrow({ where: { id: id! }, select: { approvedById: true, approvedByName: true, overrideReason: true } });

describe("an open price (airtime)", () => {
  it("sells at the price the cashier typed, with no reason and no manager", async () => {
    const sold = await sell("airtime", {
      items: [{ productId: airtimeId, quantity: 1, unitPrice: 5 }],
      payments: [{ tenderType: "ECOCASH", amount: 5, reference: "MP2610.1530.A12345" }],
    });
    expect(sold.status).toBe(201);
    const line = await prisma.retailSaleLine.findFirstOrThrow({ where: { saleId: sold.body.id! } });
    expect(Number(line.unitPrice)).toBe(5);
    expect(await stored(sold.body.id)).toEqual({ approvedById: null, approvedByName: null, overrideReason: null });
  });

  it("asks for the price when none was typed", async () => {
    const sold = await sell("airtime-no-price", { items: [{ productId: airtimeId, quantity: 1 }], payments: cash(1) });
    expect(sold).toMatchObject({ status: 400, body: { error: "Type the price of Econet airtime." } });
  });

  it("still treats a typed price over the shelf on any other product as a manager's call", async () => {
    const sold = await sell("castle-up", {
      items: [{ productId: castleId, quantity: 1, unitPrice: 2, emptiesBack: 1 }],
      overrideReason: "Cold one",
      payments: cash(2),
    });
    expect(sold).toMatchObject({ status: 409, body: { needsApprover: true } });
  });
});

describe("the manager who approved it", () => {
  it("is named on a sale whose discount needed them", async () => {
    // Two Castles at US$1.20 less US$1.00 (41%, over the cashier's 10%), and US$0.20 deposit.
    const sold = await sell("discount-approved", {
      items: [{ productId: castleId, quantity: 2 }],
      discountAmount: 1,
      overrideReason: "Regular customer",
      approver: approver(),
      payments: cash(1.6),
    });
    expect(sold.status).toBe(201);
    expect(sold.body.approvedByName).toBe("Tafara Nyathi");
    expect(await stored(sold.body.id)).toMatchObject({ approvedById: managerId, approvedByName: "Tafara Nyathi" });
  });

  it("is named on a refund over the limit", async () => {
    const sold = await sell("to-refund", { items: [{ productId: zambeziId, quantity: 1, emptiesBack: 1 }], payments: cash(1.2) });
    expect(sold.status).toBe(201);
    const line = await prisma.retailSaleLine.findFirstOrThrow({ where: { saleId: sold.body.id! }, select: { id: true } });
    const refunded = await REFUND(
      request(`pos/sales/${sold.body.id}/refund`, {
        shiftId,
        reason: "Damaged",
        lines: [{ saleLineId: line.id, quantity: 1 }],
        payments: [{ tenderType: "CASH", amount: 1.2 }],
        approver: approver(),
      }),
      { params: Promise.resolve({ id: sold.body.id! }) },
    ).then(read);
    expect(refunded.status).toBe(201);
    expect(refunded.body.approvedByName).toBe("Tafara Nyathi");
    expect(await stored(refunded.body.id)).toMatchObject({ approvedById: managerId, approvedByName: "Tafara Nyathi" });
  });
});

describe("empties brought back", () => {
  let saleId = "";

  it("go on the supplier's ledger with the sale, and on the Paid screen", async () => {
    // Three Castles with two empties back (deposit on one), and a Zambezi, whose product has no supplier, swapped.
    const sold = await sell("empties", {
      items: [
        { productId: castleId, quantity: 3, emptiesBack: 2 },
        { productId: zambeziId, quantity: 1, emptiesBack: 1 },
      ],
      payments: cash(4.9),
    });
    expect(sold.status).toBe(201);
    saleId = sold.body.id!;
    expect(sold.body.empties).toEqual([{ supplierId: deltaId, supplierName: "Delta Beverages", quantity: 2 }]);
    const entries = await prisma.retailEmptiesEntry.findMany({ where: { saleId } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ supplierId: deltaId, productId: castleId, siteId, quantity: 2 });
    expect(Number(entries[0]!.depositAmount)).toBe(0.1);
  });

  it("come off it again, by the manager who approved the void", async () => {
    const voided = await VOID(
      request(`pos/sales/${saleId}/void`, { shiftId, reason: "Customer left", approver: approver() }),
      { params: Promise.resolve({ id: saleId }) },
    ).then(read);
    expect(voided.status).toBe(201);
    expect(voided.body.approvedByName).toBe("Tafara Nyathi");
    expect(await stored(voided.body.id)).toMatchObject({ approvedById: managerId, approvedByName: "Tafara Nyathi" });
    const back = await prisma.retailEmptiesEntry.findMany({ where: { saleId: voided.body.id! } });
    expect(back.map((entry) => entry.quantity)).toEqual([-2]);
    const held = await prisma.retailEmptiesEntry.aggregate({ where: { companyId, supplierId: deltaId }, _sum: { quantity: true } });
    expect(held._sum.quantity).toBe(0);
  });
});

describe("the till's shelf", () => {
  it("names the deposit and says which products take a typed price", async () => {
    const shelf = await CATALOG(request("pos/catalog")).then(read);
    expect(shelf.status).toBe(200);
    const items = shelf.body.data as Array<{ id: string; depositName: string | null; openPrice: boolean }>;
    const byId = new Map(items.map((item) => [item.id, item]));
    expect(byId.get(castleId)).toMatchObject({ depositName: "Bottles, 340 to 375ml", openPrice: false });
    expect(byId.get(zambeziId)).toMatchObject({ depositName: "Bottles, 340 to 375ml" });
    expect(byId.get(airtimeId)).toMatchObject({ depositName: null, openPrice: true });
  });
});

describe("the open shift's takings by tender", () => {
  it("puts each non-cash tender beside the cash, every one present", async () => {
    const shift = await CURRENT_SHIFT(request("pos/current-shift")).then(read);
    expect(shift.status).toBe(200);
    const data = shift.body.data as { nonCashByTender: Record<string, number>; nonCashSales: number };
    expect(data.nonCashByTender).toEqual({ CARD: 0, ECOCASH: 5, INNBUCKS: 0, TRANSFER: 0, ON_ACCOUNT: 0, VOUCHER: 0 });
    expect(data.nonCashSales).toBe(5);
  });
});

describe("the till's context", () => {
  const context = async () => {
    const me = await ME(request("devices/me")).then(read);
    expect(me.status).toBe(200);
    return me.body.data as { nextShiftNo: string; signOff: { name: string } | null };
  };

  it("forecasts the next shift's number without taking it", async () => {
    expect((await context()).nextShiftNo).toBe("SH-00042");
    expect((await context()).nextShiftNo).toBe("SH-00042");
    expect(await prisma.idSequence.count({ where: { companyId, entityKey: "RETAIL_SHIFT" } })).toBe(0);
  });

  it("has the cash-up signed off by the site's shop manager, else the first manager by name", async () => {
    const borrowdale = await prisma.site.create({ data: { companyId, name: "Borrowdale", code: "BRW" }, select: { id: true } });
    const elsewhere = await prisma.user.create({
      data: { companyId, name: "Busi Moyo", role: "SHOP_MANAGER", allSites: false, email: `busi-${stamp}@tillfeat.test`, password: "x" },
      select: { id: true },
    });
    await prisma.userSiteAccess.create({ data: { companyId, userId: elsewhere.id, siteId: borrowdale.id } });
    expect((await context()).signOff).toEqual({ name: "Anesu Banda" });

    const here = await prisma.user.create({
      data: { companyId, name: "Rudo Chari", role: "SHOP_MANAGER", allSites: false, email: `rudo-${stamp}@tillfeat.test`, password: "x" },
      select: { id: true },
    });
    await prisma.userSiteAccess.create({ data: { companyId, userId: here.id, siteId } });
    expect((await context()).signOff).toEqual({ name: "Rudo Chari" });
  });
});
