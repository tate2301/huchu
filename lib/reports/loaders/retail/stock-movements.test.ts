/**
 * Movements (`retail-stock-movements`) paged in the database, against a real
 * Postgres: the totals are over every filtered row whichever page is asked
 * for, Kind narrows by its group of reasons, and the `product` parent scopes
 * the list to one product and names it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { recordStockMovement } from "@/lib/inventory/stock-movements";
import { money, quantity } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { resolveListQuery } from "@/lib/reports/list-query";
import { STOCK_MOVEMENT_REPORTS } from "@/lib/reports/definitions/retail/stock-movements";
import type { ListQuery } from "@/lib/reports/types";

import { kindReasons, STOCK_MOVEMENT_LOADERS } from "./stock-movements";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const loader = STOCK_MOVEMENT_LOADERS["retail-stock-movements"]!;
const LIST = STOCK_MOVEMENT_REPORTS[0]!.list!;
let companyId: string;
let userId: string;
let siteId: string;
let locationId: string;
let amarulaId: string;
let castleId: string;
let amarulaLine: string;
let castleLine: string;

const ctx = () => ({ companyId, userId, role: "SUPERADMIN" });
const query = (given: Partial<ListQuery> = {}) =>
  resolveListQuery(LIST, { page: 1, size: 25, filters: {}, ...given }, {}, { role: "SUPERADMIN", seeCost: true });

async function line(productId: string, code: string) {
  return (
    await prisma.inventoryItem.create({
      data: {
        itemCode: `${code}-${stamp}`,
        name: code,
        category: "OTHER",
        unit: "bottle",
        siteId,
        locationId,
        productId,
        currentStock: quantity(0),
        unitCost: money(13.03),
      },
      select: { id: true },
    })
  ).id;
}

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Moves ${stamp}`, slug: `moves-${stamp}` }, select: { id: true } })).id;
  userId = (
    await prisma.user.create({ data: { email: `owner-${stamp}@shop.test`, name: "Tendai Mhlanga", role: "SUPERADMIN", companyId }, select: { id: true } })
  ).id;
  siteId = (await prisma.site.create({ data: { companyId, code: `H-${stamp}`, name: "Harare Main Branch" }, select: { id: true } })).id;
  locationId = (await prisma.stockLocation.create({ data: { siteId, code: `F-${stamp}`, name: "Shop floor" }, select: { id: true } })).id;
  amarulaId = (await prisma.product.create({ data: { companyId, code: `AMARULA-${stamp}`, name: "Amarula Cream 750ml" }, select: { id: true } })).id;
  castleId = (await prisma.product.create({ data: { companyId, code: `CASTLE-${stamp}`, name: "Castle Lager 340ml" }, select: { id: true } })).id;
  amarulaLine = await line(amarulaId, "AMARULA");
  castleLine = await line(castleId, "CASTLE");

  const now = Date.now();
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000);
  const base = { companyId, userId, unit: "bottle", sourceType: "RETAIL_STOCK_ADJUSTMENT" as const };
  // Opening stock 40 on each, then 30 sales of one and a fixed mistake.
  await recordStockMovement({ ...base, itemId: amarulaLine, movementType: "RECEIPT", quantity: 40, reason: "OPENING", reference: "Opening", entryDate: at(600) });
  await recordStockMovement({ ...base, itemId: castleLine, movementType: "RECEIPT", quantity: 40, reason: "RECEIVED", reference: "GRN-0004", entryDate: at(590) });
  for (let index = 0; index < 30; index += 1) {
    await recordStockMovement({
      ...base,
      itemId: index % 2 ? amarulaLine : castleLine,
      movementType: "ISSUE",
      quantity: 1,
      sourceType: "RETAIL_SALE",
      sourceId: `sale-${index}:x`,
      reason: "SALE",
      reference: `S-${String(index).padStart(6, "0")}`,
      entryDate: at(500 - index),
    });
  }
  await recordStockMovement({ ...base, itemId: amarulaLine, movementType: "ADJUSTMENT", quantity: -2, reason: "CORRECTION", reference: "ADJ-0001", entryDate: at(10) });
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.stockMovement.deleteMany({ where: { item: { site: { companyId } } } });
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId } } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId } } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("retail-stock-movements", () => {
  it("totals every filtered row, the same on page 2 as on page 1", async () => {
    const first = await loader.page!(ctx(), query());
    const second = await loader.page!(ctx(), query({ page: 2 }));
    expect(first.total).toBe(33);
    expect(first.pages).toBe(2);
    expect(first.rows).toHaveLength(25);
    expect(second.rows).toHaveLength(8);
    expect(second.totals).toEqual(first.totals);
    // +40 +40 −30 −2
    expect(first.totals).toMatchObject({ change: 48, in: 80, out: -32 });
    const sql = await prisma.stockMovement.aggregate({ where: { item: { site: { companyId } } }, _sum: { change: true } });
    expect(first.totals.change).toBe(sql._sum.change!.toNumber());
    // Newest first: the fixed mistake, with its words, tone and what it left.
    expect(first.rows[0]).toMatchObject({
      reference: "ADJ-0001",
      movement: "Fixed a mistake",
      tone: "neutral",
      change: -2,
      balance: 23,
      product: "Amarula Cream 750ml",
      site: "Harare Main Branch",
      by: "Tendai Mhlanga",
      reversible: "yes",
    });
  });

  it("Kind narrows to its group of reasons", async () => {
    expect(kindReasons("sales")).toEqual(["SALE", "REFUND", "VOID"]);
    expect(kindReasons("any")).toBeNull();
    const sales = await loader.page!(ctx(), query({ filters: { kind: "sales" } }));
    expect(sales.total).toBe(30);
    expect(sales.totals.change).toBe(-30);
    expect(new Set(sales.rows.map((row) => row.movement))).toEqual(new Set(["Sale"]));
    // A sale's reference opens the sale.
    expect(sales.rows[0]!.saleId).toBe("sale-29");
    const corrections = await loader.page!(ctx(), query({ filters: { kind: "corrections" } }));
    expect(corrections.rows.map((row) => row.reference)).toEqual(["ADJ-0001", "Opening"]);
  });

  it("the product parent scopes the list, names the product, and ends on what it has on hand", async () => {
    const scoped = await loader.page!(ctx(), query({ filters: { product: amarulaId } }));
    expect(scoped.total).toBe(17);
    expect(new Set(scoped.rows.map((row) => row.productId))).toEqual(new Set([amarulaId]));
    expect(scoped.totals).toMatchObject({ change: 23, onHand: 23 });
    expect(await loader.parentLabel!(ctx(), { product: amarulaId })).toBe("Amarula Cream 750ml");
    expect(await loader.parentLabel!(ctx(), { product: "00000000-0000-0000-0000-000000000000" })).toBeNull();
  });

  it("searches product, code and reference, and sorts by the biggest change", async () => {
    const found = await loader.page!(ctx(), query({ q: "GRN-0004" }));
    expect(found.rows.map((row) => row.movement)).toEqual(["Received"]);
    const biggest = await loader.page!(ctx(), query({ sort: "biggest" }));
    expect(biggest.rows.slice(0, 3).map((row) => row.change)).toEqual([40, 40, -2]);
  });

  it("groups through the engine, with the same totals", async () => {
    const grouped = await loader.page!(ctx(), query({ group: "movement" }));
    expect(grouped.groups?.map((group) => [group.label, group.count])).toEqual(
      expect.arrayContaining([
        ["Sale", 30],
        ["Fixed a mistake", 1],
        ["Opening stock", 1],
        ["Received", 1],
      ]),
    );
    expect(grouped.totals).toMatchObject({ change: 48, in: 80, out: -32 });
  });

  it("is empty only when nothing ever moved", async () => {
    const none = await loader.page!(ctx(), query({ q: "nothing like this" }));
    expect(none).toMatchObject({ total: 0, everEmpty: false });
    const options = await loader.options!(ctx());
    expect(options.by).toEqual([{ value: userId, label: "Tendai Mhlanga" }]);
    expect(options.site).toEqual([{ value: siteId, label: "Harare Main Branch" }]);
  });
});
