/**
 * Asking for the same day twice gives back the same document.
 *
 * S-7.2, and the assertion the ticket turns on. "Final, can't be changed" is a
 * claim about a *second request*, not about a first one, so it cannot be proved by
 * a pure function — it has to be proved against the database that enforces it.
 * This runs against a real Postgres for the same reason
 * `lib/retail/schema-migration.test.ts` does: a mocked client would tell you the
 * shape of the mock, and what has to be true here is that
 * `RetailZReport_companyId_registerCode_businessDate_key` exists and bites.
 *
 * ── The fixture ────────────────────────────────────────────────────────────
 *
 * A throwaway tenant with one till, two closed shifts, four sales and two cash
 * movements — the smallest thing that is still a trading day with two cashiers on
 * one register, which is the scope the report claims. The sales carry payments but
 * no lines: `RetailSaleLine.inventoryItemId` is a `RESTRICT` foreign key onto the
 * core item master, and standing up a product, a stock item and a listing to
 * assert an idempotency rule would be a fixture testing somebody else's schema.
 * The best-sellers table is exercised by hand in `z-report.test.ts`, where it can
 * be worked to the cent without any of that.
 *
 * Everything is deleted afterwards, in dependency order rather than by cascading
 * off the company: `Site` is `RESTRICT` from three retail tables on purpose, so a
 * blind `company.delete` would fail and leave the fixture behind.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@corelithzw/db/client";
import { generateRetailZReportTransaction } from "./transactions";
import { buildRetailZReportNo } from "./z-report";

const FRIDAY = "2026-08-14";
const REGISTER = "ZTEST01";
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let companyId = "";
let siteId = "";
let userId = "";

const actor = () => ({
  companyId,
  userId,
  userRole: "SHOP_MANAGER" as const,
  userName: "Rudo Marimo",
  userEmail: `zreport-${stamp}@example.invalid`,
});

beforeAll(async () => {
  const company = await prisma.company.create({
    data: { name: `Z-report fixture ${stamp}`, slug: `zreport-fixture-${stamp}` },
    select: { id: true },
  });
  companyId = company.id;

  const site = await prisma.site.create({
    data: { companyId, name: "Borrowdale bottle store", code: `ZBS-${stamp}` },
    select: { id: true },
  });
  siteId = site.id;

  const user = await prisma.user.create({
    data: {
      companyId,
      email: `zreport-${stamp}@example.invalid`,
      name: "Rudo Marimo",
      role: "SHOP_MANAGER",
    },
    select: { id: true },
  });
  userId = user.id;

  /* Faith: opens on $150, takes $120 cash and $40 on the card, banks $100. */
  const faith = await prisma.retailShift.create({
    data: {
      companyId,
      shiftNo: `ZS-${stamp}-A`,
      registerCode: REGISTER,
      registerName: "Till 01",
      siteId,
      cashierId: userId,
      cashierName: "Faith Moyo",
      openingFloat: "150.00",
      status: "CLOSED",
      openedAt: new Date(`${FRIDAY}T07:30:00.000Z`),
      closedAt: new Date(`${FRIDAY}T14:00:00.000Z`),
      expectedCash: "170.00",
      countedCash: "170.00",
      variance: "0.00",
    },
    select: { id: true },
  });

  /* Tendai: opens on $100, takes $60 cash, pays a supplier $25. */
  const tendai = await prisma.retailShift.create({
    data: {
      companyId,
      shiftNo: `ZS-${stamp}-B`,
      registerCode: REGISTER,
      registerName: "Till 01",
      siteId,
      cashierId: userId,
      cashierName: "Tendai Chikwava",
      openingFloat: "100.00",
      status: "CLOSED",
      openedAt: new Date(`${FRIDAY}T14:00:00.000Z`),
      closedAt: new Date(`${FRIDAY}T20:00:00.000Z`),
      expectedCash: "135.00",
      countedCash: "135.00",
      variance: "0.00",
    },
    select: { id: true },
  });

  // 15% VAT-inclusive, carved out: $120.00 on the shelf is $104.35 + $15.65.
  const sales: Array<{
    shiftId: string;
    saleNo: string;
    total: string;
    tax: string;
    discount: string;
    tender: "CASH" | "CARD";
    change: string;
    tendered: string;
  }> = [
    {
      shiftId: faith.id,
      saleNo: `ZR-${stamp}-1`,
      total: "120.00",
      tax: "15.65",
      discount: "0.00",
      tender: "CASH",
      tendered: "120.00",
      change: "0.00",
    },
    {
      shiftId: faith.id,
      saleNo: `ZR-${stamp}-2`,
      total: "40.00",
      tax: "5.22",
      discount: "0.00",
      tender: "CARD",
      tendered: "40.00",
      change: "0.00",
    },
    {
      shiftId: tendai.id,
      saleNo: `ZR-${stamp}-3`,
      total: "48.30",
      tax: "6.30",
      discount: "0.00",
      tender: "CASH",
      // A $50 note against a $48.30 basket: $1.70 goes back, and the cash row
      // has to report $48.30 rather than the $50 that crossed the counter.
      tendered: "50.00",
      change: "1.70",
    },
    {
      shiftId: tendai.id,
      saleNo: `ZR-${stamp}-4`,
      total: "11.70",
      tax: "1.53",
      discount: "1.30",
      tender: "CASH",
      tendered: "11.70",
      change: "0.00",
    },
  ];

  for (const sale of sales) {
    await prisma.retailSale.create({
      data: {
        companyId,
        saleNo: sale.saleNo,
        shiftId: sale.shiftId,
        siteId,
        cashierId: userId,
        cashierName: "Faith Moyo",
        saleType: "SALE",
        // Written for completeness and deliberately never read by the report —
        // see `lib/retail/z-report.ts` on the refund path recording it in the
        // other basis.
        subtotal: "0.00",
        discountAmount: sale.discount,
        taxAmount: sale.tax,
        totalAmount: sale.total,
        tenderedAmount: sale.tendered,
        changeAmount: sale.change,
        currency: "USD",
        exchangeRate: "1",
        baseAmount: sale.total,
        status: "POSTED",
        postedAt: new Date(`${FRIDAY}T12:00:00.000Z`),
        payments: {
          create: [
            {
              companyId,
              tenderType: sale.tender,
              amount: sale.tendered,
              currency: "USD",
              exchangeRate: "1",
              baseAmount: sale.tendered,
            },
          ],
        },
      },
    });
  }

  await prisma.retailCashMovement.createMany({
    data: [
      {
        companyId,
        shiftId: faith.id,
        type: "DROP_TO_SAFE",
        amount: "100.00",
        currency: "USD",
        exchangeRate: "1",
        baseAmount: "100.00",
        reasonCode: "BANK_DEPOSIT",
        recordedById: userId,
        recordedByName: "Rudo Marimo",
      },
      {
        companyId,
        shiftId: tendai.id,
        type: "PAYOUT",
        amount: "25.00",
        currency: "USD",
        exchangeRate: "1",
        baseAmount: "25.00",
        reasonCode: "SUPPLIER_PAYOUT",
        recordedById: userId,
        recordedByName: "Rudo Marimo",
      },
    ],
  });
}, 120_000);

afterAll(async () => {
  if (!companyId) return;
  await prisma.retailZReport.deleteMany({ where: { companyId } });
  await prisma.retailCashMovement.deleteMany({ where: { companyId } });
  await prisma.retailSalePayment.deleteMany({ where: { companyId } });
  await prisma.retailSale.deleteMany({ where: { companyId } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
}, 120_000);

describe("one register, one trading day, one report", () => {
  it("writes it the first time and hands the same row back the second", async () => {
    const first = await generateRetailZReportTransaction({
      actor: actor(),
      registerCode: REGISTER,
      businessDate: FRIDAY,
    });
    expect(first.created).toBe(true);
    expect(first.report.reportNo).toBe(buildRetailZReportNo(REGISTER, FRIDAY));

    const second = await generateRetailZReportTransaction({
      actor: actor(),
      registerCode: REGISTER,
      businessDate: FRIDAY,
    });
    // Not a new document, not an error — the one that already exists.
    expect(second.created).toBe(false);
    expect(second.report.id).toBe(first.report.id);
    expect(second.report.reportNo).toBe(first.report.reportNo);
    expect(second.report.generatedAt.toISOString()).toBe(
      first.report.generatedAt.toISOString(),
    );

    const rows = await prisma.retailZReport.count({
      where: { companyId, registerCode: REGISTER },
    });
    expect(rows).toBe(1);
  }, 120_000);

  /**
   * The rule with the short-circuit taken out of the picture. The first ask above
   * has already written the row, so the pre-read would return it — this asks the
   * database directly whether it would have accepted a second insert.
   *
   * That distinction matters: the pre-read is an optimisation and the constraint
   * is the rule, and only one of them survives two managers pressing the button in
   * the same second.
   */
  it("is the database refusing, not the handler checking first", async () => {
    const existing = await prisma.retailZReport.findFirstOrThrow({
      where: { companyId, registerCode: REGISTER },
    });

    await expect(
      prisma.retailZReport.create({
        data: {
          companyId,
          reportNo: `${existing.reportNo}-DUPLICATE`,
          businessDate: existing.businessDate,
          registerCode: existing.registerCode,
          registerName: existing.registerName,
          siteId,
          currency: "USD",
          tenderBreakdown: [],
          topItems: [],
          cashMovements: [],
          shifts: [],
        },
      }),
    ).rejects.toThrow(/Unique constraint/i);
  }, 120_000);

  /**
   * A reprint is a read, so it has to be a read. Nothing in the fetch path
   * recomputes, which is what makes the guarantee true rather than merely likely.
   */
  it("does not restate itself when the day's rows change underneath it", async () => {
    const before = await prisma.retailZReport.findFirstOrThrow({
      where: { companyId, registerCode: REGISTER },
    });

    // A sale is cancelled after the day was closed. On a live query this would
    // move every figure; on a filed document it must move none of them.
    await prisma.retailSale.updateMany({
      where: { companyId, saleNo: `ZR-${stamp}-2` },
      data: { status: "VOIDED" },
    });

    const after = await generateRetailZReportTransaction({
      actor: actor(),
      registerCode: REGISTER,
      businessDate: FRIDAY,
    });
    expect(after.created).toBe(false);
    expect(after.report.grossTakings.toFixed(2)).toBe(before.grossTakings.toFixed(2));
    expect(after.report.taxTotal.toFixed(2)).toBe(before.taxTotal.toFixed(2));
    expect(after.report.tenderBreakdown).toEqual(before.tenderBreakdown);
  }, 120_000);
});

describe("what the persisted day says", () => {
  /**
   * The figures, worked by hand against the fixture above. `z-report.test.ts`
   * proves the arithmetic; this proves it survived the round trip through
   * `Decimal(14,2)` and `jsonb` unchanged.
   */
  it("takes 220.00 across the counter at 15% inclusive", async () => {
    const report = await prisma.retailZReport.findFirstOrThrow({
      where: { companyId, registerCode: REGISTER },
    });

    // 120.00 + 40.00 + 48.30 + 11.70
    expect(report.grossTakings.toFixed(2)).toBe("220.00");
    // 15.65 + 5.22 + 6.30 + 1.53
    expect(report.taxTotal.toFixed(2)).toBe("28.70");
    expect(report.netSales.toFixed(2)).toBe("191.30");
    expect(report.discountTotal.toFixed(2)).toBe("1.30");
    expect(report.grossSales.toFixed(2)).toBe("192.60");
    // 28.70 ÷ 191.30 = 15.0026…%, which is 15.00 at two places. Not 14.50.
    expect(report.taxRatePercent.toFixed(2)).toBe("15.00");
    expect(report.saleCount).toBe(4);
    expect(report.shiftCount).toBe(2);
  }, 120_000);

  it("nets the $1.70 change out of the cash row", async () => {
    const report = await prisma.retailZReport.findFirstOrThrow({
      where: { companyId, registerCode: REGISTER },
    });
    const tenders = report.tenderBreakdown as Array<{
      tenderType: string;
      amount: string;
      share: string;
      count: number;
    }>;

    // 120.00 + 50.00 + 11.70 tendered, less 1.70 handed back = 180.00.
    const cash = tenders.find((row) => row.tenderType === "CASH");
    expect(cash?.amount).toBe("180.00");
    expect(cash?.count).toBe(3);
    expect(report.cashTakings.toFixed(2)).toBe("180.00");

    // And the table reconciles to the day.
    expect(tenders.reduce((sum, row) => sum + Number(row.amount), 0).toFixed(2)).toBe(
      "220.00",
    );
    expect(tenders.reduce((sum, row) => sum + Number(row.share), 0).toFixed(2)).toBe(
      "100.00",
    );
  }, 120_000);

  it("takes the drop and the payout off the drawer", async () => {
    const report = await prisma.retailZReport.findFirstOrThrow({
      where: { companyId, registerCode: REGISTER },
    });

    //   250.00 float
    // + 180.00 cash takings
    // − 100.00 banked
    // −  25.00 paid to the supplier
    // = 305.00
    expect(report.openingFloat.toFixed(2)).toBe("250.00");
    expect(report.cashDropTotal.toFixed(2)).toBe("100.00");
    expect(report.cashPayoutTotal.toFixed(2)).toBe("25.00");
    expect(report.cashMovementNet.toFixed(2)).toBe("-125.00");
    expect(report.expectedCash.toFixed(2)).toBe("305.00");

    // The two drawers were counted at 170.00 and 135.00, which is the same 305.00
    // — so the day balances, and it only balances because the movements are in it.
    expect(report.countedCash.toFixed(2)).toBe("305.00");
    expect(report.cashVariance.toFixed(2)).toBe("0.00");
  }, 120_000);
});
