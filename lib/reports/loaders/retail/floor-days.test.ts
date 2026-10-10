import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { closeDay } from "@/lib/retail/floor/day-close";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";
import { tradingDayKey } from "@/lib/retail/z-report";

import { FLOOR_DAY_LOADERS, dayWords } from "./floor-days";

/**
 * Past days (FLR-07) as the list reads them: a closed day from its frozen
 * close, "Signed off short" when it closed with a shortage, a day not closed
 * yet added up live, the Date search, the site and state filters, the
 * totals over the filtered set, a short day's difference in warn, and only
 * the sites the viewer works at. Against the test database.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { GET as listGet } from "@/app/api/v2/reports/[key]/route";

let shop: TestShop;
let till = { id: "", code: "" };
let seq = 0;
const days = { closed: "", short: "", open: "" };

const session = () => ({
  user: { id: shop.managerId, companyId: shop.companyId, role: "MANAGER", name: "Tafara Nyathi", email: "tafara@days.test", enabledFeatures: ["retail.core", "retail.shifts"] },
});

async function day(date: string, takings: string, options: { variance?: string; open?: boolean } = {}) {
  seq += 1;
  const shift = await prisma.retailShift.create({
    data: {
      companyId: shop.companyId,
      shiftNo: `SH-${70000 + seq}-${shop.companyId.slice(0, 4)}`,
      registerId: till.id,
      registerCode: till.code,
      registerName: "Front till",
      siteId: shop.mainId,
      cashierId: shop.managerId,
      cashierName: "Chipo Dube",
      openingFloat: "100.00",
      expectedCash: "100.00",
      status: options.open ? "OPEN" : "CLOSED",
      openedAt: new Date(`${date}T08:00:00.000Z`),
      ...(options.open
        ? {}
        : {
            closedAt: new Date(`${date}T20:00:00.000Z`),
            countedCash: (100 + Number(options.variance ?? 0)).toFixed(2),
            variance: options.variance ?? "0.00",
            signOffOutcome: options.variance ? "ACCEPT" : null,
          }),
    },
  });
  await prisma.retailSale.create({
    data: {
      companyId: shop.companyId,
      saleNo: `S-${70000 + seq}-${shop.companyId.slice(0, 4)}`,
      siteId: shop.mainId,
      registerId: till.id,
      shiftId: shift.id,
      cashierId: shop.managerId,
      saleType: "SALE",
      status: "POSTED",
      subtotal: takings,
      totalAmount: takings,
      baseAmount: takings,
      tenderedAmount: takings,
      postedAt: new Date(`${date}T10:00:00.000Z`),
      payments: { create: [{ companyId: shop.companyId, tenderType: "CASH", amount: takings, baseAmount: takings, currency: "USD" }] },
    },
  });
}

async function list(query = "") {
  const response = await listGet(new NextRequest(`http://hurudza.test/api/v2/reports/retail-days?page=1&size=50${query}`), { params: Promise.resolve({ key: "retail-days" }) });
  const body = await response.json();
  const data = body.data ?? body;
  return { status: response.status, rows: data.rows as Array<Record<string, unknown>>, totals: data.totals as Record<string, unknown>, total: data.total as number };
}

beforeAll(async () => {
  shop = await makeTestShop("Past days", { twoSites: true });
  till = { id: (await prisma.retailRegister.create({ data: { companyId: shop.companyId, siteId: shop.mainId, code: `FRONT-${shop.companyId.slice(0, 6)}`, name: "Front till" }, select: { id: true } })).id, code: `FRONT-${shop.companyId.slice(0, 6)}` };
  const ago = (n: number) => tradingDayKey(new Date(Date.now() - n * 86_400_000));
  days.closed = ago(4);
  days.short = ago(3);
  days.open = ago(2);
  await day(days.closed, "300.00");
  await day(days.short, "200.00", { variance: "-20.00" });
  await day(days.open, "50.00", { open: true });
  const actor = session();
  await closeDay(actor, { siteId: shop.mainId, date: days.closed, banked: "0" });
  await closeDay(actor, { siteId: shop.mainId, date: days.short, banked: "0" });
  validateSessionMock.mockResolvedValue({ session: actor });
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  const companyId = shop.companyId;
  await prisma.retailDayClose.deleteMany({ where: { companyId } });
  await prisma.retailZReport.deleteMany({ where: { companyId } });
  await prisma.retailSale.deleteMany({ where: { companyId } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
}, 60_000);

describe("Past days", () => {
  it("lists every site-day, newest first: closed days from their close, the open one live and Not closed", async () => {
    const { status, rows, total } = await list();
    expect(status).toBe(200);
    expect(total).toBe(3);
    expect(rows.map((row) => [row.date, row.state, row.takings, row.cashDifference, row.banked])).toEqual([
      [days.open, "Not closed", 50, 0, null],
      [days.short, "Signed off short", 200, -20, 0],
      [days.closed, "Closed", 300, 0, 0],
    ]);
    expect(rows[2]).toMatchObject({ site: "Harare Main Branch", siteId: shop.mainId, id: `${shop.mainId}_${days.closed}` });
    // Cash difference is plain money; only a short day takes the warn ink.
    expect(rows.map((row) => row.differenceTone)).toEqual([null, "warn", null]);
  });

  it("lists only the sites the viewer works at, and offers only those", async () => {
    const elsewhere = await prisma.user.create({
      data: { companyId: shop.companyId, name: "Borrowdale manager", role: "MANAGER", email: `borr-${shop.companyId}@days.test`, allSites: false },
      select: { id: true },
    });
    await prisma.userSiteAccess.create({ data: { userId: elsewhere.id, siteId: shop.secondId!, companyId: shop.companyId } });
    const ctx = { companyId: shop.companyId, userId: elsewhere.id, role: "MANAGER" };
    const loader = FLOOR_DAY_LOADERS["retail-days"]!;
    expect((await loader.load(ctx, {} as never)).rows).toEqual([]);
    expect((await loader.options!(ctx)).site!.map((option) => option.value)).toEqual([shop.secondId]);
    // Every site for whoever works at all of them.
    expect((await loader.load({ ...ctx, userId: shop.managerId }, {} as never)).rows).toHaveLength(3);
  });

  it("totals the filtered set and narrows by state and by the Date search", async () => {
    const all = await list();
    expect(all.totals).toMatchObject({ takings: 550, cashDifference: -20 });
    const notClosed = await list("&state=not-closed");
    expect(notClosed.rows.map((row) => row.date)).toEqual([days.open]);
    const short = await list("&state=short");
    expect(short.rows.map((row) => row.date)).toEqual([days.short]);
    expect(short.totals).toMatchObject({ takings: 200 });
    const searched = await list(`&q=${encodeURIComponent(days.closed)}`);
    expect(searched.rows.map((row) => row.date)).toEqual([days.closed]);
    const other = await list(`&site=${shop.secondId}`);
    expect(other.rows).toEqual([]);
  });

  it("searches a day the ways people write it", () => {
    expect(dayWords("2026-10-02")).toBe("Fri 2 Oct 2026 · 2 October 2026 · 2026-10-02");
    expect(dayWords("2026-09-30")).toBe("Wed 30 Sep 2026 · 30 September 2026 · 2026-09-30");
  });
});
