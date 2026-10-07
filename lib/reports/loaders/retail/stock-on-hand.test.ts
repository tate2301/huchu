/**
 * On hand (`retail-stock-on-hand`, STK-02) against a real Postgres: each
 * line's level by STK-01's rule over what it sold at its own site, tab counts
 * that ignore the filters, the value at cost totalled over the rows shown,
 * cost and Site dropped where they do not belong, and archived lines listed
 * but never Low.
 */
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { recordStockMovement } from "@/lib/inventory/stock-movements";
import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { fetchListPage } from "@/lib/reports/request";
import type { ListPageResponse, ListQuery } from "@/lib/reports/types";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";
import { countLowLines } from "@/lib/retail/stock/on-hand";

import { onHandCardMeta, STOCK_ON_HAND_LOADERS } from "./stock-on-hand";

let shop: TestShop;
let oneSite: TestShop;
const lines: Record<string, string> = {};

/** A line ending on `onHand` after selling `sold` at its site in the last 30 days. */
async function stocked(
  companyId: string,
  name: string,
  cost: string,
  levels: { onHand: number; sold: number; reorderAt?: number; siteId?: string },
) {
  const created = await addTestProduct(
    companyId,
    { name, price: "10.00", cost },
    { onHand: levels.onHand + levels.sold, reorderAt: levels.reorderAt, siteId: levels.siteId, unit: "bottle" },
  );
  if (levels.sold > 0) {
    await recordStockMovement({
      companyId,
      userId: shop.ownerId,
      itemId: created.itemId,
      movementType: "ISSUE",
      quantity: levels.sold,
      unit: "bottle",
      reason: "SALE",
      reference: "S-000001",
      sourceType: "RETAIL_SALE",
      sourceId: `sale-${created.itemId}`,
    });
  }
  lines[name] = created.itemId;
  return created;
}

const session = (company: TestShop, role: string) =>
  ({ user: { id: company.ownerId, companyId: company.companyId, role, enabledFeatures: ["retail.core"] }, expires: "" }) as AuthenticatedSession;

async function page(company: TestShop, role: string, given: Partial<ListQuery> = {}): Promise<ListPageResponse> {
  const answer = await fetchListPage(session(company, role), "retail-stock-on-hand", { page: 1, size: 50, filters: {}, ...given });
  if (!("rows" in answer)) throw new Error(`refused: ${answer.error}`);
  return answer;
}

beforeAll(async () => {
  shop = await makeTestShop("OnHand", { twoSites: true });
  await stocked(shop.companyId, "Johnnie Walker Black 750ml", "33.60", { onHand: 6, sold: 60, reorderAt: 12 });
  await stocked(shop.companyId, "Gordon’s Gin 750ml", "12.40", { onHand: 18, sold: 68, reorderAt: 6 });
  await stocked(shop.companyId, "Chibuku Scud 1L", "0.82", { onHand: 210, sold: 102, reorderAt: 60 });
  await stocked(shop.companyId, "Jaggermeister 750ml", "24.00", { onHand: 0, sold: 18, reorderAt: 6 });
  await stocked(shop.companyId, "Bohlinger’s 330ml", "1.08", { onHand: 96, sold: 70, reorderAt: 36, siteId: shop.secondId! });
  const bols = await stocked(shop.companyId, "Bols Brandy 750ml", "11.22", { onHand: 6, sold: 0, reorderAt: 6 });
  await prisma.product.update({ where: { id: bols.productId }, data: { isActive: false } });
  // Cider, for the Category filter.
  const gordons = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: lines["Gordon’s Gin 750ml"]! }, select: { productId: true } });
  await prisma.product.update({ where: { id: gordons.productId! }, data: { categoryId: shop.ciderId } });
  // In the bin: not on the shelf at all.
  const binned = await stocked(shop.companyId, "Nederburg Rosé 750ml", "9.40", { onHand: 12, sold: 0, reorderAt: 6 });
  await prisma.product.update({ where: { id: binned.productId }, data: { archivedAt: new Date() } });

  oneSite = await makeTestShop("OnHandOne");
  await addTestProduct(oneSite.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.86" }, { onHand: 26, reorderAt: 96 });
}, 90_000);

afterAll(async () => {
  for (const company of [shop, oneSite]) if (company) await destroyProvisionedTenant(company.companyId);
});

describe("the rows", () => {
  it("gives each line its level, cover and value at cost; the bin's lines are not on the shelf", async () => {
    const { rows } = await STOCK_ON_HAND_LOADERS["retail-stock-on-hand"]!.load({ companyId: shop.companyId, userId: shop.ownerId, role: "SUPERADMIN" }, {});
    const byName = new Map(rows.map((row) => [row.product, row]));
    expect(byName.get("Johnnie Walker Black 750ml")).toMatchObject({ level: "Low", onHand: 6, unitWord: "bottles", reorderAt: 12, cover: "3 days", coverPct: 15, value: 201.6 });
    expect(byName.get("Gordon’s Gin 750ml")).toMatchObject({ level: "Fine", cover: "8 days", value: 223.2 });
    expect(byName.get("Chibuku Scud 1L")).toMatchObject({ level: "Too much", cover: "62 days", value: 172.2 });
    expect(byName.get("Jaggermeister 750ml")).toMatchObject({ level: "Out", cover: null, coverPct: null, value: 0 });
    expect(byName.get("Bohlinger’s 330ml")).toMatchObject({ level: "Fine", site: "Borrowdale", cover: "41 days" });
    expect(byName.has("Nederburg Rosé 750ml")).toBe(false);
  });

  it("says on the phone card only what it knows: no cover when Out, no level when none is set", async () => {
    const { rows } = await STOCK_ON_HAND_LOADERS["retail-stock-on-hand"]!.load({ companyId: shop.companyId, userId: shop.ownerId, role: "SUPERADMIN" }, {});
    const byName = new Map(rows.map((row) => [row.product, row]));
    const johnnie = byName.get("Johnnie Walker Black 750ml")!;
    expect(johnnie.cardMeta).toBe(`${johnnie.code} · reorder at 12 · 3 days`);
    const jagger = byName.get("Jaggermeister 750ml")!;
    expect(jagger.cardMeta).toBe(`${jagger.code} · reorder at 6`);
    expect(onHandCardMeta("ZCHECK-GIN-0", null, null)).toBe("ZCHECK-GIN-0");
    expect(onHandCardMeta("CASTLE-340", null, "9 days")).toBe("CASTLE-340 · 9 days");
    expect(onHandCardMeta("ICE-2KG", 0, "14 days")).toBe("ICE-2KG · reorder at 0 · 14 days");
  });

  it("lists an archived line, never as Low", async () => {
    const { rows } = await page(shop, "SUPERADMIN");
    expect(rows.find((row) => row.product === "Bols Brandy 750ml")).toMatchObject({ level: "Too much", state: "Archived" });
    const hidden = await page(shop, "SUPERADMIN", { filters: { archived: "hide" } });
    expect(hidden.rows.map((row) => row.product)).not.toContain("Bols Brandy 750ml");
  });

  it("puts what runs out soonest first: Out, then the fewest days", async () => {
    const { rows } = await page(shop, "SUPERADMIN");
    expect(rows.slice(0, 3).map((row) => row.product)).toEqual(["Jaggermeister 750ml", "Johnnie Walker Black 750ml", "Gordon’s Gin 750ml"]);
  });
});

describe("tabs and totals", () => {
  it("counts every tab over the whole shelf, whatever the search and filters", async () => {
    const all = await page(shop, "SUPERADMIN");
    const narrowed = await page(shop, "SUPERADMIN", { q: "Gordon", filters: { category: shop.ciderId } });
    expect(all.tabs).toEqual({ all: 6, below: 2, out: 1, toomuch: 2 });
    expect(narrowed.tabs).toEqual(all.tabs);
    expect(narrowed.total).toBe(1);
  });

  it("agrees with the panel badge: Below level holds Low and Out", async () => {
    const all = await page(shop, "SUPERADMIN");
    expect(await countLowLines(shop.companyId)).toBe(all.tabs?.below);
  });

  it("totals the value at cost over the rows shown", async () => {
    const main = await page(shop, "SUPERADMIN", { filters: { site: shop.mainId } });
    const expected = main.rows.reduce((sum, row) => sum + Number(row.value), 0);
    expect(Number(main.totals.value)).toBeCloseTo(expected, 2);
    const items = await prisma.inventoryItem.findMany({
      where: { siteId: shop.mainId, product: { is: { archivedAt: null } } },
      select: { currentStock: true, unitCost: true },
    });
    const sql = items.reduce((sum, item) => sum.plus(item.currentStock.times(item.unitCost ?? 0)), new Prisma.Decimal(0));
    expect(Number(main.totals.value)).toBeCloseTo(sql.toNumber(), 2);
  });
});

describe("what each reader sees", () => {
  it("drops the value at cost, and Change reorder level, for a stock clerk", async () => {
    const clerk = await page(shop, "STOCK_CLERK");
    expect(clerk.report.columns.map((column) => column.key)).not.toContain("value");
    expect(clerk.rows.every((row) => !("value" in row))).toBe(true);
    expect(clerk.report.list.rowMenu?.map((action) => action.key)).not.toContain("reorder");
    expect(clerk.report.list.bulk?.map((action) => action.key)).not.toContain("reorder");
    const owner = await page(shop, "SUPERADMIN");
    expect(owner.report.columns.map((column) => column.key)).toContain("value");
    expect(owner.report.list.rowMenu?.map((action) => action.key)).toEqual(["open", "adjust", "move", "reorder", "count"]);
  });

  it("never says Site, or offers a move, in a shop with one site", async () => {
    const one = await page(oneSite, "SUPERADMIN");
    expect(one.report.columns.map((column) => column.key)).not.toContain("site");
    expect(one.report.list.filters.map((filter) => filter.key)).not.toContain("site");
    expect(one.report.list.rowMenu?.map((action) => action.key)).not.toContain("move");
    expect(one.report.list.bulk?.map((action) => action.key)).not.toContain("move");
    expect(one.rows).toHaveLength(1);
  });

  it("refuses a cashier in words", async () => {
    const answer = await fetchListPage(session(shop, "CASHIER"), "retail-stock-on-hand", { page: 1, size: 50, filters: {} });
    expect(answer).toMatchObject({ status: 403, error: "Your role cannot view stock" });
  });
});
