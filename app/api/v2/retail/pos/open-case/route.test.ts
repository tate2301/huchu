import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { quantity } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";

/**
 * Cases and singles at the till. The till's shelf says which case a single can
 * be opened from (and how many this branch holds) and which single a case
 * holds; a single with an empty shelf still shows while a case can be opened
 * for it. Opening one where the line is moves the case out and its singles in
 * as `CASE_BROKEN` movements. Against the test database, on a paired till,
 * with only the sign-in faked.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { POST as OPEN_CASE } from "./route";
import { GET as SHELF } from "../catalog/route";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const key = `cases-key-${stamp}`;
let companyId = "";
let siteId = "";
let locationId = "";
let castleId = "";
let castleCaseId = "";
let lionId = "";
let lionCaseId = "";

async function product(code: string, name: string, price: number, pack?: { of: string; size: number }) {
  return (
    await prisma.product.create({
      data: {
        companyId,
        code: `${code}-${stamp}`,
        name,
        standardPrice: price,
        ...(pack ? { packOfId: pack.of, packSize: pack.size } : {}),
      },
      select: { id: true },
    })
  ).id;
}

async function stock(productId: string, code: string, unit: string, onHand: number, cost: number) {
  await prisma.inventoryItem.create({
    data: {
      itemCode: `${code}-${stamp}`,
      name: code,
      category: "BEVERAGES",
      unit,
      siteId,
      locationId,
      productId,
      currentStock: quantity(onHand),
      unitCost: cost,
    },
  });
}

async function shelf() {
  const response = await SHELF(
    new NextRequest("http://pos.test.localtest.me/api/v2/retail/pos/catalog", {
      headers: { cookie: `${DEVICE_COOKIE}=${key}` },
    }),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    data: Array<{ productId: string; openableCase: unknown; caseOf: unknown }>;
  };
  return new Map(body.data.map((item) => [item.productId, item]));
}

async function openCase(productId: string, wanted: number) {
  const response = await OPEN_CASE(
    new NextRequest("http://pos.test.localtest.me/api/v2/retail/pos/open-case", {
      method: "POST",
      headers: { cookie: `${DEVICE_COOKIE}=${key}`, "content-type": "application/json" },
      body: JSON.stringify({ productId, wanted }),
    }),
  );
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Cases ${stamp}`, slug: `till-cases-${stamp}` }, select: { id: true } })).id;
  await prisma.retailShopProfile.create({ data: { companyId, businessType: "LIQUOR" } });
  const ownerId = (
    await prisma.user.create({
      data: { companyId, name: "Tendai Mhlanga", role: "SUPERADMIN", email: `owner-${stamp}@cases.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  const cashierId = (
    await prisma.user.create({
      data: { companyId, name: "Chipo Dube", role: "CASHIER", email: `chipo-${stamp}@cases.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  siteId = (await prisma.site.create({ data: { companyId, name: "Borrowdale", code: "BDL" }, select: { id: true } })).id;
  locationId = (await prisma.stockLocation.create({ data: { siteId, code: "FLOOR", name: "Shop floor" }, select: { id: true } })).id;
  const till = await prisma.retailRegister.create({ data: { companyId, siteId, code: "FRONT", name: "Front till" }, select: { id: true } });
  await prisma.retailDevice.create({
    data: { companyId, registerId: till.id, kind: "BROWSER", label: "Windows PC", keyHash: hashDeviceKey(key), pairedById: ownerId },
  });

  castleId = await product("CASTLE", "Castle Lager 340ml", 1.2);
  castleCaseId = await product("CASTLE-24", "Castle Lager case of 24", 24, { of: castleId, size: 24 });
  lionId = await product("LION", "Lion Lager 375ml", 1.3);
  lionCaseId = await product("LION-12", "Lion Lager case of 12", 14, { of: lionId, size: 12 });
  await stock(castleId, "CASTLE", "bottle", 6, 0.85);
  await stock(castleCaseId, "CASTLE-24", "case", 3, 20.4);
  await stock(lionId, "LION", "bottle", 0, 0.9);
  await stock(lionCaseId, "LION-12", "case", 1, 10.8);

  validateSessionMock.mockResolvedValue({
    session: {
      user: { id: cashierId, companyId, role: "CASHIER", name: "Chipo Dube", email: `chipo-${stamp}@cases.test`, enabledFeatures: ["retail.core"] },
    },
  });
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.stockMovement.deleteMany({ where: { item: { site: { companyId } } } });
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId } } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId } } });
  await prisma.product.updateMany({ where: { companyId }, data: { packOfId: null, packSize: null } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.retailDevice.deleteMany({ where: { companyId } });
  await prisma.retailRegister.deleteMany({ where: { companyId } });
  await prisma.retailShopProfile.deleteMany({ where: { companyId } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("the till's shelf on a shop with cases and singles", () => {
  it("says which case a single opens from and which single a case holds", async () => {
    const lines = await shelf();
    expect(lines.get(castleId)).toMatchObject({
      openableCase: { productId: castleCaseId, name: "Castle Lager case of 24", unitsPerCase: 24, casesOnHand: 3 },
      caseOf: null,
    });
    expect(lines.get(castleCaseId)).toMatchObject({
      openableCase: null,
      caseOf: { productId: castleId, name: "Castle Lager 340ml", unitsPerCase: 24 },
    });
    // No singles of Lion left, but a case of 12 to open: it still shows.
    expect(lines.get(lionId)).toMatchObject({ openableCase: { productId: lionCaseId, casesOnHand: 1 } });
  });
});

describe("opening a case where the line is", () => {
  it("opens the cases a sale of singles needs, as CASE_BROKEN movements", async () => {
    // 30 Castles wanted, 6 on the shelf: one case of 24 covers it.
    expect(await openCase(castleId, 30)).toMatchObject({
      status: 200,
      body: { data: { casesOpened: 1, singlesAdded: 24, singlesOnHand: 30, caseName: "Castle Lager case of 24" } },
    });
    const movements = await prisma.stockMovement.findMany({
      where: { item: { productId: { in: [castleId, castleCaseId] } } },
      select: { movementType: true, reason: true, quantity: true, item: { select: { productId: true } } },
    });
    expect(movements.map((movement) => [movement.item.productId, movement.movementType, movement.reason, Number(movement.quantity)]).sort()).toEqual(
      [
        [castleCaseId, "ISSUE", "CASE_BROKEN", 1],
        [castleId, "RECEIPT", "CASE_BROKEN", 24],
      ].sort(),
    );
  });

  it("opens nothing when the shelf already covers it, or the cases cannot", async () => {
    expect(await openCase(castleId, 10)).toMatchObject({
      status: 409,
      body: { error: "There are enough singles on the shelf already." },
    });
    expect(await openCase(lionId, 30)).toMatchObject({
      status: 409,
      body: { error: "Not enough Lion Lager case of 12 in stock to cover it." },
    });
    expect(await openCase(lionCaseId, 1)).toMatchObject({ status: 404, body: { error: "No case is linked to this product." } });
  });

  it("leaves a case set not to break at the till alone, on the shelf and at the line", async () => {
    await prisma.product.update({ where: { id: lionCaseId }, data: { breakAtTill: false } });
    try {
      // No singles of Lion and no case the till may open: it is off the shelf.
      expect((await shelf()).has(lionId)).toBe(false);
      expect(await openCase(lionId, 12)).toMatchObject({ status: 404, body: { error: "No case is linked to this product." } });
    } finally {
      await prisma.product.update({ where: { id: lionCaseId }, data: { breakAtTill: true } });
    }
  });

  it("is off, on the shelf and at the line, when the shop does not sell cases and singles", async () => {
    await prisma.retailShopProfile.update({ where: { companyId }, data: { casesAndSingles: false } });
    const lines = await shelf();
    expect(lines.get(castleId)).toMatchObject({ openableCase: null, caseOf: null });
    expect(lines.has(lionId)).toBe(false);
    expect(await openCase(lionId, 12)).toMatchObject({
      status: 409,
      body: { error: "This shop does not sell cases and singles." },
    });
  });
});
