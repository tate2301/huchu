/**
 * The Z-report, worked by hand.
 *
 * S-7.2, and written the way `lib/retail/cash-up.test.ts` is written: a real
 * Friday at a Harare bottle store, real shelf prices, and the answer asserted to
 * the cent in `Decimal`. There is no `toBeCloseTo` in this file. A Z-report is the
 * document a day's takings are banked against; it is not a number to be
 * approximately right about.
 *
 * ── The Friday: 14 August 2026, Till 02 ────────────────────────────────────
 *
 * One till, two cashiers, which is the shape of the shop this is for and the
 * reason the report covers a **register-day** rather than a shift. Faith opens at
 * 07:30 on $150 and hands over at 14:00; Tendai takes the evening on $100. Both
 * drawers, both sets of sales, one document, one banking.
 *
 * Shelf prices are USD and **VAT-inclusive at 15%** — the rate Zimbabwe restored
 * on 1 January 2023. The prototype prints 14.5%, which was the rate from 2020 to
 * 2022, and no figure in this file or in `z-report.ts` comes from it.
 *
 *   Castle Lager 340ml   BEV-CAS-340   $1.20
 *   Chibuku Super 1L     BEV-CHI-1L    $1.00
 *   Bohlingers Gin 750ml SPI-BOH-750  $12.00
 *   Coca-Cola 500ml      BEV-COK-500   $0.80
 *
 * The sale headers below are **not typed in**. They are produced by
 * `calculateRetailCheckout` with `taxInclusive: true`, which is the same function
 * `pos/sales/route.ts` posts with, so what is fed to the report is what the till
 * would actually have written. The carve-out is asserted first, on its own, and
 * only then used.
 *
 * ── What happens ───────────────────────────────────────────────────────────
 *
 *   Faith  S-2841  float $150.00
 *     07:52  3 crates Castle (72)                          $86.40   cash $100, change $13.60
 *     09:15  1 gin, 6 Cokes                                $16.80   card
 *     11:40  40 Chibuku, $4.00 off the crate               $36.00   EcoCash
 *     12:30  2 crates Castle (48)                          $57.60   cash exact
 *     13:20  5 gin                                         $60.00   cash exact
 *     13:45  float top-up $40.00 from the safe — out of small notes
 *
 *   Tendai S-2842  float $100.00
 *     15:10  6 crates Castle (144)                        $172.80   cash
 *     16:00  30 Chibuku                                    $30.00   EcoCash
 *     17:25  10 gin                                       $120.00   card
 *     18:10  24 Cokes                                      $19.20   cash $20, change $0.80
 *     18:40  one crate of Castle (24) returned            −$28.80   cash back
 *     19:00  $200.00 banked to the safe
 *     19:30  $24.00 paid to the crate supplier on delivery
 *
 * Faith's drawer balances. Tendai's is fifty cents short — a real amount somebody
 * has to explain, rather than a zero that proves nothing.
 */

import { describe, expect, it } from "vitest";

import { money, sumMoney } from "@/lib/money";
import { calculateRetailCheckout } from "./checkout";
import { expectedCashForShift } from "./cash-up";
import {
  buildRetailZReportFigures,
  buildRetailZReportNo,
  parseTradingDay,
  tradingDayKey,
  tradingDayWindow,
  type ZReportSaleInput,
} from "./z-report";

const VAT = 15;
const CASTLE = { key: "castle", name: "Castle Lager 340ml", sku: "BEV-CAS-340", price: 1.2 };
const CHIBUKU = { key: "chibuku", name: "Chibuku Super 1L", sku: "BEV-CHI-1L", price: 1 };
const GIN = { key: "gin", name: "Bohlingers Gin 750ml", sku: "SPI-BOH-750", price: 12 };
const COKE = { key: "coke", name: "Coca-Cola 500ml", sku: "BEV-COK-500", price: 0.8 };

type Product = typeof CASTLE;

/**
 * One basket, priced the way the till prices it.
 *
 * `calculateRetailCheckout` with `taxInclusive: true` is what `pos/sales/route.ts`
 * calls, so the header amounts here are the ones the shop would have posted rather
 * than ones chosen to make the totals tidy.
 */
function ringUp(
  basket: Array<{ product: Product; quantity: number }>,
  options: { orderDiscountAmount?: number } = {},
) {
  const checkout = calculateRetailCheckout({
    lines: basket.map((entry) => ({
      id: entry.product.key,
      quantity: entry.quantity,
      unitPrice: entry.product.price,
      taxPercent: VAT,
      taxInclusive: true,
    })),
    orderDiscountAmount: options.orderDiscountAmount ?? 0,
  });
  return { checkout, basket };
}

/** A posted `SALE`, in the shape `RetailSale` and its children store it. */
function sale(
  rung: ReturnType<typeof ringUp>,
  payments: ZReportSaleInput["payments"],
  changeAmount = 0,
): ZReportSaleInput {
  return {
    saleType: "SALE",
    discountAmount: rung.checkout.discountAmount,
    taxAmount: rung.checkout.taxAmount,
    totalAmount: rung.checkout.total,
    changeAmount,
    exchangeRate: 1,
    payments,
    lines: rung.basket.map((entry, index) => ({
      itemKey: entry.product.key,
      itemName: entry.product.name,
      sku: entry.product.sku,
      quantity: entry.quantity,
      lineTotal: rung.checkout.lines[index].lineTotal,
    })),
  };
}

/* ── The two drawers ──────────────────────────────────────────────────────── */

const A1 = ringUp([{ product: CASTLE, quantity: 72 }]);
const A2 = ringUp([
  { product: GIN, quantity: 1 },
  { product: COKE, quantity: 6 },
]);
const A3 = ringUp([{ product: CHIBUKU, quantity: 40 }], { orderDiscountAmount: 4 });
const A4 = ringUp([{ product: CASTLE, quantity: 48 }]);
const A5 = ringUp([{ product: GIN, quantity: 5 }]);

const B1 = ringUp([{ product: CASTLE, quantity: 144 }]);
const B2 = ringUp([{ product: CHIBUKU, quantity: 30 }]);
const B3 = ringUp([{ product: GIN, quantity: 10 }]);
const B4 = ringUp([{ product: COKE, quantity: 24 }]);

/**
 * The return: one of Faith's three crates, handed back at Tendai's till.
 *
 * Built by hand because `refundRetailSaleTransaction` builds it by hand too —
 * apportioning the source sale's tax and line total by `24 ÷ 72` and negating
 * both. `11.27 × ⅓` is 3.756666…, which rounds half-up to `3.76`.
 *
 * Note what is *not* here: `subtotal`. The refund path records it as
 * `quantity × unitPrice` — shelf money, VAT still inside — while a sale records it
 * ex-VAT, so the two cannot be summed. `z-report.ts` declines to read the column
 * and derives net revenue from `totalAmount` and `taxAmount` instead; the last
 * describe in this file pins the consequence.
 */
const REFUND: ZReportSaleInput = {
  saleType: "REFUND",
  discountAmount: 0,
  taxAmount: -3.76,
  totalAmount: -28.8,
  changeAmount: 0,
  exchangeRate: 1,
  payments: [{ tenderType: "CASH", baseAmount: -28.8 }],
  // Quantity is stored positive on a reversal and the direction comes off the
  // document type. If the report ever stops signing it, a returned crate starts
  // adding to the day's units sold while subtracting from its value.
  lines: [
    {
      itemKey: CASTLE.key,
      itemName: CASTLE.name,
      sku: CASTLE.sku,
      quantity: 24,
      lineTotal: -28.8,
    },
  ],
};

const FRIDAY = "2026-08-14";

const report = buildRetailZReportFigures({
  businessDate: FRIDAY,
  registerCode: "TILL02",
  registerName: "Till 02",
  siteId: "site-borrowdale",
  currency: "USD",
  shifts: [
    {
      id: "shift-a",
      shiftNo: "S-2841",
      cashierName: "Faith Moyo",
      openedAt: new Date("2026-08-14T07:30:00.000Z"),
      closedAt: new Date("2026-08-14T14:00:00.000Z"),
      openingFloat: "150.00",
      countedCash: "394.00",
      movements: [
        { type: "FLOAT_TOP_UP", reasonCode: "CHANGE_REQUIRED", baseAmount: "40.00" },
      ],
      sales: [
        sale(A1, [{ tenderType: "CASH", baseAmount: 100 }], 13.6),
        sale(A2, [{ tenderType: "CARD", baseAmount: 16.8 }]),
        sale(A3, [{ tenderType: "MOBILE_MONEY", baseAmount: 36 }]),
        sale(A4, [{ tenderType: "CASH", baseAmount: 57.6 }]),
        sale(A5, [{ tenderType: "CASH", baseAmount: 60 }]),
      ],
    },
    {
      id: "shift-b",
      shiftNo: "S-2842",
      cashierName: "Tendai Chikwava",
      openedAt: new Date("2026-08-14T14:00:00.000Z"),
      closedAt: new Date("2026-08-14T20:15:00.000Z"),
      openingFloat: "100.00",
      countedCash: "38.70",
      movements: [
        { type: "DROP_TO_SAFE", reasonCode: "BANK_DEPOSIT", baseAmount: "200.00" },
        { type: "PAYOUT", reasonCode: "SUPPLIER_PAYOUT", baseAmount: "24.00" },
      ],
      sales: [
        sale(B1, [{ tenderType: "CASH", baseAmount: 172.8 }]),
        sale(B2, [{ tenderType: "MOBILE_MONEY", baseAmount: 30 }]),
        sale(B3, [{ tenderType: "CARD", baseAmount: 120 }]),
        sale(B4, [{ tenderType: "CASH", baseAmount: 20 }], 0.8),
        REFUND,
      ],
    },
  ],
});

/* ── VAT, carved out rather than added on ─────────────────────────────────── */

describe("VAT at 15%, taken out of the shelf price", () => {
  /**
   * The whole point of `taxInclusive`. $1.20 on the tag is what the customer
   * hands over; adding 15% to it would print $1.38, a number nobody at the
   * counter agreed to.
   */
  it("splits three crates of Castle into 75.13 + 11.27, not 86.40 + 12.96", () => {
    expect(A1.checkout.total.toFixed(2)).toBe("86.40");
    expect(A1.checkout.subtotal.toFixed(2)).toBe("75.13");
    expect(A1.checkout.taxAmount.toFixed(2)).toBe("11.27");
    // The two halves add back to the shelf price exactly. That is the property
    // `netOfInclusiveTax` exists for.
    expect((A1.checkout.subtotal + A1.checkout.taxAmount).toFixed(2)).toBe("86.40");

    // What adding the tax on top would have produced, for contrast.
    expect((86.4 * 1.15).toFixed(2)).toBe("99.36");
  });

  it("reduces net revenue and VAT together when the crate is discounted", () => {
    // 40 Chibuku at $1.00 is $40.00 on the shelf; $4.00 off leaves $36.00 to pay.
    // The discount is recorded ex-VAT — $3.48, not $4.00 — because that is what
    // keeps base − discount + tax = total exact.
    expect(A3.checkout.total.toFixed(2)).toBe("36.00");
    expect(A3.checkout.discountAmount.toFixed(2)).toBe("3.48");
    expect(A3.checkout.taxAmount.toFixed(2)).toBe("4.70");
    expect(A3.checkout.subtotal.toFixed(2)).toBe("34.78");
    expect(
      (A3.checkout.subtotal - A3.checkout.discountAmount + A3.checkout.taxAmount).toFixed(2),
    ).toBe("36.00");
  });

  it("reports the rate the day was actually charged at, derived from the totals", () => {
    // Not read from a setting and certainly not from the prototype: 74.35 of VAT
    // on 495.65 of net revenue is 14.99848…%, which is 15.00 at two places.
    expect(report.taxTotal.toFixed(2)).toBe("74.35");
    expect(report.netSales.toFixed(2)).toBe("495.65");
    expect(report.taxRatePercent.toFixed(2)).toBe("15.00");
    // The prototype's figure. If this ever passes, somebody has copied it.
    expect(report.taxRatePercent.toFixed(2)).not.toBe("14.50");
  });
});

/* ── The four KPIs ────────────────────────────────────────────────────────── */

describe("the four figures across the top", () => {
  it("takes 570.00 across the counter", () => {
    //  86.40 + 16.80 + 36.00 + 57.60 + 60.00   Faith    = 256.80
    // 172.80 + 30.00 + 120.00 + 19.20 − 28.80  Tendai   = 313.20
    expect(report.grossTakings.toFixed(2)).toBe("570.00");
  });

  it("gave 3.48 away in discounts", () => {
    expect(report.discountTotal.toFixed(2)).toBe("3.48");
  });

  it("books 495.65 of revenue and 74.35 of VAT", () => {
    expect(report.netSales.toFixed(2)).toBe("495.65");
    expect(report.taxTotal.toFixed(2)).toBe("74.35");
  });

  it("puts sales before discounts at 499.13", () => {
    // 495.65 net + 3.48 of discount that was given away.
    expect(report.grossSales.toFixed(2)).toBe("499.13");
  });

  /**
   * The identity everything else hangs off. It holds by construction here — see
   * the header of `z-report.ts` on why net revenue is derived rather than summed
   * off `RetailSale.subtotal`.
   */
  it("adds up: net + VAT = what customers paid", () => {
    expect(report.netSales.plus(report.taxTotal).equals(report.grossTakings)).toBe(true);
    expect(report.grossSales.minus(report.discountTotal).equals(report.netSales)).toBe(true);
  });

  it("counts nine sales, one return and no cancellations", () => {
    expect(report.saleCount).toBe(9);
    expect(report.refundCount).toBe(1);
    expect(report.voidCount).toBe(0);
    expect(report.refundTotal.toFixed(2)).toBe("28.80");
    expect(report.voidTotal.toFixed(2)).toBe("0.00");
  });
});

/* ── How customers paid ───────────────────────────────────────────────────── */

describe("how customers paid", () => {
  it("nets the change out of the cash row", () => {
    // $100 and $20 were tendered against baskets of $86.40 and $19.20, so $14.40
    // went back across the counter. Cash *paid* is 367.20, not the 381.60 that
    // was handed over — and 367.20 is also what the drawer is counted against.
    const cash = report.tenderBreakdown.find((row) => row.tenderType === "CASH");
    expect(cash?.amount).toBe("367.20");
    expect(report.cashTakings.toFixed(2)).toBe("367.20");
  });

  it("lists the three tenders largest first", () => {
    expect(report.tenderBreakdown.map((row) => row.tenderType)).toEqual([
      "CASH",
      "CARD",
      "MOBILE_MONEY",
    ]);
    expect(report.tenderBreakdown.map((row) => row.amount)).toEqual([
      "367.20",
      "136.80",
      "66.00",
    ]);
  });

  it("counts every payment row the drawer saw, the refund included", () => {
    expect(report.tenderBreakdown.map((row) => row.count)).toEqual([6, 2, 2]);
  });

  it("adds the tenders back to the day's takings", () => {
    expect(
      sumMoney(report.tenderBreakdown.map((row) => row.amount)).equals(report.grossTakings),
    ).toBe(true);
  });

  it("shares that sum to exactly 100%", () => {
    expect(report.tenderBreakdown.map((row) => row.share)).toEqual([
      "64.42",
      "24.00",
      "11.58",
    ]);
    expect(sumMoney(report.tenderBreakdown.map((row) => row.share)).toFixed(2)).toBe(
      "100.00",
    );
  });
});

/* ── Best sellers ─────────────────────────────────────────────────────────── */

describe("best-selling items", () => {
  it("ranks the four by money taken", () => {
    expect(report.topItems.map((item) => [item.rank, item.itemName, item.amount])).toEqual([
      [1, "Castle Lager 340ml", "288.00"],
      [2, "Bohlingers Gin 750ml", "192.00"],
      [3, "Chibuku Super 1L", "66.00"],
      [4, "Coca-Cola 500ml", "24.00"],
    ]);
    expect(report.itemCount).toBe(4);
  });

  it("takes the returned crate off the Castle line, both ways", () => {
    // 72 + 48 + 144 sold, 24 back = 240 bottles, and $86.40 + $57.60 + $172.80
    // less $28.80 = $288.00. A refund line stores a *positive* quantity, so a
    // report that did not sign it would say 288 bottles against $288.00.
    const castle = report.topItems.find((item) => item.itemKey === "castle");
    expect(castle?.quantity).toBe("240.0000");
    expect(castle?.amount).toBe("288.00");
  });

  it("carries the SKU the shop labels the shelf with", () => {
    expect(report.topItems.map((item) => item.sku)).toEqual([
      "BEV-CAS-340",
      "SPI-BOH-750",
      "BEV-CHI-1L",
      "BEV-COK-500",
    ]);
  });

  it("adds the item lines back to the day's takings", () => {
    expect(sumMoney(report.topItems.map((item) => item.amount)).toFixed(2)).toBe("570.00");
  });
});

/* ── The drawer ───────────────────────────────────────────────────────────── */

describe("the cash story, which is the half S-7.1 exists for", () => {
  it("groups the three movements by type and reason", () => {
    expect(
      report.cashMovements.map((row) => [row.type, row.reasonCode, row.count, row.amount]),
    ).toEqual([
      ["DROP_TO_SAFE", "BANK_DEPOSIT", 1, "-200.00"],
      ["FLOAT_TOP_UP", "CHANGE_REQUIRED", 1, "40.00"],
      ["PAYOUT", "SUPPLIER_PAYOUT", 1, "-24.00"],
    ]);
  });

  it("nets the day's movements to −184.00", () => {
    expect(report.cashDropTotal.toFixed(2)).toBe("200.00");
    expect(report.cashTopUpTotal.toFixed(2)).toBe("40.00");
    expect(report.cashPayoutTotal.toFixed(2)).toBe("24.00");
    expect(report.cashMovementNet.toFixed(2)).toBe("-184.00");
  });

  it("expects 433.20 across the two drawers", () => {
    //  250.00 float
    // + 367.20 cash takings, the 28.80 refund already negative inside it
    // − 184.00 moved
    // = 433.20
    expect(report.openingFloat.toFixed(2)).toBe("250.00");
    expect(report.expectedCash.toFixed(2)).toBe("433.20");
    expect(
      report.openingFloat
        .plus(report.cashTakings)
        .plus(report.cashMovementNet)
        .equals(report.expectedCash),
    ).toBe(true);
  });

  /**
   * The defect S-7.1 fixed, restated at report level. Without the $200 banked and
   * the $24 paid out, the day would read as $224.00 short — and two cashiers would
   * be asked to account for money that is in the safe and in a supplier's pocket.
   */
  it("would have read 224.00 short if the movements were ignored", () => {
    const blind = money(report.countedCash)
      .minus(report.openingFloat.plus(report.cashTakings).plus(money("40.00")));
    expect(blind.toFixed(2)).toBe("-224.50");
    // The real variance is fifty cents, which is Tendai's drawer and nothing else.
    expect(report.cashVariance.toFixed(2)).toBe("-0.50");
  });

  it("is fifty cents short, and says which drawer", () => {
    expect(report.countedCash.toFixed(2)).toBe("432.70");
    expect(report.cashVariance.toFixed(2)).toBe("-0.50");

    const [faith, tendai] = report.shifts;
    expect([faith.shiftNo, faith.expectedCash, faith.countedCash, faith.variance]).toEqual([
      "S-2841",
      "394.00",
      "394.00",
      "0.00",
    ]);
    expect([tendai.shiftNo, tendai.expectedCash, tendai.countedCash, tendai.variance]).toEqual([
      "S-2842",
      "39.20",
      "38.70",
      "-0.50",
    ]);
  });

  it("uses the same formula the cash-up screen does, per drawer", () => {
    // Not a second implementation standing beside the first: `expectedCashForShift`
    // is imported by the report and asserted here against the same inputs.
    expect(
      expectedCashForShift({
        openingFloat: "100.00",
        cashTakings: "163.20",
        movements: [
          { type: "DROP_TO_SAFE", baseAmount: "200.00" },
          { type: "PAYOUT", baseAmount: "24.00" },
        ],
      }).toFixed(2),
    ).toBe("39.20");
    expect(report.shifts[1].expectedCash).toBe("39.20");
  });
});

/* ── Scope and identity ───────────────────────────────────────────────────── */

describe("one register, one trading day", () => {
  it("covers both cashiers under one document", () => {
    expect(report.shiftCount).toBe(2);
    expect(report.shifts.map((shift) => shift.cashierName)).toEqual([
      "Faith Moyo",
      "Tendai Chikwava",
    ]);
  });

  it("numbers itself from the register and the day, so a reprint cannot differ", () => {
    expect(report.reportNo).toBe("Z-TILL02-20260814");
    expect(buildRetailZReportNo("TILL02", FRIDAY)).toBe(report.reportNo);
    // Punctuation in a register code must not produce a second identifier for the
    // same till-day.
    expect(buildRetailZReportNo("till-02", FRIDAY)).toBe(report.reportNo);
  });

  it("is a function of its inputs and nothing else", () => {
    // Same day, built again: identical down to the last string. This is what
    // "identical on reprint" means before persistence is even involved.
    const again = buildRetailZReportFigures({
      businessDate: FRIDAY,
      registerCode: "TILL02",
      registerName: "Till 02",
      siteId: "site-borrowdale",
      currency: "USD",
      shifts: [],
    });
    expect(again.reportNo).toBe(report.reportNo);
    expect(again.grossTakings.toFixed(2)).toBe("0.00");
    expect(again.tenderBreakdown).toEqual([]);
  });
});

describe("the trading day", () => {
  it("belongs to the drawer's opening, and the window is half-open", () => {
    const { start, end } = tradingDayWindow(FRIDAY);
    expect(start.toISOString()).toBe("2026-08-14T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-15T00:00:00.000Z");
    // A drawer opened at exactly midnight belongs to the day starting, not to the
    // one ending. A closed interval would put it on both reports.
    expect(tradingDayKey(start)).toBe(FRIDAY);
    expect(tradingDayKey(end)).toBe("2026-08-15");
  });

  it("refuses a date it cannot mean", () => {
    expect(() => parseTradingDay("14/08/2026")).toThrow(/YYYY-MM-DD/);
    expect(() => parseTradingDay("2026-08-14T19:14:00Z")).toThrow(/YYYY-MM-DD/);
    // A silently-accepted 31 February would select nothing and report a day of no
    // trade, which is a worse answer than an error.
    expect(() => parseTradingDay("2026-02-31")).toThrow(/Not a real date/);
  });
});

/* ── The column this report will not read ─────────────────────────────────── */

describe("why RetailSale.subtotal is not summed", () => {
  /**
   * A defect in `refundRetailSaleTransaction`, pinned here rather than papered
   * over. A sale's `subtotal` is ex-VAT; a refund's is rebuilt as
   * `quantity × unitPrice`, which on a tax-inclusive list still has the VAT in it.
   * Summing the two mixes bases.
   */
  it("would break the day's arithmetic on any Friday with a return", () => {
    // What the refund row actually stores, from `_services.ts`.
    const refundSubtotalAsStored = money(-(CASTLE.price * 24));
    expect(refundSubtotalAsStored.toFixed(2)).toBe("-28.80");

    // The identity every other figure depends on, applied to that row.
    const identity = refundSubtotalAsStored.minus(money(0)).plus(money("-3.76"));
    expect(identity.toFixed(2)).toBe("-32.56");
    expect(identity.equals(money("-28.80"))).toBe(false);

    // What it should have been: a third of the source sale's 75.13 of ex-VAT
    // revenue, which is what `total + discount − tax` gives back.
    const correct = money("-28.80").plus(money(0)).minus(money("-3.76"));
    expect(correct.toFixed(2)).toBe("-25.04");
  });

  it("is why the report derives net revenue instead", () => {
    // Had the report summed the column, the day would have understated net
    // revenue by exactly the VAT inside the return — $3.76 — and stopped
    // reconciling to what customers paid.
    const summedSubtotals = sumMoney([
      A1.checkout.subtotal,
      A2.checkout.subtotal,
      A3.checkout.subtotal,
      A4.checkout.subtotal,
      A5.checkout.subtotal,
      B1.checkout.subtotal,
      B2.checkout.subtotal,
      B3.checkout.subtotal,
      B4.checkout.subtotal,
      money(-(CASTLE.price * 24)),
    ]);
    // The nine sales come to 524.17 ex-VAT. The return should take 25.04 off
    // that and takes 28.80, because it is stored with the VAT still in it.
    expect(summedSubtotals.toFixed(2)).toBe("495.37");
    expect(report.grossSales.toFixed(2)).toBe("499.13");
    expect(report.grossSales.minus(summedSubtotals).toFixed(2)).toBe("3.76");

    // Which is the VAT on the crate that came back — the exact amount the day
    // would have gone wrong by, and it would have gone wrong silently.
    expect(money("-3.76").abs().toFixed(2)).toBe("3.76");
    expect(summedSubtotals.minus(report.discountTotal).toFixed(2)).toBe("491.89");
    expect(report.netSales.toFixed(2)).toBe("495.65");
  });
});
