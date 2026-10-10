import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";

/**
 * The till's shelf opens on "Most sold": units on posted sales at this till's
 * branch over the last 30 days, most first, then whatever has not sold, by
 * name. A void, a refund, a sale at another branch and a sale from before the
 * 30 days do not count. A category keeps the same order. Against the test
 * database, on a paired till, with only the sign-in faked.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { GET as SHELF } from "./route";

const DAY = 24 * 60 * 60 * 1000;
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const key = `most-sold-key-${stamp}`;
let companyId = "";
let siteId = "";
let otherSiteId = "";
let saleNo = 0;
const ids: Record<string, string> = {};
const stockIds: Record<string, string> = {};

async function shelf(category?: string) {
  const query = category ? `?category=${encodeURIComponent(category)}` : "";
  const response = await SHELF(
    new NextRequest(`http://pos.test.localtest.me/api/v2/retail/pos/catalog${query}`, {
      headers: { cookie: `${DEVICE_COOKIE}=${key}` },
    }),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: Array<{ id: string; name: string }> };
  return body.data.map((item) => item.name);
}

/** One sale of a product, as `pos/sales` would have left it. */
async function sold(
  product: string,
  quantity: number,
  options: { site?: string; daysAgo?: number; status?: "POSTED" | "VOIDED"; saleType?: "SALE" | "REFUND" } = {},
) {
  saleNo += 1;
  const sale = await prisma.retailSale.create({
    data: {
      companyId,
      saleNo: `S-${saleNo}-${stamp}`,
      siteId: options.site ?? siteId,
      saleType: options.saleType ?? "SALE",
      status: options.status ?? "POSTED",
      postedAt: new Date(Date.now() - (options.daysAgo ?? 1) * DAY),
    },
    select: { id: true },
  });
  await prisma.retailSaleLine.create({
    data: { companyId, saleId: sale.id, inventoryItemId: stockIds[product], productId: ids[product], itemName: product, quantity },
  });
}

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Most sold ${stamp}`, slug: `till-most-sold-${stamp}` }, select: { id: true } })).id;
  await prisma.retailShopProfile.create({ data: { companyId, businessType: "GENERAL" } });
  const ownerId = (
    await prisma.user.create({
      data: { companyId, name: "Tendai Mhlanga", role: "SUPERADMIN", email: `owner-${stamp}@most-sold.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  const cashierId = (
    await prisma.user.create({
      data: { companyId, name: "Rudo Moyo", role: "CASHIER", email: `rudo-${stamp}@most-sold.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  siteId = (await prisma.site.create({ data: { companyId, name: "Mbare", code: "MBR" }, select: { id: true } })).id;
  otherSiteId = (await prisma.site.create({ data: { companyId, name: "Borrowdale", code: "BDL" }, select: { id: true } })).id;
  const locationId = (await prisma.stockLocation.create({ data: { siteId, code: "FLOOR", name: "Shop floor" }, select: { id: true } })).id;
  const otherLocationId = (
    await prisma.stockLocation.create({ data: { siteId: otherSiteId, code: "FLOOR", name: "Shop floor" }, select: { id: true } })
  ).id;
  const till = await prisma.retailRegister.create({ data: { companyId, siteId, code: "T1", name: "Till 1" }, select: { id: true } });
  await prisma.retailShift.create({
    data: { companyId, shiftNo: "SH-1", registerCode: "T1", registerName: "Till 1", registerId: till.id, siteId, cashierId, cashierName: "Rudo Moyo" },
  });
  await prisma.retailDevice.create({
    data: { companyId, registerId: till.id, kind: "BROWSER", label: "Windows PC", keyHash: hashDeviceKey(key), pairedById: ownerId },
  });
  const groceries = (await prisma.retailCategory.create({ data: { companyId, name: "Groceries" }, select: { id: true } })).id;

  // Named so that alphabetical order is not the answer.
  const range: Array<[string, string | null]> = [
    ["Airtime", null],
    ["Bread, white loaf", groceries],
    ["Cooking oil, 2L", groceries],
    ["Eggs, each", groceries],
    ["Matches, box", null],
    ["Sugar, 2kg", groceries],
  ];
  for (const [index, [name, categoryId]] of range.entries()) {
    const code = `P${index}-${stamp}`;
    ids[name] = (await prisma.product.create({ data: { companyId, code, name, standardPrice: 1, categoryId }, select: { id: true } })).id;
    stockIds[name] = (
      await prisma.inventoryItem.create({
        data: { itemCode: code, name, category: "CONSUMABLES", unit: "each", siteId, locationId, productId: ids[name], currentStock: 50 },
        select: { id: true },
      })
    ).id;
  }
  // The other branch stocks matches too, and sells far more of them.
  const otherMatches = await prisma.inventoryItem.create({
    data: {
      itemCode: `P4-${stamp}-BDL`,
      name: "Matches, box",
      category: "CONSUMABLES",
      unit: "each",
      siteId: otherSiteId,
      locationId: otherLocationId,
      productId: ids["Matches, box"],
      currentStock: 50,
    },
    select: { id: true },
  });

  await sold("Sugar, 2kg", 3);
  await sold("Sugar, 2kg", 4);
  await sold("Eggs, each", 6);
  await sold("Matches, box", 2);
  // None of these count.
  await sold("Bread, white loaf", 40, { status: "VOIDED" });
  await sold("Bread, white loaf", 40, { daysAgo: 31 });
  await sold("Cooking oil, 2L", 40, { saleType: "REFUND" });
  stockIds["Matches, box at Borrowdale"] = otherMatches.id;
  ids["Matches, box at Borrowdale"] = ids["Matches, box"];
  await sold("Matches, box at Borrowdale", 90, { site: otherSiteId });

  validateSessionMock.mockResolvedValue({
    session: {
      user: { id: cashierId, companyId, role: "CASHIER", name: "Rudo Moyo", email: `rudo-${stamp}@most-sold.test`, enabledFeatures: ["retail.core"] },
    },
  });
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.retailSaleLine.deleteMany({ where: { companyId } });
  await prisma.retailSale.deleteMany({ where: { companyId } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId } } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId } } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.retailCategory.deleteMany({ where: { companyId } });
  await prisma.retailDevice.deleteMany({ where: { companyId } });
  await prisma.retailRegister.deleteMany({ where: { companyId } });
  await prisma.retailShopProfile.deleteMany({ where: { companyId } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("the till's shelf, most sold first", () => {
  it("ranks by units sold here in the last 30 days, then the rest by name", async () => {
    expect(await shelf()).toEqual(["Sugar, 2kg", "Eggs, each", "Matches, box", "Airtime", "Bread, white loaf", "Cooking oil, 2L"]);
  });

  it("keeps the order inside a category", async () => {
    expect(await shelf("Groceries")).toEqual(["Sugar, 2kg", "Eggs, each", "Bread, white loaf", "Cooking oil, 2L"]);
  });
});
