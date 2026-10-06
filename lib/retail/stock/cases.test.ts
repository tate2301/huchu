/**
 * Breaking a case of Castle into singles (30-stock W-26, STK-04), against the
 * test database: cases out and singles in under one BRK reference, no
 * journal, refused in words when the shop has cases and singles off, when
 * the product is not a case or there is too little to open; a cashier only on
 * an open shift with no singles left; and two breaks of the last case at once
 * open it once.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { money, quantity } from "@/lib/money";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { blendedCost, breakCase, CaseBreakRefused } from "./cases";

let shop: TestShop;
let cashierId: string;
let single: { productId: string; itemId: string };
let pack: { productId: string; itemId: string };

const cashier = () => ({ companyId: shop.companyId, userId: cashierId, userName: "Chipo Dube", userRole: "CASHIER" });
const onHand = async (lineId: string) => (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: lineId } })).currentStock.toNumber();
const setStock = (lineId: string, value: number) =>
  prisma.inventoryItem.update({ where: { id: lineId }, data: { currentStock: quantity(value) } });

beforeAll(async () => {
  shop = await makeTestShop("Cases");
  await prisma.retailShopProfile.update({ where: { companyId: shop.companyId }, data: { casesAndSingles: true } });
  cashierId = (
    await prisma.user.create({
      data: { email: `chipo-${shop.companyId}@shop.test`, name: "Chipo Dube", role: "CASHIER", companyId: shop.companyId },
      select: { id: true },
    })
  ).id;
  single = await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.85" }, { onHand: 2 });
  pack = await addTestProduct(shop.companyId, { name: "Castle Lager 340ml, case of 24", price: "24.00", cost: "20.40" }, { onHand: 4 });
  await prisma.product.update({ where: { id: pack.productId }, data: { packOfId: single.productId, packSize: 24 } });
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  await prisma.retailShift.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.product.updateMany({ where: { companyId: shop.companyId }, data: { packOfId: null } });
  await destroyProvisionedTenant(shop.companyId);
});

const open = (cases: number, caseProductId = pack.productId) =>
  breakCase({ actor: shop.manager(), caseProductId, siteId: shop.mainId, cases });

describe("breaking a case into singles", () => {
  it("takes a case out and puts 24 singles in, both under one BRK reference, with no journal", async () => {
    const result = await open(1);
    expect(result).toEqual({
      reference: "BRK-0001",
      cases: 1,
      singles: 24,
      caseOnHand: 3,
      singleOnHand: 26,
      message: "1 case broken. 26 singles on hand.",
    });
    const legs = await prisma.stockMovement.findMany({
      where: { reference: "BRK-0001", item: { site: { companyId: shop.companyId } } },
      select: { itemId: true, movementType: true, change: true, reason: true, sourceId: true, notes: true },
    });
    expect(legs).toHaveLength(2);
    expect(legs.every((leg) => leg.reason === "CASE_BROKEN" && leg.sourceId === `${pack.productId}:BRK-0001`)).toBe(true);
    expect(legs.find((leg) => leg.itemId === pack.itemId)).toMatchObject({ movementType: "ISSUE" });
    expect(legs.find((leg) => leg.itemId === pack.itemId)!.change.toNumber()).toBe(-1);
    expect(legs.find((leg) => leg.itemId === single.itemId)!.change.toNumber()).toBe(24);
    // The singles come in at the case's cost shared over the bottles.
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: single.itemId } })).unitCost?.toNumber()).toBe(0.85);
    expect(await prisma.journalEntry.count({ where: { companyId: shop.companyId } })).toBe(0);
    const audit = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId: shop.companyId, eventType: "RETAIL_STOCK.CASE_BROKEN" } });
    expect(audit.entityId).toBe(pack.productId);
    expect(JSON.parse(audit.payloadJson ?? "{}")).toMatchObject({ reference: "BRK-0001", cases: 1, singles: 24 });
  });

  it("refuses more cases than there are, and what is not a case", async () => {
    await expect(open(5)).rejects.toThrow(new CaseBreakRefused("There are only 3 of Castle Lager 340ml, case of 24 to open."));
    await expect(open(1, single.productId)).rejects.toThrow("Castle Lager 340ml is not set up as a case of singles.");
    expect(await onHand(pack.itemId)).toBe(3);
  });

  it("refuses while the shop has cases and singles off", async () => {
    await prisma.retailShopProfile.update({ where: { companyId: shop.companyId }, data: { casesAndSingles: false } });
    await expect(open(1)).rejects.toMatchObject({ message: "Cases and singles is off for this shop.", status: 409 });
    await prisma.retailShopProfile.update({ where: { companyId: shop.companyId }, data: { casesAndSingles: true } });
  });

  it("lets a cashier break one only on an open shift with no singles left", async () => {
    const atTill = () => breakCase({ actor: cashier(), caseProductId: pack.productId, cases: 1 });
    await expect(atTill()).rejects.toMatchObject({ message: "Your role cannot adjust stock", status: 403 });

    const registerId = (
      await prisma.retailRegister.create({ data: { companyId: shop.companyId, siteId: shop.mainId, code: "FT", name: "Front till" }, select: { id: true } })
    ).id;
    await prisma.retailShift.create({
      data: {
        companyId: shop.companyId,
        shiftNo: "SH-1",
        registerCode: "FT",
        registerName: "Front till",
        registerId,
        siteId: shop.mainId,
        cashierId,
        cashierName: "Chipo Dube",
        openingFloat: money(50),
      },
    });
    await expect(atTill()).rejects.toMatchObject({ status: 403 });

    await setStock(single.itemId, 0);
    const result = await atTill();
    expect(result).toMatchObject({ cases: 1, singleOnHand: 24, caseOnHand: 2 });
  });

  it("lets only one of two cashiers at no singles open a case at the same moment", async () => {
    const otherId = (
      await prisma.user.create({
        data: { email: `farai-${shop.companyId}@shop.test`, name: "Farai Moyo", role: "CASHIER", companyId: shop.companyId },
        select: { id: true },
      })
    ).id;
    const registerId = (
      await prisma.retailRegister.create({ data: { companyId: shop.companyId, siteId: shop.mainId, code: "BT", name: "Back till" }, select: { id: true } })
    ).id;
    await prisma.retailShift.create({
      data: {
        companyId: shop.companyId,
        shiftNo: "SH-2",
        registerCode: "BT",
        registerName: "Back till",
        registerId,
        siteId: shop.mainId,
        cashierId: otherId,
        cashierName: "Farai Moyo",
        openingFloat: money(50),
      },
    });
    await setStock(single.itemId, 0);
    await setStock(pack.itemId, 2);
    const farai = { companyId: shop.companyId, userId: otherId, userName: "Farai Moyo", userRole: "CASHIER" };
    const outcomes = await Promise.allSettled([
      breakCase({ actor: cashier(), caseProductId: pack.productId, cases: 1 }),
      breakCase({ actor: farai, caseProductId: pack.productId, cases: 1 }),
    ]);
    const lost = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0]!.reason).toMatchObject({ message: "Your role cannot adjust stock", status: 403 });
    expect(await onHand(single.itemId)).toBe(24);
    expect(await onHand(pack.itemId)).toBe(1);
  });

  it("averages the singles' cost with the case's share, so the singles on the shelf keep their value", async () => {
    await prisma.inventoryItem.update({ where: { id: single.itemId }, data: { unitCost: money("0.86"), currentStock: quantity(26) } });
    await prisma.inventoryItem.update({ where: { id: pack.itemId }, data: { unitCost: money("20.10"), currentStock: quantity(2) } });
    await open(1);
    // (26 × 0.86 + 20.10) / 50 = 0.8492, not the case's 20.10 / 24 = 0.84 over all 50.
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: single.itemId } })).unitCost?.toNumber()).toBe(0.85);
    await prisma.inventoryItem.update({ where: { id: pack.itemId }, data: { unitCost: money("20.40") } });
    await prisma.inventoryItem.update({ where: { id: single.itemId }, data: { unitCost: money("0.85") } });
  });

  it("opens the last case once when two people break it at the same moment", async () => {
    await setStock(pack.itemId, 1);
    const outcomes = await Promise.allSettled([open(1), open(1)]);
    const won = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const lost = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0]!.reason).toBeInstanceOf(CaseBreakRefused);
    expect((lost[0]!.reason as Error).message).toBe("There are only 0 of Castle Lager 340ml, case of 24 to open.");
    expect(await onHand(pack.itemId)).toBe(0);
  });

  it("makes the singles' line at a branch that has the case but never had them", async () => {
    const other = await prisma.site.create({ data: { companyId: shop.companyId, name: "Borrowdale", code: `BORR-${shop.companyId.slice(0, 6)}` }, select: { id: true } });
    await prisma.stockLocation.create({ data: { siteId: other.id, code: "SHOP", name: "Shop floor" } });
    const place = await prisma.stockLocation.findFirstOrThrow({ where: { siteId: other.id } });
    await prisma.inventoryItem.create({
      data: { itemCode: "CASTLE-CASE-B", name: "Castle case", category: "RETAIL", unit: "each", siteId: other.id, locationId: place.id, productId: pack.productId, currentStock: quantity(2), unitCost: money(20.4) },
    });
    const result = await breakCase({ actor: shop.manager(), caseProductId: pack.productId, siteId: other.id, cases: 1 });
    expect(result).toMatchObject({ singleOnHand: 24, caseOnHand: 1 });
    const made = await prisma.inventoryItem.findFirstOrThrow({ where: { siteId: other.id, productId: single.productId } });
    expect(made.unitCost?.toNumber()).toBe(0.85);
  });
});

describe("blendedCost", () => {
  const share = money("20.10").dividedBy(24);
  it("averages what is on hand with what came out of the case", () => {
    expect(blendedCost({ onHand: quantity(26), unitCost: money("0.86") }, 24, share)?.toNumber()).toBe(0.85);
    expect(blendedCost({ onHand: quantity(0), unitCost: money("0.86") }, 24, share)?.toNumber()).toBe(0.84);
    expect(blendedCost({ onHand: quantity(-3), unitCost: money("0.86") }, 24, share)?.toNumber()).toBe(0.84);
    expect(blendedCost({ onHand: quantity(26), unitCost: null }, 24, share)?.toNumber()).toBe(0.84);
  });

  it("leaves the line's cost alone when the case has none", () => {
    expect(blendedCost({ onHand: quantity(26), unitCost: money("0.86") }, 24, null)).toBeNull();
  });
});
