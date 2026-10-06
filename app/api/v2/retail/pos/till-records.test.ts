import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";
import { getCustomerLoyaltyBalance } from "@/lib/retail/loyalty";

/**
 * What the till's records read back (boards Sale, Refunded, Activity,
 * Customers): a sale's record names the customer with their phone, tier and
 * points, the empties that came back on it, and the manager who approved each
 * refund or void; My activity names who approved a refund, a void or a
 * discount; a customer comes with their last sale. Against the test database,
 * on a paired till at the shop's POS host, with only the sign-in faked.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

vi.stubEnv("PLATFORM_ROOT_DOMAIN", "apps.localtest.me");

const { POST: SELL } = await import("./sales/route");
const { GET: SALE } = await import("./sales/[id]/route");
const { POST: REFUND } = await import("./sales/[id]/refund/route");
const { POST: VOID } = await import("./sales/[id]/void/route");
const { GET: ACTIVITY } = await import("./activity/route");
const { GET: CUSTOMERS } = await import("../customers/search/route");

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const slug = `tillrec-${stamp}`;
const key = `tillrec-key-${stamp}`;
const host = `pos.${slug}.apps.localtest.me`;
const tapiwa = `Tapiwa Mhlanga ${stamp}`;
let companyId = "";
let cashierId = "";
let managerId = "";
let shiftId = "";
let customerId = "";
let castleId = "";
let riceId = "";
let deltaId = "";
const approver = () => ({ userId: managerId, pin: "2580" });

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Till records ${stamp}`, slug }, select: { id: true } })).id;
  const owner = await prisma.user.create({
    data: { companyId, name: "Tendai Mhlanga", role: "SUPERADMIN", email: `owner-${stamp}@tillrec.test`, password: "x" },
    select: { id: true },
  });
  managerId = (
    await prisma.user.create({
      data: { companyId, name: "Farai Mutasa", role: "MANAGER", email: `farai-${stamp}@tillrec.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  cashierId = (
    await prisma.user.create({
      data: { companyId, name: "Rudo Moyo", role: "CASHIER", email: `rudo-${stamp}@tillrec.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  await prisma.retailTillPin.create({ data: { companyId, userId: managerId, pinHash: await bcrypt.hash("2580", 4) } });
  await prisma.retailShopProfile.create({
    data: { companyId, businessType: "LIQUOR", ageCheck: false, licenceHours: false, emptiesAndDeposits: true },
  });
  // A refund over US$1 needs a manager; every void does.
  await prisma.retailTillRules.create({ data: { companyId, refundPinOver: 1, voidPin: "ALWAYS" } });

  const siteId = (await prisma.site.create({ data: { companyId, name: "Mbare Corner", code: "MBR" }, select: { id: true } })).id;
  const location = await prisma.stockLocation.create({ data: { siteId, code: "FLOOR", name: "Shop floor" } });
  const till = await prisma.retailRegister.create({
    data: { companyId, siteId, code: "TILL1", name: "Till 1" },
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
        shiftNo: "SH-00418",
        registerCode: till.code,
        registerName: till.name,
        registerId: till.id,
        deviceId: device.id,
        siteId,
        cashierId,
        cashierName: "Rudo Moyo",
        openedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
      select: { id: true },
    })
  ).id;
  deltaId = (await prisma.vendor.create({ data: { companyId, name: "Delta Beverages" }, select: { id: true } })).id;
  customerId = (await prisma.customer.create({ data: { companyId, name: tapiwa, phone: "0772 418 330" }, select: { id: true } })).id;

  const stocked = async (code: string, data: { name: string; standardPrice: number; returnable?: boolean; depositAmount?: number; supplierId?: string }) => {
    const id = (await prisma.product.create({ data: { companyId, code: `${code}-${stamp}`, ...data }, select: { id: true } })).id;
    await prisma.inventoryItem.create({
      data: {
        itemCode: `${code}-${stamp}`,
        name: data.name,
        category: "GROCERIES",
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
  riceId = await stocked("RICE", { name: "Rice, 2kg", standardPrice: 2.8 });

  validateSessionMock.mockResolvedValue({
    session: {
      user: { id: cashierId, companyId, role: "CASHIER", name: "Rudo Moyo", email: `rudo-${stamp}@tillrec.test`, enabledFeatures: ["retail.core"] },
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
  await prisma.retailShopProfile.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.vendor.deleteMany({ where: { companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.taxTemplateLine.deleteMany({ where: { template: { companyId } } });
  await prisma.postingRule.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

type Body = Record<string, unknown> & { id?: string; saleNo?: string; error?: string; data?: unknown };

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

const sell = (ref: string, body: Record<string, unknown>) =>
  SELL(request("pos/sales", { clientRef: `${ref}-${stamp}`, shiftId, ...body })).then(read);
const params = (id: string) => ({ params: Promise.resolve({ id }) });

type Record_ = {
  approvedByName: string | null;
  empties: Array<{ supplierName: string; quantity: number }>;
  customer: { phone: string | null; tier: string; balance: number; earned: number; returned: number } | null;
  reversals: Array<{ saleType: string; approvedByName: string | null }>;
};
const record = async (id: string) => {
  const answer = await SALE(request(`pos/sales/${id}`), params(id)).then(read);
  expect(answer.status).toBe(200);
  return answer.body.data as Record_;
};

let tapiwaSale: { id: string; saleNo: string } = { id: "", saleNo: "" };
let discountSaleId = "";
let voidedId = "";

describe("a sale's record", () => {
  it("names the customer with their phone, tier and the points the sale earned, and the empties back", async () => {
    // Five rice at US$2.80 and three Castles at US$1.20 with two empties back: US$17.60 of goods and US$0.10 deposit.
    const sold = await sell("tapiwa", {
      customerId,
      items: [
        { productId: riceId, quantity: 5 },
        { productId: castleId, quantity: 3, emptiesBack: 2 },
      ],
      payments: [{ tenderType: "CASH", amount: 17.7 }],
    });
    expect(sold.status).toBe(201);
    tapiwaSale = { id: sold.body.id!, saleNo: sold.body.saleNo! };

    const sale = await record(tapiwaSale.id);
    const loyalty = await getCustomerLoyaltyBalance({ companyId, customerName: tapiwa });
    expect(sale.customer).toEqual({ phone: "0772 418 330", tier: "BRONZE", balance: loyalty.balance, earned: 17, returned: 0 });
    expect(sale.empties).toEqual([expect.objectContaining({ supplierName: "Delta Beverages", quantity: 2 })]);
    expect(sale.approvedByName).toBeNull();
  });

  it("names the manager who approved a refund, and the points the refund took back", async () => {
    const rice = await prisma.retailSaleLine.findFirstOrThrow({ where: { saleId: tapiwaSale.id, productId: riceId }, select: { id: true } });
    const refunded = await REFUND(
      request(`pos/sales/${tapiwaSale.id}/refund`, {
        shiftId,
        reason: "Damaged",
        lines: [{ saleLineId: rice.id, quantity: 1 }],
        payments: [{ tenderType: "CASH", amount: 2.8 }],
        approver: approver(),
      }),
      params(tapiwaSale.id),
    ).then(read);
    expect(refunded.status).toBe(201);

    const sale = await record(tapiwaSale.id);
    expect(sale.reversals).toEqual([expect.objectContaining({ saleType: "REFUND", approvedByName: "Farai Mutasa" })]);
    // US$17.60 earned 17; US$14.80 left earns 14, so 3 came back.
    expect(sale.customer).toMatchObject({ earned: 17, returned: 3 });
  });

  it("names the manager on a sale whose discount they approved", async () => {
    const sold = await sell("discount", {
      items: [{ productId: castleId, quantity: 2 }],
      discountAmount: 1,
      overrideReason: "Regular customer",
      approver: approver(),
      payments: [{ tenderType: "CASH", amount: 1.6 }],
    });
    expect(sold.status).toBe(201);
    discountSaleId = sold.body.id!;
    const sale = await record(discountSaleId);
    expect(sale.approvedByName).toBe("Farai Mutasa");
    expect(sale.customer).toBeNull();
    expect(sale.empties).toEqual([]);
  });

  it("names the manager who approved a void, and the void hands back exactly the points the sale earned", async () => {
    const before = await getCustomerLoyaltyBalance({ companyId, customerName: tapiwa });
    const sold = await sell("to-void", { customerId, items: [{ productId: riceId, quantity: 1 }], payments: [{ tenderType: "CASH", amount: 2.8 }] });
    expect(sold.status).toBe(201);
    voidedId = sold.body.id!;
    const voided = await VOID(request(`pos/sales/${voidedId}/void`, { shiftId, reason: "Rang up wrong", approver: approver() }), params(voidedId)).then(read);
    expect(voided).toMatchObject({ status: 201 });
    const sale = await record(voidedId);
    expect(sale.reversals).toEqual([expect.objectContaining({ saleType: "VOID", approvedByName: "Farai Mutasa" })]);
    expect(sale.customer).toMatchObject({ earned: 2, returned: 2 });
    // The voided sale and its void row come to nothing: the balance is where it was, not 2 lower.
    expect((await getCustomerLoyaltyBalance({ companyId, customerName: tapiwa })).earnedPoints).toBe(before.earnedPoints);
  });
});

describe("my activity", () => {
  it("names who approved a refund, a void and a discount, and nothing else", async () => {
    const answer = await ACTIVITY(request("pos/activity")).then(read);
    expect(answer.status).toBe(200);
    const entries = (answer.body.data as { entries: Array<{ id: string; kind: string; approvedBy: string | null }> }).entries;
    const approved = entries.filter((entry) => entry.approvedBy);
    expect(approved.map((entry) => entry.kind).sort()).toEqual(["override", "refund", "void"]);
    expect(approved.every((entry) => entry.approvedBy === "Farai Mutasa")).toBe(true);
    expect(entries.find((entry) => entry.id === `sale:${discountSaleId}`)?.approvedBy).toBeNull();
  });
});

describe("a customer", () => {
  it("comes with their last sale, a voided one left out", async () => {
    const answer = await CUSTOMERS(request(`customers/search?q=${encodeURIComponent(tapiwa)}`)).then(read);
    expect(answer.status).toBe(200);
    const [found] = answer.body.data as Array<{ id: string; lastSale: { saleNo: string; total: number; at: string } | null }>;
    expect(found.id).toBe(customerId);
    expect(found.lastSale).toMatchObject({ saleNo: tapiwaSale.saleNo, total: 17.7 });
    expect(Number.isNaN(Date.parse(found.lastSale!.at))).toBe(false);
  });
});
