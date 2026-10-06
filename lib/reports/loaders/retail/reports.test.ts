/**
 * Items sold and Payments against a real Postgres: posted sales and refunds
 * only (a refund negative, a voided sale and its void adding nothing), the
 * tender columns adding up to Taken, revenue agreeing with Insights › Profit,
 * the database's `GROUP BY` giving the rows `rollUp` gives, and a cashier
 * reading only their own.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RetailSaleStatus, RetailSaleType, RetailTenderType, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { REPORT_ONLY_REPORTS } from "@/lib/reports/definitions/retail/reports";
import { resolveListQuery, runSource, type ListContext } from "@/lib/reports/list-query";
import type { ListQuery, ReportFace, ReportRow } from "@/lib/reports/types";
import { profitOf } from "@/lib/retail/insights";
import { canSeeRetailCostPrice } from "@/lib/retail/permissions";
import { DEFAULT_TIME_ZONE, dayKey } from "@/lib/workspace/format";

import { REPORT_ONLY_LOADERS } from "./reports";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ITEMS = REPORT_ONLY_REPORTS.find((report) => report.key === "retail-items-sold")!.report!;
const PAYMENTS = REPORT_ONLY_REPORTS.find((report) => report.key === "retail-payments")!.report!;
const items = REPORT_ONLY_LOADERS["retail-items-sold"]!;
const payments = REPORT_ONLY_LOADERS["retail-payments"]!;

let companyId: string;
let ownerId: string;
let chipoId: string;
let faraiId: string;
let mainSite: string;
let otherSite: string;
let frontTill: string;
let backTill: string;
let castleItem: string;
let castleId: string;

const now = new Date();
const daysAgo = (days: number, hourUtc = 8) => {
  const at = new Date(now.getTime() - days * 86_400_000);
  at.setUTCHours(hourUtc, 0, 0, 0);
  return at;
};
const FIRST = daysAgo(3);
const SECOND = daysAgo(2);

const owner = () => ({ companyId, userId: ownerId, role: "SUPERADMIN" });
const cashier = () => ({ companyId, userId: chipoId, role: "CASHIER" });

function resolved(face: ReportFace, role: string, over: Partial<ListQuery> = {}) {
  return resolveListQuery(face, { page: 1, size: 100, filters: { when: "30d" }, face: "report", ...over }, {}, { role, seeCost: canSeeRetailCostPrice(role) });
}

function engine(ctx: { role: string; userId: string }): ListContext {
  return { role: ctx.role, userId: ctx.userId, now, timeZone: DEFAULT_TIME_ZONE, can: () => false, seeCost: canSeeRetailCostPrice(ctx.role) };
}

type Line = { quantity: number; unitPrice: number; lineTotal: number; taxAmount: number; costTotal: number };
type Payment = { tenderType: RetailTenderType; baseAmount: number; currency?: string };

async function sale(
  saleNo: string,
  saleType: RetailSaleType,
  status: RetailSaleStatus,
  who: { id: string; name: string },
  siteId: string,
  registerId: string,
  postedAt: Date,
  lines: Line[],
  paid: Payment[],
) {
  await prisma.retailSale.create({
    data: {
      companyId,
      saleNo: `${saleNo}-${stamp}`,
      saleType,
      status,
      siteId,
      registerId,
      cashierId: who.id,
      cashierName: who.name,
      postedAt,
      createdAt: postedAt,
      totalAmount: lines.reduce((sum, line) => sum + line.lineTotal, 0),
      baseAmount: paid.reduce((sum, payment) => sum + payment.baseAmount, 0),
      lines: {
        create: lines.map((line) => ({
          companyId,
          inventoryItemId: castleItem,
          productId: castleId,
          itemName: "Castle Lager 340ml",
          ...line,
        })),
      },
      payments: {
        create: paid.map((payment) => ({
          companyId,
          tenderType: payment.tenderType,
          currency: payment.currency ?? "USD",
          amount: payment.currency === "ZWG" ? payment.baseAmount * 26.8 : payment.baseAmount,
          baseAmount: payment.baseAmount,
        })),
      },
    },
  });
}

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Sold ${stamp}`, slug: `sold-${stamp}` }, select: { id: true } })).id;
  const user = (email: string, name: string, role: UserRole) =>
    prisma.user.create({ data: { email: `${email}-${stamp}@shop.test`, name, role, companyId }, select: { id: true } }).then((found) => found.id);
  ownerId = await user("owner", "Tendai Mhlanga", "SUPERADMIN");
  chipoId = await user("chipo", "Chipo Dube", "CASHIER");
  faraiId = await user("farai", "Farai Moyo", "CASHIER");
  mainSite = (await prisma.site.create({ data: { companyId, code: `H-${stamp}`, name: "Harare Main Branch" }, select: { id: true } })).id;
  otherSite = (await prisma.site.create({ data: { companyId, code: `B-${stamp}`, name: "Borrowdale" }, select: { id: true } })).id;
  frontTill = (await prisma.retailRegister.create({ data: { companyId, code: `T1-${stamp}`, name: "Front till", siteId: mainSite }, select: { id: true } })).id;
  backTill = (await prisma.retailRegister.create({ data: { companyId, code: `T2-${stamp}`, name: "Borrowdale till", siteId: otherSite }, select: { id: true } })).id;
  const locationId = (await prisma.stockLocation.create({ data: { siteId: mainSite, code: `F-${stamp}`, name: "Shop floor" }, select: { id: true } })).id;
  castleId = (await prisma.product.create({ data: { companyId, code: `CASTLE-${stamp}`, name: "Castle Lager 340ml" }, select: { id: true } })).id;
  castleItem = (
    await prisma.inventoryItem.create({
      data: { itemCode: `CASTLE-${stamp}`, name: "Castle", category: "OTHER", unit: "bottle", siteId: mainSite, locationId, productId: castleId },
      select: { id: true },
    })
  ).id;

  const chipo = { id: chipoId, name: "Chipo Dube" };
  const farai = { id: faraiId, name: "Farai Moyo" };
  // A sale paid in US$ cash and ZiG cash.
  await sale("S-1", "SALE", "POSTED", chipo, mainSite, frontTill, FIRST, [{ quantity: 2, unitPrice: 1.5, lineTotal: 3.45, taxAmount: 0.45, costTotal: 2 }], [
    { tenderType: "CASH", baseAmount: 2 },
    { tenderType: "CASH", baseAmount: 1.45, currency: "ZWG" },
  ]);
  await sale("S-2", "SALE", "POSTED", farai, otherSite, backTill, SECOND, [{ quantity: 1, unitPrice: 23, lineTotal: 23, taxAmount: 3, costTotal: 15 }], [
    { tenderType: "ECOCASH", baseAmount: 23 },
  ]);
  // A refund, stored negative.
  await sale("R-1", "REFUND", "POSTED", chipo, mainSite, frontTill, SECOND, [{ quantity: -1, unitPrice: 1.5, lineTotal: -1.7, taxAmount: -0.2, costTotal: -1 }], [
    { tenderType: "CASH", baseAmount: -1.7 },
  ]);
  // A voided sale and its void: neither lists.
  await sale("S-3", "SALE", "VOIDED", chipo, mainSite, frontTill, FIRST, [{ quantity: 5, unitPrice: 2, lineTotal: 10, taxAmount: 1.3, costTotal: 6 }], [
    { tenderType: "CASH", baseAmount: 10 },
  ]);
  await sale("V-1", "VOID", "POSTED", chipo, mainSite, frontTill, FIRST, [{ quantity: -5, unitPrice: 2, lineTotal: -10, taxAmount: -1.3, costTotal: -6 }], [
    { tenderType: "CASH", baseAmount: -10 },
  ]);
  // On account and a bank transfer ("Other").
  await sale("S-4", "SALE", "POSTED", farai, otherSite, backTill, FIRST, [{ quantity: 3, unitPrice: 3, lineTotal: 9, taxAmount: 1, costTotal: 6 }], [
    { tenderType: "ON_ACCOUNT", baseAmount: 5 },
    { tenderType: "TRANSFER", baseAmount: 4 },
  ]);
});

afterAll(async () => {
  await prisma.retailSale.deleteMany({ where: { companyId } });
  await prisma.inventoryItem.deleteMany({ where: { siteId: { in: [mainSite, otherSite] } } });
  await prisma.retailRegister.deleteMany({ where: { companyId } });
  await prisma.stockLocation.deleteMany({ where: { siteId: { in: [mainSite, otherSite] } } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

const TENDERS = ["cash", "ecocash", "card", "zig", "account", "other"] as const;
const tenderSum = (row: Record<string, unknown>) => Math.round(TENDERS.reduce((sum, key) => sum + Number(row[key] ?? 0), 0) * 100) / 100;
const byId = (rows: ReportRow[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));

describe("payments", () => {
  it("lists posted sales' and refunds' payments, a refund negative, a void and its sale left out", async () => {
    const page = await payments.page!(owner(), resolved(PAYMENTS, "SUPERADMIN"));
    expect(page.total).toBe(6);
    expect(page.rows.map((row) => row.amount).sort((a, b) => Number(a) - Number(b))).toEqual([-1.7, 1.45, 2, 4, 5, 23]);
    expect(page.rows.find((row) => row.amount === 1.45)).toMatchObject({ tender: "ZiG", zig: 1.45, cash: null });
    expect(page.totals.taken).toBe(33.75);
    expect(tenderSum(page.totals)).toBe(33.75);
  });

  it("adds each day and till's tenders up to what it took, and Σ to the database's own sum", async () => {
    const page = await payments.page!(owner(), resolved(PAYMENTS, "SUPERADMIN", { rows: ["day", "till"] }));
    expect(page.total).toBe(4);
    for (const row of page.rows) expect(tenderSum(row)).toBe(row.taken);
    expect(page.totals.taken).toBe(33.75);

    const day = dayKey(FIRST, DEFAULT_TIME_ZONE);
    const sql = await prisma.retailSalePayment.aggregate({
      where: { companyId, sale: { status: "POSTED", saleType: { in: ["SALE", "REFUND"] }, postedAt: FIRST } },
      _sum: { baseAmount: true },
    });
    const taken = page.rows.filter((row) => row.day === day).reduce((sum, row) => sum + Number(row.taken), 0);
    expect(Math.round(taken * 100) / 100).toBe(Number(sql._sum.baseAmount));
  });

  it("rolls up in the database to the rows rollUp makes in memory", async () => {
    for (const rows of [["day", "till"], ["tender"], ["site"]]) {
      const query = resolved(PAYMENTS, "SUPERADMIN", { rows });
      const database = await payments.page!(owner(), query);
      const loaded = await payments.load(owner(), { when: "30d" });
      const memory = runSource(PAYMENTS, loaded.rows, query, engine(owner()));
      expect(byId(database.rows), rows.join(",")).toEqual(byId(memory.result.rows));
      expect(database.totals).toEqual(memory.result.totals);
    }
  });

  it("gives a cashier their own payments only", async () => {
    const page = await payments.page!(cashier(), resolved(PAYMENTS, "CASHIER"));
    expect(page.rows.map((row) => row.cashierId)).toEqual([chipoId, chipoId, chipoId]);
    expect(page.totals.taken).toBe(1.75);
  });
});

describe("items sold", () => {
  it("lists posted lines, a refund's negative, and agrees with Insights › Profit on revenue", async () => {
    const page = await items.page!(owner(), resolved(ITEMS, "SUPERADMIN"));
    expect(page.total).toBe(4);
    const refund = page.rows.find((row) => String(row.saleNo).startsWith("R-1"))!;
    expect(refund).toMatchObject({ quantity: -1, revenue: -1.5, cost: -1, margin: -0.5 });

    const lines = await prisma.retailSaleLine.findMany({
      where: { companyId, sale: { status: "POSTED", saleType: { in: ["SALE", "REFUND"] } } },
      select: { lineTotal: true, taxAmount: true, costTotal: true },
    });
    expect(page.totals.revenue).toBe(Math.round(profitOf(lines).revenue * 100) / 100);
    expect(page.totals).toMatchObject({ revenue: 29.5, cost: 22, margin: 7.5, quantity: 5 });
  });

  it("rolls up in the database to the rows rollUp makes in memory, totals unchanged", async () => {
    const flat = await items.page!(owner(), resolved(ITEMS, "SUPERADMIN"));
    for (const rows of [["item"], ["date"], ["site"], ["cashier"]]) {
      const query = resolved(ITEMS, "SUPERADMIN", { rows });
      const database = await items.page!(owner(), query);
      const loaded = await items.load(owner(), { when: "30d" });
      const memory = runSource(ITEMS, loaded.rows, query, engine(owner()));
      expect(byId(database.rows), rows.join(",")).toEqual(byId(memory.result.rows));
      for (const key of ["quantity", "revenue", "cost", "margin"]) expect(database.totals[key], key).toBe(flat.totals[key]);
    }
  });

  it("gives a cashier their own lines, without cost", async () => {
    const page = await items.page!(cashier(), resolved(ITEMS, "CASHIER"));
    expect(page.rows.map((row) => row.cashierId)).toEqual([chipoId, chipoId]);
    expect(page.rows.every((row) => !("cost" in row) && !("margin" in row))).toBe(true);
    expect(page.totals).not.toHaveProperty("cost");
  });
});
