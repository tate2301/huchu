/**
 * Opening a case of Castle into singles, against a real database.
 *
 * One case out, twenty-four singles in, at the same branch, with a movement on
 * each line saying what happened — and refused, without moving anything, when
 * the case is not a case, there is none to open, or the singles have nowhere
 * to go.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { money, quantity } from "@/lib/money";
import { prisma } from "@/lib/prisma";

import { breakCase, CaseBreakRefused } from "./cases";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let userId: string;
let siteId: string;
let locationId: string;
let singleId: string;
let caseId: string;
let singleLineId: string;
let caseLineId: string;

async function line(productId: string, code: string, unit: string, stock: number, cost: number) {
  const item = await prisma.inventoryItem.create({
    data: {
      itemCode: `${code}-${stamp}`,
      name: code,
      category: "OTHER",
      unit,
      siteId,
      locationId,
      productId,
      currentStock: quantity(stock),
      unitCost: money(cost),
    },
    select: { id: true },
  });
  return item.id;
}

beforeAll(async () => {
  const company = await prisma.company.create({
    data: { name: `Cases ${stamp}`, slug: `cases-${stamp}` },
    select: { id: true },
  });
  companyId = company.id;
  userId = (
    await prisma.user.create({
      data: { email: `clerk-${stamp}@shop.test`, name: "Tendai", role: "STOCK_CLERK", companyId },
      select: { id: true },
    })
  ).id;
  siteId = (
    await prisma.site.create({ data: { companyId, code: `C-${stamp}`, name: "Borrowdale" }, select: { id: true } })
  ).id;
  locationId = (
    await prisma.stockLocation.create({ data: { siteId, code: `F-${stamp}`, name: "Shop floor" }, select: { id: true } })
  ).id;
  singleId = (
    await prisma.product.create({ data: { companyId, code: `CASTLE-${stamp}`, name: "Castle Lager 340ml" }, select: { id: true } })
  ).id;
  caseId = (
    await prisma.product.create({
      data: { companyId, code: `CASTLE-CASE-${stamp}`, name: "Castle Lager case of 24", packOfId: singleId, packSize: 24 },
      select: { id: true },
    })
  ).id;
  singleLineId = await line(singleId, "CASTLE", "bottle", 6, 0.85);
  caseLineId = await line(caseId, "CASTLE-CASE", "case", 3, 20.4);
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.stockMovement.deleteMany({ where: { itemId: { in: [singleLineId, caseLineId].filter(Boolean) } } });
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId } } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId } } });
  await prisma.product.updateMany({ where: { companyId }, data: { packOfId: null, packSize: null } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

const open = (cases: number, product = caseId) =>
  breakCase({ companyId, userId, caseProductId: product, siteId, cases });

describe("opening a case into singles", () => {
  it("takes one case out and puts twenty-four singles in", async () => {
    expect(await open(1)).toEqual({ cases: 1, singles: 24, caseStock: 2, singleStock: 30 });
    const movements = await prisma.stockMovement.findMany({
      where: { itemId: { in: [singleLineId, caseLineId] } },
      select: { itemId: true, movementType: true, quantity: true, notes: true, reason: true, reference: true, change: true },
    });
    expect(movements).toHaveLength(2);
    // Both legs say why, and share one number: the first break in this shop.
    expect(movements.map((row) => [row.reason, row.reference])).toEqual([
      ["CASE_BROKEN", "BRK-0001"],
      ["CASE_BROKEN", "BRK-0001"],
    ]);
    expect(movements.find((row) => row.itemId === caseLineId)?.change.toNumber()).toBe(-1);
    expect(movements.find((row) => row.itemId === caseLineId)).toMatchObject({ movementType: "ISSUE" });
    const into = movements.find((row) => row.itemId === singleLineId);
    expect(into?.movementType).toBe("RECEIPT");
    expect(into?.quantity.toNumber()).toBe(24);
    expect(into?.notes).toBe("Opened 1 × Castle Lager case of 24 into 24 × Castle Lager 340ml");
  });

  it("refuses to open more cases than there are, and moves nothing", async () => {
    await expect(open(5)).rejects.toThrow(new CaseBreakRefused("There are only 2 of Castle Lager case of 24 to open."));
    const caseLine = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: caseLineId } });
    expect(caseLine.currentStock.toNumber()).toBe(2);
  });

  it("refuses a product that is not a case", async () => {
    await expect(open(1, singleId)).rejects.toThrow("Castle Lager 340ml is not set up as a case of singles.");
  });

  it("refuses another shop's product", async () => {
    await expect(
      breakCase({ companyId: "00000000-0000-0000-0000-000000000000", userId, caseProductId: caseId, siteId, cases: 1 }),
    ).rejects.toThrow("That product is not this shop's.");
  });
});
