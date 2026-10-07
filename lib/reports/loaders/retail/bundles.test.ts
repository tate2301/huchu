import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { fetchListPage } from "@/lib/reports/request";
import type { ListPageResponse } from "@/lib/reports/types";
import { createBundle, setBundlesPaused, stopBundle } from "@/lib/retail/bundles/service";
import { createPack } from "@/lib/retail/products/packs";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

/**
 * Bundles and packs (`retail-bundles`, PRD-08) and a bundle's tabs, against
 * the test database: the tabs and their counts, what each is made of, what
 * it saves, how many it can make and the item that limits it, how many sold
 * in 30 days (a bundle counted once however many lines, a fixed set rung
 * twice as two), and a stock clerk refused.
 */

let shop: TestShop;
const ids: Record<string, string> = {};
const items: Record<string, string> = {};
const DAY = 24 * 60 * 60 * 1000;
const SHELF: Record<string, string> = { castle: "1.20", ice: "1.50", charcoal: "3.90", savanna: "1.85" };

const session = (role: string) =>
  ({ user: { id: shop.ownerId, companyId: shop.companyId, role, enabledFeatures: ["retail.core", "retail.catalog", "retail.promotions", "stores.inventory"] }, expires: "" }) as AuthenticatedSession;

async function page(source: string, filters: Record<string, string> = {}, tab?: string, role = "SUPERADMIN") {
  const answer = await fetchListPage(session(role), source, { page: 1, size: 50, filters, ...(tab ? { tab } : {}) });
  return answer;
}
const rows = async (source: string, filters: Record<string, string> = {}, tab?: string) => {
  const answer = await page(source, filters, tab);
  if (!("rows" in answer)) throw new Error(`refused: ${answer.error}`);
  return answer as ListPageResponse;
};

/** A posted sale of bundle lines `daysAgo`. */
async function sold(saleNo: string, daysAgo: number, bundleId: string, lines: Array<[code: string, quantity: number, total: number]>) {
  const postedAt = new Date(Date.now() - daysAgo * DAY);
  const id = crypto.randomUUID();
  await prisma.retailSale.create({
    data: {
      id,
      companyId: shop.companyId,
      saleNo,
      siteId: shop.mainId,
      cashierId: shop.managerId,
      cashierName: "Tafara Nyathi",
      saleType: "SALE",
      status: "POSTED",
      totalAmount: new Prisma.Decimal(lines.reduce((sum, line) => sum + line[2], 0)),
      postedAt,
      lines: {
        create: lines.map(([code, quantity, total]) => ({
          companyId: shop.companyId,
          inventoryItemId: items[code]!,
          productId: ids[code]!,
          itemName: code,
          quantity: new Prisma.Decimal(quantity),
          unitPrice: new Prisma.Decimal(SHELF[code]!),
          lineTotal: new Prisma.Decimal(total),
          bundleId,
          bundleRef: `${id}:1`,
        })),
      },
    },
  });
}

beforeAll(async () => {
  shop = await makeTestShop("BundleList");
  const beer = (await prisma.retailCategory.create({ data: { companyId: shop.companyId, name: "Beer" }, select: { id: true } })).id;
  for (const [code, name, price, onHand, categoryId] of [
    ["castle", "Castle Lager 340ml", "1.20", 148, beer],
    ["ice", "Ice 2kg bag", "1.50", 4, null],
    ["charcoal", "Charcoal 4kg", "3.90", 11, null],
    ["savanna", "Savanna Dry 330ml", "1.85", 40, shop.ciderId],
  ] as const) {
    const made = await addTestProduct(shop.companyId, { name, price, cost: "0.50", categoryId }, { siteId: shop.mainId, onHand, reorderAt: code === "ice" ? 6 : undefined });
    ids[code] = made.productId;
    items[code] = made.itemId;
  }
  const pack = await createPack(shop.owner(), { singleId: ids.castle!, size: 24, price: "26.50", breakAtTill: true });
  ids.case = pack.productId;
  await prisma.inventoryItem.updateMany({ where: { productId: pack.productId }, data: { currentStock: new Prisma.Decimal(22) } });
  ids.braai = (
    await createBundle(shop.owner(), {
      kind: "FIXED_SET",
      name: "Braai pack",
      items: [
        { productId: ids.castle!, quantity: 6 },
        { productId: ids.ice!, quantity: 1 },
        { productId: ids.charcoal!, quantity: 1 },
      ],
      price: "11.00",
      days: "EVERY_DAY",
      until: null,
    })
  ).id;
  ids.ciders = (
    await createBundle(shop.owner(), {
      kind: "BUY_MORE",
      name: "Any 3 ciders",
      items: [{ productId: ids.savanna!, quantity: 1 }],
      buyQuantity: 3,
      price: "5.00",
      days: "EVERY_DAY",
      until: null,
    })
  ).id;
  ids.old = (
    await createBundle(shop.owner(), {
      kind: "FIXED_SET",
      name: "Old pack",
      items: [
        { productId: ids.castle!, quantity: 2 },
        { productId: ids.ice!, quantity: 1 },
      ],
      price: "3.00",
      days: "EVERY_DAY",
      until: null,
    })
  ).id;
  await stopBundle(shop.owner(), ids.old);
  // Two Braai packs rung as one (12 Castle), one more; one 40 days ago.
  await sold("S-1", 2, ids.braai, [["castle", 12, 12.56], ["ice", 2, 2.6], ["charcoal", 2, 6.84]]);
  await sold("S-2", 5, ids.braai, [["castle", 6, 6.28], ["ice", 1, 1.3], ["charcoal", 1, 3.42]]);
  await sold("S-3", 40, ids.braai, [["castle", 6, 6.28], ["ice", 1, 1.3], ["charcoal", 1, 3.42]]);
  await sold("S-4", 3, ids.ciders, [["savanna", 3, 5]]);
}, 90_000);

afterAll(async () => {
  if (!shop) return;
  await prisma.retailSaleLine.deleteMany({ where: { sale: { companyId: shop.companyId } } });
  await prisma.retailSale.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.retailBundle.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
});

describe("Bundles and packs", () => {
  it("counts the tabs: stopped ones only under All", async () => {
    const all = await rows("retail-bundles");
    expect(all.tabs).toEqual({ all: 4, packs: 1, bundles: 1, buymore: 1 });
  });

  it("reads each row's kind, what it is made of, what it saves, can make and sold", async () => {
    const all = await rows("retail-bundles");
    const byName = Object.fromEntries(all.rows.map((row) => [row.name, row]));
    expect(byName["Castle Lager 340ml, case of 24"]).toMatchObject({ kind: "Pack", madeOf: "24 × Castle Lager 340ml", price: 26.5, onTheirOwn: 28.8, saves: 2.3, canMake: 22 });
    expect(byName["Braai pack"]).toMatchObject({
      kind: "Bundle",
      madeOf: "6 × Castle Lager 340ml, Ice 2kg, Charcoal 4kg",
      price: 11,
      onTheirOwn: 12.6,
      saves: 1.6,
      canMake: 4,
      canMakeTone: "warn",
      sold30: 3,
    });
    expect(byName["Any 3 ciders"]).toMatchObject({ kind: "Buy more, pay less", madeOf: "3 × Savanna Dry 330ml", canMake: null, sold30: 1, onTheirOwn: 5.55 });
    expect(byName["Old pack"]).toMatchObject({ kind: "Stopped" });
    // Most sold: packs, then bundles, then buy-more.
    expect(all.rows.map((row) => row.kindKey)).toEqual(["PACK", "FIXED_SET", "FIXED_SET", "BUY_MORE"]);
  });

  it("says Paused on a paused bundle and a paused case", async () => {
    await setBundlesPaused(shop.owner(), [ids.braai!, ids.case!], true);
    const all = await rows("retail-bundles");
    expect(all.rows.filter((row) => row.kind === "Paused").map((row) => row.name).sort()).toEqual(["Braai pack", "Castle Lager 340ml, case of 24"]);
    await setBundlesPaused(shop.owner(), [ids.braai!, ids.case!], false);
  });

  it("refuses a stock clerk; a cashier reads it", async () => {
    expect(await page("retail-bundles", {}, undefined, "STOCK_CLERK")).toMatchObject({ status: 403 });
    expect("rows" in (await page("retail-bundles", {}, undefined, "CASHIER"))).toBe(true);
  });
});

describe("a bundle's tabs", () => {
  it("lists what is in it, the item that limits it marked", async () => {
    const tab = await rows("retail-bundle-items", { bundle: ids.braai! });
    expect(tab.rows.map((row) => [row.product, row.quantity, row.onTheirOwn, row.onHand, row.makes, row.limitTone])).toEqual([
      ["Castle Lager 340ml", 6, 7.2, 148, 24, null],
      ["Ice 2kg bag", 1, 1.5, 4, 4, "warn"],
      ["Charcoal 4kg", 1, 3.9, 11, 11, null],
    ]);
  });

  it("lists every sale of it, once a bundle", async () => {
    const tab = await rows("retail-bundle-sales", { bundle: ids.braai! });
    expect(tab.total).toBe(3);
    expect(tab.rows.find((row) => row.saleNo === "S-2")).toMatchObject({ price: 11, saved: 1.6 });
  });
});
