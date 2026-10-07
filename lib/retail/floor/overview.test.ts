import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { addTestSale, destroySalesShop, makeSalesShop, type SalesShop } from "@/lib/retail/floor/test-fixtures";
import { needsAction, type NeedsContext, type OverviewShift } from "@/lib/retail/floor/needs-action";
import { drawerRow, uncountedRow } from "@/lib/retail/floor/needs-action/drawers";
import { flaggedRow } from "@/lib/retail/floor/needs-action/flagged-sales";
import { lowStockRow } from "@/lib/retail/floor/needs-action/low-stock";
import { notFiscalisedRow } from "@/lib/retail/floor/needs-action/not-fiscalised";
import { promotionRow } from "@/lib/retail/floor/needs-action/promotion-ending";
import { staleShiftRows } from "@/lib/retail/floor/needs-action/stale-shift";
import { countTitle, namesByCount } from "@/lib/retail/floor/needs-action/words";
import type { OnHandLine } from "@/lib/retail/stock/on-hand";

/**
 * The Overview's rules (50-floor §4.1, FLR-08): its windows and what each is
 * compared with, the Needs action rows and their words, Tills now, how
 * people paid, and the figures `loadOverview` reads off a shop's own sales.
 */

// A role that may read the Overview and nothing else: the margin tile and the rows it cannot act on go.
vi.mock("@/lib/retail/permission-matrix", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/retail/permission-matrix")>();
  const reportsOnly = (session: { user: { role?: string | null } }) => session.user.role === "REPORTS_ONLY";
  return {
    ...actual,
    canRetailSessionDo: (session: Parameters<typeof actual.canRetailSessionDo>[0], resource: string, action: string) =>
      reportsOnly(session) ? resource === "retail.reports" && action === "view" : actual.canRetailSessionDo(session, resource as never, action as never),
    retailPermissionDenial: (session: Parameters<typeof actual.retailPermissionDenial>[0], resource: string, action: string) =>
      reportsOnly(session) && resource === "retail.reports" && action === "view" ? null : actual.retailPermissionDenial(session, resource as never, action as never),
  };
});

import {
  cashiersTile,
  deltaPct,
  loadOverview,
  marginPct,
  overviewWindow,
  paidTile,
  salesTiles,
  sharesTo100,
  takingsTile,
  tillsNowTile,
  type LineRow,
  type TakingsRow,
} from "./overview";

/** Saturday 3 October 2026, 14:42 in Harare. */
const NOW = new Date("2026-10-03T12:42:00Z");
const harare = (iso: string) => new Date(`${iso}+02:00`);
const dec = (value: string) => new Prisma.Decimal(value);

function shift(partial: Partial<OverviewShift> & Pick<OverviewShift, "id" | "cashierName">): OverviewShift {
  return {
    shiftNo: `SH-${partial.id}`,
    registerId: "front",
    registerName: "Front till",
    cashierId: partial.cashierName,
    openingFloat: dec("200.00"),
    status: "CLOSED",
    openedAt: harare("2026-09-30T07:58:00"),
    closedAt: harare("2026-09-30T21:58:00"),
    countedCash: dec("400.00"),
    variance: dec("0.00"),
    signOffOutcome: null,
    ...partial,
  };
}

describe("windows", () => {
  it("compares today with the same weekday last week up to this hour", () => {
    const window = overviewWindow("today", NOW);
    expect(window.from.toISOString()).toBe("2026-10-02T22:00:00.000Z");
    expect(window.againstFrom.toISOString()).toBe("2026-09-25T22:00:00.000Z");
    expect(window.againstTo.toISOString()).toBe("2026-09-26T12:42:00.000Z");
    expect(window.against).toBe("on last Saturday by this hour");
    expect(window.deltaLabel).toBe("on last Saturday");
    expect(window.legend).toEqual(["Today", "Last Saturday"]);
  });

  it("starts the week on Monday, also on a Monday morning", () => {
    expect(overviewWindow("week", NOW).from.toISOString()).toBe("2026-09-27T22:00:00.000Z");
    const monday = overviewWindow("week", harare("2026-10-05T09:00:00"));
    expect(monday.from.toISOString()).toBe("2026-10-04T22:00:00.000Z");
    expect(monday.againstFrom.toISOString()).toBe("2026-09-27T22:00:00.000Z");
    expect(monday.againstTo.toISOString()).toBe("2026-09-28T07:00:00.000Z");
    expect(monday.label).toBe("Takings this week");
    expect(monday.against).toBe("on last week by now");
  });

  it("runs the month from the 1st against last month to the same day, its last day when it is shorter", () => {
    const month = overviewWindow("month", NOW);
    expect(month.from.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(month.againstFrom.toISOString()).toBe("2026-08-31T22:00:00.000Z");
    expect(month.againstTo.toISOString()).toBe("2026-09-03T12:42:00.000Z");
    const first = overviewWindow("month", harare("2026-10-01T09:00:00"));
    expect(first.from.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(first.againstTo.toISOString()).toBe("2026-09-01T07:00:00.000Z");
    const march = overviewWindow("month", harare("2027-03-31T10:00:00"));
    expect(march.againstTo.toISOString()).toBe("2027-02-28T22:00:00.000Z");
    expect(month.against).toBe("on last month by now");
  });

  it("says nothing to compare with when the comparison took nothing", () => {
    expect(deltaPct(128460, 118720)).toBe(8.2);
    expect(deltaPct(100, 0)).toBeNull();
    const window = overviewWindow("today", NOW);
    const takings = takingsTile(window, [], { open: 7, close: 19 });
    expect(takings).toMatchObject({ value: "0.00", against: { value: "0.00", deltaPct: null } });
    expect(takings.axis).toEqual(["07:00", "10:00", "13:00", "16:00", "19:00"]);
    expect(takings.series.slice(0, 8)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(takings.series[8]).toBeNull();
    const { sales, basket } = salesTiles(window, [], NOW);
    expect(sales).toMatchObject({ value: 0, delta: null, bars: [0, 0, 0, 0, 0, 0, 0] });
    expect(basket).toMatchObject({ value: "0.00", delta: null });
  });
});

describe("Needs action", () => {
  const week = overviewWindow("week", NOW).from;
  const shifts = [
    shift({ id: "a", cashierName: "Chipo Dube", variance: dec("-7.15"), closedAt: harare("2026-09-30T21:58:00") }),
    shift({ id: "b", cashierName: "Farai Moyo", variance: dec("-8.14"), closedAt: harare("2026-10-01T21:58:00") }),
    shift({ id: "c", cashierName: "Chipo Dube", variance: dec("-0.50"), closedAt: harare("2026-10-02T21:58:00") }),
    shift({ id: "d", cashierName: "Chipo Dube", variance: dec("-3.00"), signOffOutcome: "ACCEPT" }),
    shift({ id: "e", cashierName: "Farai Moyo", variance: dec("-2.00"), closedAt: harare("2026-09-26T21:58:00") }),
    shift({ id: "f", cashierName: "Tafara Nyathi", variance: dec("1.20"), signOffOutcome: "LOOK_INTO" }),
    shift({ id: "g", cashierName: "Tafara Nyathi", countedCash: null, variance: null, closedAt: harare("2026-08-08T22:00:00"), shiftNo: "SH-00229" }),
    shift({ id: "h", cashierName: "Farai Moyo", status: "OPEN", closedAt: null, countedCash: null, variance: null, registerName: "Back till", openedAt: harare("2026-10-01T10:42:00"), shiftNo: "SH-00240" }),
  ];

  it("counts in words and names the people by how often", () => {
    expect(countTitle(3, "drawer", "drawers")).toBe("Three drawers");
    expect(countTitle(1, "drawer", "drawers")).toBe("One drawer");
    expect(countTitle(12, "drawer", "drawers")).toBe("12 drawers");
    expect(namesByCount(["Farai Moyo", "Chipo Dube", "Chipo Dube"])).toBe("Chipo Dube twice, Farai Moyo once");
    expect(namesByCount(["A", "A", "A", "B", "B", "B", "B"])).toBe("B 4 times, A three times");
  });

  it("puts this week's unsigned short drawers in one row, to the oldest one's sign-off", () => {
    expect(drawerRow(shifts, week, "short")).toEqual({
      key: "short",
      tone: "bad",
      title: "Three drawers short this week",
      meta: "Chipo Dube twice, Farai Moyo once",
      figure: "−US$15.79",
      figureTone: "bad",
      href: "/retail/shifts/a?sheet=sign-off&id=a",
    });
    expect(drawerRow(shifts, week, "over")).toMatchObject({ title: "One drawer over this week", meta: "Tafara Nyathi once", figure: "+US$1.20" });
    expect(uncountedRow(shifts)).toMatchObject({ title: "One drawer closed without a count", meta: "SH-00229 · Tafara Nyathi · 8 Aug", href: "/retail/shifts/g?sheet=sign-off&id=g" });
  });

  it("names a drawer open more than 12 hours, to its close", () => {
    const rows = staleShiftRows(shifts, new Map([["h", { takings: dec("72.95"), sales: 11 }]]), NOW);
    expect(rows).toEqual([
      {
        key: "stale-shift",
        tone: "warn",
        title: "Back till open for 52 hours",
        meta: "SH-00240 · Farai Moyo · not cashed up since 1 Oct",
        figure: "US$72.95",
        figureTone: "ink",
        href: "/retail/shifts/h/close",
      },
    ]);
  });

  it("words the stock, fiscal, flagged and promotion rows", () => {
    const line = (product: string, onHand: number, coverDays: number | null, level: OnHandLine["level"]) => ({ product, onHand, coverDays, level });
    expect(lowStockRow([line("Gordon’s Gin 750ml", 30, 20, "FINE"), line("Johnnie Walker Black 750ml", 6, 5, "LOW"), line("Jameson 750ml", 9, 2, "LOW")])).toMatchObject({
      title: "Two products below reorder level",
      meta: "Jameson 750ml has 9 left, about 2 days",
      figure: "2",
      href: "/retail/stock?tab=low",
    });
    expect(lowStockRow([line("Jaggermeister 750ml", 0, null, "OUT")])?.meta).toBe("Jaggermeister 750ml is out");
    const offline = { name: "Handheld 1", device: { kind: "KORA" as const, lastSeenAt: harare("2026-10-03T13:58:00") }, shiftOpen: true };
    const sales = [
      { postedAt: harare("2026-10-03T14:01:00"), till: offline },
      { postedAt: harare("2026-10-03T14:10:00"), till: offline },
    ];
    expect(notFiscalisedRow(sales, NOW)).toMatchObject({
      title: "Two receipts not yet fiscalised",
      meta: "Handheld 1 offline since 13:58 · will send on reconnect",
      href: "/retail/manage/tills",
    });
    const online = { ...offline, device: { kind: "KORA" as const, lastSeenAt: NOW } };
    expect(notFiscalisedRow([{ postedAt: NOW, till: online }], NOW)?.meta).toBe("Waiting for ZIMRA · it retries every few minutes");
    expect(flaggedRow(3, "Sold after licence hours.")).toMatchObject({ title: "Three sales to look at", meta: "Sold after licence hours", href: "/retail/sales?tab=all&flagged=only" });
    expect(promotionRow(["Castle Lager case of 24 at US$24.00"])).toMatchObject({ title: "Promotion ends tomorrow", meta: "Castle Lager case of 24 at US$24.00", tone: "info" });
    expect(promotionRow([])).toBeNull();
  });

  it("lists the rows in order, each only for a caller who may act on it", async () => {
    const ctx: NeedsContext = {
      companyId: randomUUID(),
      siteIds: null,
      now: NOW,
      weekStart: week,
      tomorrow: "2026-10-04",
      shifts: async () => shifts,
      shiftFigures: async () => new Map(),
      lowStock: async () => [{ product: "Jameson 750ml", onHand: 9, coverDays: 2, level: "LOW" } as OnHandLine],
    };
    const owner = await needsAction({ user: { role: "SUPERADMIN" } }, ctx);
    expect(owner.map((row) => row.key)).toEqual(["stale-shift", "short", "over", "uncounted", "low-stock"]);
    const books = await needsAction({ user: { role: "FINANCE_OFFICER" } }, ctx);
    expect(books.map((row) => row.key)).toEqual(["low-stock"]);
    expect(await needsAction({ user: { role: "REPORTS_ONLY" } }, ctx)).toEqual([]);
  });
});

describe("tiles", () => {
  it("shares how people paid as whole numbers that make exactly 100", () => {
    expect(sharesTo100([52669, 43676, 19269, 12846])).toEqual([41, 34, 15, 10]);
    expect(sharesTo100([1, 1, 1])).toEqual([34, 33, 33]);
    expect(sharesTo100([0, 0])).toEqual([0, 0]);
    const paid = paidTile([
      { tenderType: "CASH", currency: "USD", cents: 52669 },
      { tenderType: "ECOCASH", currency: "USD", cents: 43676 },
      { tenderType: "CARD", currency: "USD", cents: 19269 },
      { tenderType: "CASH", currency: "ZWG", cents: 12846 },
      { tenderType: "VOUCHER", currency: "USD", cents: 333 },
    ]);
    expect(paid.map((part) => part.name)).toEqual(["Cash", "EcoCash", "Card", "ZiG", "Other"]);
    expect(paid.reduce((sum, part) => sum + part.share, 0)).toBe(100);
    expect(paidTile([]).map((part) => part.key)).toEqual(["cash", "ecocash", "card", "zig"]);
  });

  it("works margin off the standing sales net of refunds", () => {
    const line = (saleType: LineRow["saleType"], status: LineRow["status"], total: number, tax: number, cost: number): LineRow => ({
      at: harare("2026-10-03T10:00:00"),
      saleType,
      status,
      productId: "p",
      name: "Johnnie Walker Black 750ml",
      unit: "bottle",
      quantity: total > 0 ? 1 : -1,
      totalCents: total,
      taxCents: tax,
      costCents: cost,
    });
    const window = overviewWindow("today", NOW);
    // Two sold, one refunded, one voided: net ex VAT 7273 − cost 3100 over 7273.
    const lines = [line("SALE", "POSTED", 4200, 564, 3100), line("SALE", "POSTED", 4200, 564, 3100), line("REFUND", "POSTED", -4200, -564, -3100), line("SALE", "VOIDED", 4200, 564, 3100)];
    expect(marginPct(lines, window.from, window.to)).toBe(Number((((3636 - 3100) / 3636) * 100).toFixed(1)));
    expect(marginPct([], window.from, window.to)).toBeNull();
  });

  it("reads each till's state off its shift and device", () => {
    const shifts = [
      shift({ id: "front", cashierName: "Chipo Dube", status: "OPEN", closedAt: null, countedCash: null, variance: null, registerId: "front", openedAt: harare("2026-10-03T07:58:00") }),
      shift({ id: "back", cashierName: "Farai Moyo", status: "OPEN", closedAt: null, countedCash: null, variance: null, registerId: "back", registerName: "Back till", openedAt: harare("2026-10-01T10:18:00") }),
      shift({ id: "hand", cashierName: "Tendai Mhlanga", status: "OPEN", closedAt: null, countedCash: null, variance: null, registerId: "hand", registerName: "Handheld 1", openedAt: harare("2026-10-03T10:05:00") }),
      shift({ id: "spare", cashierName: "Tafara Nyathi", registerId: "spare", registerName: "Spare till", openedAt: harare("2026-10-03T08:00:00"), closedAt: harare("2026-10-03T12:30:00") }),
    ];
    const rows: TakingsRow[] = [{ at: harare("2026-10-03T09:00:00"), cents: 1250, saleType: "SALE", status: "POSTED", registerId: "spare", shiftId: "spare" }];
    const tills = tillsNowTile({
      tills: [
        { id: "spare", name: "Spare till", device: { kind: "KORA", lastSeenAt: harare("2026-10-03T12:30:00") } },
        { id: "hand", name: "Handheld 1", device: { kind: "KORA", lastSeenAt: harare("2026-10-03T13:58:00") } },
        { id: "front", name: "Front till", device: { kind: "COUNTER_MINI", lastSeenAt: NOW } },
        { id: "back", name: "Back till", device: { kind: "BROWSER", lastSeenAt: NOW } },
        { id: "cold", name: "Cold room till", device: null },
      ],
      shifts,
      figures: new Map([
        ["front", { takings: dec("842.15"), sales: 91 }],
        ["back", { takings: dec("72.95"), sales: 11 }],
        ["hand", { takings: dec("369.50"), sales: 40 }],
      ]),
      rows,
      today: "2026-10-03",
      now: NOW,
    });
    expect(tills.map((till) => [till.name, till.stateLabel, till.meta, till.takings, till.sales])).toEqual([
      ["Front till", "Open", "Chipo Dube · since 07:58 · float US$200.00", "842.15", 91],
      ["Back till", "Open 52h", "Farai Moyo · since 1 Oct 10:18 · needs closing", "72.95", 11],
      ["Handheld 1", "Offline", "Tendai · last seen 13:58", "369.50", 40],
      ["Spare till", "Closed", "Closed at 12:30 · Tafara Nyathi", "12.50", 1],
    ]);
    expect(tills[0]!.href).toBe("/retail/shifts/front");
  });

  it("ranks this week's cashiers by takings with their differences", () => {
    const week = overviewWindow("week", NOW).from;
    const rows = cashiersTile(
      [
        shift({ id: "a", cashierName: "Chipo Dube", variance: dec("-7.15") }),
        shift({ id: "b", cashierName: "Chipo Dube", variance: dec("-0.50") }),
        shift({ id: "c", cashierName: "Tafara Nyathi" }),
        shift({ id: "d", cashierName: "Tendai Mhlanga", status: "OPEN", countedCash: null, variance: null, closedAt: null }),
      ],
      new Map([
        ["a", { takings: dec("300.00"), sales: 30 }],
        ["b", { takings: dec("100.00"), sales: 10 }],
        ["c", { takings: dec("200.00"), sales: 20 }],
        ["d", { takings: dec("50.00"), sales: 5 }],
      ]),
      week,
    );
    expect(rows.map((row) => [row.name, row.takings, row.meta, row.pct])).toEqual([
      ["Chipo Dube", "400.00", "2 shifts · −US$7.65", 1],
      ["Tafara Nyathi", "200.00", "1 shift · balanced", 0.5],
      ["Tendai Mhlanga", "50.00", "1 shift · not counted yet", 0.125],
    ]);
  });
});

describe("loadOverview", () => {
  let shop: SalesShop;
  const session = () => ({ user: { id: shop.ownerId, companyId: shop.companyId, role: "SUPERADMIN" } });

  beforeAll(async () => {
    shop = await makeSalesShop("Overview");
    const johnnie = (quantity: number) => ({ item: shop.johnnie, name: "Johnnie Walker Black 750ml", quantity, price: "42.00", cost: "31.00" });
    await addTestSale(shop, { saleNo: "S-1", at: harare("2026-10-03T10:00:00"), lines: [johnnie(2)] });
    await addTestSale(shop, { saleNo: "S-2", at: harare("2026-10-03T11:00:00"), lines: [{ item: shop.ice, name: "Ice 2kg bag", quantity: 1, price: "2.20", cost: "1.10" }], payments: [{ tender: "ECOCASH", amount: "2.20" }] });
    await addTestSale(shop, { saleNo: "R-1", at: harare("2026-10-03T12:00:00"), saleType: "REFUND", lines: [johnnie(-1)] });
    await addTestSale(shop, { saleNo: "S-3", at: harare("2026-10-03T10:30:00"), till: "back", lines: [johnnie(1)] });
    await addTestSale(shop, { saleNo: "S-0", at: harare("2026-09-26T10:00:00"), lines: [johnnie(1)] });
    // After this hour last Saturday: not in the comparison.
    await addTestSale(shop, { saleNo: "S-9", at: harare("2026-09-26T18:00:00"), lines: [johnnie(1)] });
  }, 60_000);

  afterAll(async () => {
    await destroySalesShop(shop);
  });

  it("adds up the site's takings, sales, basket and payments against last Saturday", async () => {
    const view = await loadOverview(session(), { period: "today", siteId: shop.mainId }, NOW);
    expect(view.site?.id).toBe(shop.mainId);
    expect(view.tiles.takings).toMatchObject({ label: "Takings today", value: "44.20", against: { value: "42.00", deltaPct: 5.2 } });
    expect(view.tiles.sales).toMatchObject({ value: 2, delta: 1, deltaLabel: "on last Saturday" });
    expect(view.tiles.basket).toMatchObject({ value: "22.10", delta: "-19.90" });
    expect(view.tiles.paid.map((part) => [part.key, part.value, part.share])).toEqual([
      ["cash", "42.00", 95],
      ["ecocash", "2.20", 5],
      ["card", "0.00", 0],
      ["zig", "0.00", 0],
    ]);
    expect(view.tiles.topProducts[0]).toMatchObject({ name: "Johnnie Walker Black 750ml", takings: "42.00", qtyLabel: "1 sold" });
    expect(view.tiles.byDay.days).toHaveLength(30);
    expect(view.tiles.byDay.days.at(-1)).toMatchObject({ date: "2026-10-03", label: "Sat 3 Oct", value: "44.20", sales: 2 });
    expect(view.tiles.margin).toBeDefined();
    expect(view.can.openShift).toBe(true);
  });

  it("takes every site with all, and relabels the tiles for the week", async () => {
    const all = await loadOverview(session(), { period: "week", siteId: "all" }, NOW);
    expect(all.site).toBeNull();
    expect(all.tiles.takings).toMatchObject({ label: "Takings this week", value: "86.20", against: { label: "on last week by now" } });
    expect(all.tiles.takings.axis).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("leaves out what the caller cannot see, and refuses what it cannot read", async () => {
    const reader = await loadOverview({ user: { id: shop.ownerId, companyId: shop.companyId, role: "REPORTS_ONLY" } }, { siteId: shop.mainId }, NOW);
    expect(reader.tiles.margin).toBeUndefined();
    expect(reader.tiles.toReorder).toBeUndefined();
    expect(reader.can.openShift).toBe(false);
    await expect(loadOverview(session(), { period: "year" }, NOW)).rejects.toMatchObject({ status: 400, message: "Choose today, this week or this month." });
    await expect(loadOverview(session(), { siteId: randomUUID() }, NOW)).rejects.toMatchObject({ status: 404 });
  });
});
