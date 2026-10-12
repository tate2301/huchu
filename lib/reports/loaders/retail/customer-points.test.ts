/**
 * A customer's points ledger (`retail-points`, CUS-03), against the test
 * database: the balance on every page is the running sum over the whole
 * ledger, the totals split earned, spent and expired, and the record's
 * 12-month period leaves the older rows out but not their balance.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { CUSTOMER_REPORTS } from "@/lib/reports/definitions/retail/customers";
import { resolveListQuery } from "@/lib/reports/list-query";
import type { ListQuery } from "@/lib/reports/types";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";
import { dayKey } from "@/lib/workspace/format";

import { CUSTOMER_RECORD_LOADERS } from "./customer-record";

const LIST = CUSTOMER_REPORTS.find((source) => source.key === "retail-points")!.list!;
const loader = CUSTOMER_RECORD_LOADERS["retail-points"]!;
const DAY = 86_400_000;

let shop: TestShop;
let customerId: string;
/** Oldest first, as the ledger runs. */
const ledger: Array<{ at: Date; points: number }> = [];

beforeAll(async () => {
  shop = await makeTestShop("CustomerPoints");
  customerId = (await prisma.customer.create({ data: { companyId: shop.companyId, name: "Tapiwa Marange", phone: "+263774123388" }, select: { id: true } })).id;
  const now = Date.now();
  const rows: Array<{ kind: "EARNED" | "SPENT" | "EXPIRED" | "ADJUSTED"; points: number; reason?: "BIRTHDAY"; daysAgo: number }> = [];
  // 400 to 380 days ago: a year and more back.
  for (let index = 0; index < 5; index += 1) rows.push({ kind: "EARNED", points: 30 + index, daysAgo: 400 - index * 5 });
  // The last 12 months: earned most days, spent now and then, a birthday, an expiry.
  for (let index = 0; index < 20; index += 1) {
    rows.push({ kind: "EARNED", points: 10 + index, daysAgo: 300 - index * 10 });
    if (index % 6 === 5) rows.push({ kind: "SPENT", points: -25, daysAgo: 300 - index * 10 - 1 });
  }
  rows.push({ kind: "ADJUSTED", reason: "BIRTHDAY", points: 100, daysAgo: 60 });
  rows.push({ kind: "EXPIRED", points: -12, daysAgo: 30 });
  rows.sort((a, b) => b.daysAgo - a.daysAgo);
  for (const row of rows) {
    const at = new Date(now - row.daysAgo * DAY);
    ledger.push({ at, points: row.points });
    await prisma.retailPointsEntry.create({
      data: { companyId: shop.companyId, customerId, kind: row.kind, points: row.points, reason: row.reason ?? null, createdAt: at, actorName: row.kind === "EXPIRED" ? null : "Chipo Dube" },
    });
  }
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  await prisma.retailSale.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
}, 60_000);

const ctx = () => ({ companyId: shop.companyId, userId: shop.ownerId, role: "SUPERADMIN" });
const page = (given: Partial<ListQuery>) =>
  loader.page!(
    ctx(),
    resolveListQuery(LIST, { page: 1, size: 25, ...given, filters: { customer: customerId, ...(given.filters ?? {}) } }, {}, { role: "SUPERADMIN", seeCost: true, defaultSite: null }),
  );

/** The running balance after each row, newest first, as the page lists them. */
function runningNewestFirst(rows: Array<{ points: number }>): number[] {
  let sum = 0;
  return rows.map((row) => (sum += row.points)).reverse();
}

describe("the points ledger", () => {
  it("gives every page the whole ledger's running balance", async () => {
    const expected = runningNewestFirst(ledger);
    const seen: number[] = [];
    for (let number = 1; number <= 2; number += 1) {
      const result = await page({ page: number });
      expect(result.total).toBe(ledger.length);
      seen.push(...result.rows.map((row) => Number(row.balance)));
    }
    expect(seen).toEqual(expected);
    const first = await page({});
    expect(first.rows[0]).toMatchObject({ what: "Expired, a year old", by: "Automatic", points: -12 });
    expect(first.totals.balance).toBe(ledger.reduce((sum, row) => sum + row.points, 0));
  });

  it("totals earned with the birthday, spent and expired, and the net", async () => {
    const result = await page({});
    const earned = ledger.filter((row) => row.points > 0).reduce((sum, row) => sum + row.points, 0);
    expect(result.totals).toMatchObject({ earned, spent: -75, expired: -12, adjusted: 0, takenBack: 0, points: earned - 87 });
  });

  it("reads the record's 12 months without losing the older balance", async () => {
    const since = dayKey(new Date(Date.now() - 365 * DAY));
    const result = await page({ filters: { when: `${since}..` } });
    const inside = ledger.filter((row) => row.at.getTime() >= Date.now() - 365 * DAY);
    expect(result.total).toBe(inside.length);
    const all = runningNewestFirst(ledger);
    expect(result.rows.map((row) => Number(row.balance))).toEqual(all.slice(0, result.rows.length));
    expect(result.rows.length).toBe(inside.length);
    expect(result.totals.points).toBe(inside.reduce((sum, row) => sum + row.points, 0));
  });

  it("narrows to what happened", async () => {
    const result = await page({ filters: { what: "birthday" } });
    expect(result.rows.map((row) => row.what)).toEqual(["Birthday bonus"]);
  });
});

describe("their purchases (CUS-03)", () => {
  it("counts the record's 12 months, as Visits does, and every sale with Any time", async () => {
    const purchases = CUSTOMER_RECORD_LOADERS["retail-customer-purchases"]!;
    const list = CUSTOMER_REPORTS.find((source) => source.key === "retail-customer-purchases")!.list!;
    const now = Date.now();
    for (const [n, daysAgo] of [[1, 400], [2, 200], [3, 30]] as const) {
      await prisma.retailSale.create({
        data: { companyId: shop.companyId, saleNo: `P-${n}-${now}`, siteId: shop.mainId, customerId, totalAmount: 10, baseAmount: 10, postedAt: new Date(now - daysAgo * DAY) },
      });
    }
    const since12m = dayKey(new Date(now - 365 * DAY));
    const read = (filters: Record<string, string>) =>
      purchases.page!(
        ctx(),
        resolveListQuery(list, { page: 1, size: 25, filters: { customer: customerId, ...filters } }, {}, { role: "SUPERADMIN", seeCost: true, defaultSite: null }),
      );
    expect((await read({ when: `${since12m}..` })).total).toBe(2);
    expect((await read({})).total).toBe(3);
  });
});
