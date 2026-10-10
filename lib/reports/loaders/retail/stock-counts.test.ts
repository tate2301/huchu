/**
 * Counts (30-stock 5.5, `retail-stock-counts`), against a real Postgres: the
 * tabs (To approve first, Done holding the approved and the cancelled), the
 * When words each state reads in, the Lines figure while counting, Differ and
 * Difference empty until a count is sent and summed in the totals, and the
 * value at cost kept from a stock clerk.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { money, quantity } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { startOfDayIn } from "@/lib/reports/list-query";
import { fetchListPage } from "@/lib/reports/request";
import { DEFAULT_TIME_ZONE, dayKey } from "@/lib/workspace/format";

import { cellText } from "@/components/list-frame/model";
import { STOCK_COUNT_REPORTS } from "@/lib/reports/definitions/retail/stock-counts";

import { STOCK_COUNT_LOADERS } from "./stock-counts";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const MINUTE = 60 * 1000;
let companyId: string;
let managerId: string;
let clerkId: string;

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Counts list ${stamp}`, slug: `counts-list-${stamp}` }, select: { id: true } })).id;
  const user = async (name: string, role: "MANAGER" | "STOCK_CLERK") =>
    (await prisma.user.create({ data: { email: `${role.toLowerCase()}-${stamp}@shop.test`, name, role, companyId }, select: { id: true } })).id;
  managerId = await user("Tafara Nyathi", "MANAGER");
  clerkId = await user("Rudo Moyo", "STOCK_CLERK");
  const siteId = (await prisma.site.create({ data: { companyId, code: `HRE-${stamp}`, name: "Harare Main Branch" }, select: { id: true } })).id;
  const place = (await prisma.stockLocation.create({ data: { siteId, code: "SHOP", name: "Shop floor" }, select: { id: true } })).id;
  const items: string[] = [];
  for (const [code, name] of [["GIN", "Gordon’s Gin 750ml"], ["WINE", "Nederburg Cabernet 750ml"], ["BOLS", "Bols Brandy 50ml"]] as const) {
    items.push(
      (
        await prisma.inventoryItem.create({
          data: { itemCode: `${code}-${stamp}`, name, category: "OTHER", unit: "bottle", siteId, locationId: place, currentStock: quantity(10) },
          select: { id: true },
        })
      ).id,
    );
  }
  // The shop's day began a moment ago, so what the fixture says happened "today" is today whatever the hour the suite runs.
  const dayStart = startOfDayIn(dayKey(new Date(), DEFAULT_TIME_ZONE), DEFAULT_TIME_ZONE).getTime();
  // Sent for review early today: two short at US$12.40 and US$9.40, two over at US$1.20.
  await prisma.retailStockCount.create({
    data: {
      companyId,
      countNo: "CNT-0020",
      siteId,
      name: "Spirits shelf",
      scope: "CATEGORIES",
      status: "TO_APPROVE",
      counterId: clerkId,
      createdById: managerId,
      createdAt: new Date(dayStart + MINUTE),
      submittedAt: new Date(dayStart + 2 * MINUTE),
      lines: {
        create: [
          [items[0]!, -2, 12.4],
          [items[1]!, -2, 9.4],
          [items[2]!, 2, 1.2],
        ].map(([inventoryItemId, difference, cost], index) => ({
          companyId,
          inventoryItemId: inventoryItemId as string,
          expected: quantity(10),
          counted: quantity(10 + (difference as number)),
          expectedAtCount: quantity(10),
          difference: quantity(difference as number),
          unitCost: money(cost as number),
          sortKey: `~|${index}`,
        })),
      },
    },
  });
  // Being counted: one of three lines in.
  await prisma.retailStockCount.create({
    data: {
      companyId,
      countNo: "CNT-0021",
      siteId,
      name: "Cold room",
      scope: "PLACE",
      counterId: clerkId,
      createdById: managerId,
      createdAt: new Date(dayStart + MINUTE),
      lines: {
        create: items.map((inventoryItemId, index) => ({
          companyId,
          inventoryItemId,
          expected: quantity(10),
          counted: index === 0 ? quantity(10) : null,
          difference: index === 0 ? quantity(0) : null,
          sortKey: `~|${index}`,
        })),
      },
    },
  });
  // Approved on 2 October: what it was approved at is what it reads.
  await prisma.retailStockCount.create({
    data: {
      companyId,
      countNo: "CNT-0019",
      siteId,
      name: "Beer, back store",
      scope: "PLACE",
      status: "APPROVED",
      counterId: managerId,
      createdById: managerId,
      createdAt: new Date("2025-10-02T06:30:00Z"),
      submittedAt: new Date("2025-10-02T06:58:00Z"),
      approvedAt: new Date("2025-10-02T07:12:00Z"),
      differenceValue: money(-1.72),
      lines: {
        create: {
          companyId,
          inventoryItemId: items[0]!,
          expected: quantity(10),
          counted: quantity(8),
          expectedAtCount: quantity(10),
          difference: quantity(-2),
          unitCost: money(0.86),
          sortKey: "~|0",
        },
      },
    },
  });
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.retailStockCount.deleteMany({ where: { companyId } });
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId } } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId } } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } }).catch(() => {});
});

const session = (id: string, role: string) =>
  ({ user: { id, companyId, role, enabledFeatures: ["retail.core"] }, expires: "" }) as AuthenticatedSession;

describe("the Counts list", () => {
  it("reads each count's lines, differences and when, by its state", async () => {
    const { rows } = await STOCK_COUNT_LOADERS["retail-stock-counts"]!.load({ companyId, userId: managerId, role: "MANAGER" }, {});
    const by = (no: string) => rows.find((row) => row.countNo === no)!;
    expect(by("CNT-0020")).toMatchObject({ state: "To approve", tone: "warn", lines: "3", differ: 3, difference: -41.2, counter: "Rudo Moyo" });
    expect(by("CNT-0020").when).toMatch(/^Today, \d\d:\d\d$/);
    expect(by("CNT-0021")).toMatchObject({ state: "Counting", tone: "info", lines: "1 of 3", differ: null, difference: null });
    expect(by("CNT-0021").when).toMatch(/^Started \d\d:\d\d$/);
    // While counting, Difference reads the board's faint en dash, not the frame's em dash.
    const difference = STOCK_COUNT_REPORTS[0]!.list!.columns.find((column) => column.key === "difference")!;
    expect(cellText(difference, by("CNT-0021"))).toBe("–");
    expect(cellText(difference, by("CNT-0020"))).toBe("−US$41.20");
    expect(by("CNT-0019")).toMatchObject({ state: "Approved", tone: "hollow", lines: "1", differ: 1, difference: -1.72, when: "2 Oct 2025, 09:12" });
  });

  it("counts its tabs, opens on To approve, and sums Differ and Difference over the rows", async () => {
    const page = await fetchListPage(session(managerId, "MANAGER"), "retail-stock-counts", { page: 1, size: 50, filters: {} });
    if ("error" in page) throw new Error(page.error);
    expect(page.tabs).toEqual({ toapprove: 1, counting: 1, done: 1, all: 3 });
    expect(page.rows.map((row) => row.countNo)).toEqual(["CNT-0020"]);
    const all = await fetchListPage(session(managerId, "MANAGER"), "retail-stock-counts", { page: 1, size: 50, tab: "all", filters: {} });
    if ("error" in all) throw new Error(all.error);
    expect(all.rows.map((row) => row.countNo)).toEqual(["CNT-0021", "CNT-0020", "CNT-0019"]);
    expect(all.totals).toMatchObject({ differ: 4, difference: -42.92 });
  });

  it("keeps the value at cost from a stock clerk", async () => {
    const { rows } = await STOCK_COUNT_LOADERS["retail-stock-counts"]!.load({ companyId, userId: clerkId, role: "STOCK_CLERK" }, {});
    expect(rows.find((row) => row.countNo === "CNT-0020")).toMatchObject({ difference: null, figure: "3", differ: 3 });
    const page = await fetchListPage(session(clerkId, "STOCK_CLERK"), "retail-stock-counts", { page: 1, size: 50, tab: "all", filters: {} });
    if ("error" in page) throw new Error(page.error);
    expect(page.report.list.columns.map((column) => column.key)).not.toContain("difference");
  });
});
