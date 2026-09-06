/**
 * The Z-report: one register's trading day, closed and frozen.
 *
 * S-7.2, and it depends on S-7.1 for the same reason cash-up did — a day's cash
 * story that ignores the $200 the manager banked at four o'clock reads as a
 * shortfall of exactly $200. `expectedCashForShift` and `sumCashMovementDeltas`
 * are imported rather than re-derived here so there is one formula in the module,
 * not two that agree until they do not.
 *
 * ── What a Z-report is, and what it is not ─────────────────────────────────
 *
 * A **Z-report** is the fiscal close of one register for one trading day: it is
 * taken once, it is final, and the day's takings are banked against it. An
 * **X-report** is the mid-shift read — as many as you like, changes every time,
 * proves nothing. This module builds the first.
 *
 * `docs/design-system/portals/pos.html` is contradictory about the scope and it
 * has to be resolved rather than copied. Its header says "end-of-day summary",
 * its body names one shift (`Shift S-2841 · Till 02 · Faith Moyo`), and the
 * cashier's own screen says elsewhere that "the Z-report shows totals for the
 * whole shop". Three different documents.
 *
 * The scope here is **per register, per trading day** — every shift rung on that
 * register that day, and their sales, movements and counts together. Reasons, in
 * order of weight:
 *
 *  1. That is the fiscal convention and what `docs/retail/retail-stock-consolidation-plan-2026-08-13.md`
 *     §1.6 asks for in as many words. A register is the unit a fiscal device
 *     attaches to; the day is the period it closes over.
 *  2. A Harare bottle store runs two cashiers over one till. Faith 07:30–14:00,
 *     Tendai 14:00–20:00 is *two shifts and one banking*. Per shift would split
 *     the day's takings across two documents and reconcile neither against the
 *     deposit slip. The prototype names one shift because its demo has one open;
 *     that is a fixture, not a decision.
 *  3. Whole-shop is the wrong unit for the *document* even though it is the right
 *     unit for a dashboard: a variance belongs to a drawer, and a shop with a
 *     second till would have to unpick a combined report to find out which one
 *     was short. With one till — this shop — the register report and the shop
 *     report are the same numbers anyway, so nothing is lost by being precise.
 *
 * ── The trading day ────────────────────────────────────────────────────────
 *
 * **A shift belongs to the day its drawer was opened.** Not the day each sale was
 * posted: a sale rung at 00:15 against a drawer opened at 19:00 belongs to that
 * drawer's day, and a `postedAt BETWEEN` window would put it on tomorrow's report
 * while its cash sat in last night's till. The drawer is the unit, so the drawer's
 * opening decides.
 *
 * The calendar date is read in UTC, and that is a real limitation rather than an
 * oversight: this repository has no per-company timezone anywhere — `Company`
 * carries none, and neither does `Site`. Harare is UTC+2 with no DST, so UTC and
 * local disagree only for a drawer opened between midnight and 02:00, which a shop
 * trading on a liquor licence does not do. `tradingDayKey` is the one function
 * that decides this, and it is where a company timezone plugs in when the platform
 * grows one.
 *
 * ── VAT is summed, never applied ───────────────────────────────────────────
 *
 * The prototype prints "VAT 14.5%". That was Zimbabwe's rate between 2020 and
 * 2022; it went back to 15% on 1 January 2023. The prototype is a build contract
 * for a *screen*, not a source of tax facts, and this module takes no rate from it
 * or from anywhere else.
 *
 * The VAT on the report is `Σ RetailSale.taxAmount` — the tax actually charged,
 * line by line, already carved out of tax-inclusive shelf prices by
 * `netOfInclusiveTax` in `lib/retail/checkout.ts`. `taxRatePercent` on the report
 * is then *derived back out* of the totals (`tax ÷ net × 100`) purely so the header
 * can name the rate the day was actually charged at. A shelf of 15%-inclusive
 * prices produces 15.00; nothing in this file could produce 14.5 if it tried.
 *
 * ── Why `RetailSale.subtotal` is never read ───────────────────────────────
 *
 * The obvious way to get revenue before VAT is `Σ subtotal`, and it is wrong on
 * this data. `calculateRetailCheckout` gives a **sale** an ex-VAT `subtotal` on a
 * tax-inclusive list, and `refundRetailSaleTransaction` builds a **refund**'s from
 * `quantity × unitPrice` — shelf money, VAT still inside it
 * (`_services.ts`, `baseAmount: multiplyMoney(requestedQuantity, sourceLine.unitPrice)`).
 * The two are in different bases, so on an inclusive list a refund breaks the
 * identity every other figure depends on: `subtotal − discount + tax = total`
 * gives −28.80 − 0 + −3.76 = −32.56 against a total of −28.80. (`VOID` is fine —
 * it copies the source sale's `subtotal` rather than rebuilding one.)
 *
 * That is a defect in the refund path, not in this one, and it is written up
 * rather than silently patched here. What this module does is decline to read the
 * column at all:
 *
 *   netSales   = grossTakings − taxTotal
 *   grossSales = netSales + discountTotal
 *
 * `totalAmount`, `taxAmount` and `discountAmount` are correct on all three
 * document types, so every figure below is exact and `netSales + taxTotal =
 * grossTakings` holds by construction rather than by luck. Deriving is also the
 * better definition in its own right: revenue net of VAT is what customers paid
 * less the VAT inside it, in one basis, whatever a header column happens to say.
 *
 * ── Everything is Decimal ──────────────────────────────────────────────────
 *
 * The prototype computes with `+(x).toFixed(2)` throughout and tolerates a
 * variance under `Math.abs(v) > 10`. Neither appears here. Every figure below is
 * `Prisma.Decimal` from the column to the column, and the money inside the JSON
 * breakdowns is written as a **decimal string** rather than a number — a `Json`
 * column round-trips a number through a double, which is the precision this repo
 * spent S-1 removing from the typed columns and must not reintroduce sideways.
 */

import type {
  Prisma,
  RetailSaleType,
  RetailTenderType,
} from "@corelithzw/db";

import {
  ZERO,
  money,
  percent,
  rate,
  sumMoney,
  toBaseAmount,
  type MoneyLike,
} from "@/lib/money";
import type {
  RetailCashMovementReasonCode,
  RetailCashMovementTypeName,
} from "./cash-movements";
import {
  cashVariance,
  expectedCashForShift,
  getCashNetFromPayments,
  sumCashMovementDeltas,
  type CashMovementLike,
} from "./cash-up";

/** Every tender, in the order the report lists them when amounts tie. */
export const RETAIL_Z_REPORT_TENDERS = [
  "CASH",
  "CARD",
  "MOBILE_MONEY",
  "TRANSFER",
  "VOUCHER",
] as const;

/** The schema's vocabulary is this module's. A value added there fails to compile here. */
const _tendersMatchTheSchema: readonly RetailTenderType[] = RETAIL_Z_REPORT_TENDERS;
void _tendersMatchTheSchema;

/**
 * How many best-sellers the stored report holds.
 *
 * The prototype shows seven. Ten is stored because the row is written once and can
 * never be regenerated — a manager who wants the eighth line a week later cannot
 * ask for it, so the cheap margin is taken at write time. The screen still leads
 * with the prototype's seven and offers the rest.
 */
export const RETAIL_Z_REPORT_TOP_ITEMS = 10;

/* ── The trading day ─────────────────────────────────────────────────────── */

/**
 * The trading day a drawer opened on, as `YYYY-MM-DD`.
 *
 * UTC, for the reason set out in the header: there is no per-company timezone in
 * this repository to read, and inventing one here would put a fiction into a
 * document that cannot be reissued. This is the single place that decides.
 */
export function tradingDayKey(openedAt: Date): string {
  return openedAt.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` and nothing else. A malformed date must not silently select nothing. */
export function parseTradingDay(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("A trading day is a date in YYYY-MM-DD form");
  }
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || tradingDayKey(parsed) !== trimmed) {
    throw new Error(`Not a real date: ${trimmed}`);
  }
  return trimmed;
}

/**
 * The half-open instant window `[start, end)` a trading day's drawers open in.
 *
 * Half-open on purpose: a drawer opened at exactly midnight belongs to the day
 * starting, not the day ending, and a closed interval would put it on both.
 */
export function tradingDayWindow(businessDate: string): { start: Date; end: Date } {
  const day = parseTradingDay(businessDate);
  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** The date as Postgres `date` wants it — midnight UTC, no time part in play. */
export function tradingDayAsDate(businessDate: string): Date {
  return new Date(`${parseTradingDay(businessDate)}T00:00:00.000Z`);
}

/**
 * The report's number, derived rather than reserved.
 *
 * `Z-TILL02-20260814`. A sequence would be wrong here: the document is unique on
 * `(register, trading day)` by construction, so its identifier should be too —
 * that way a reprint carries the same number as the original because there is no
 * other number it could carry, rather than because a lookup happened to succeed.
 */
export function buildRetailZReportNo(registerCode: string, businessDate: string): string {
  const code = registerCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "REG";
  return `Z-${code}-${parseTradingDay(businessDate).replace(/-/g, "")}`;
}

/* ── What the builder is given ───────────────────────────────────────────── */

/** One line off a sale, as `RetailSaleLine` stores it. */
export type ZReportLineInput = {
  /** Whatever identifies the product across sales — a catalogue id, else the item. */
  itemKey: string;
  itemName: string;
  sku: string | null;
  /** Always positive, as stored. The direction comes off the sale's type. */
  quantity: MoneyLike;
  /** Signed as stored: negative on a refund or a void line. */
  lineTotal: MoneyLike;
};

/**
 * One `RetailSale` row.
 *
 * Amounts are in the **sale's own** currency and are converted here at the sale's
 * stamped `exchangeRate`, never at today's — a receipt already handed over is not
 * restated by a rate that moved afterwards.
 *
 * No `status` filter is applied by the caller and none should be. A sale later
 * voided keeps `status: VOIDED` and its cancelling `VOID` row carries the negated
 * amounts, so summing *both* nets to zero, which is right. Dropping the voided
 * original and keeping the reversal would drive the day negative by the value of
 * every cancelled basket.
 */
export type ZReportSaleInput = {
  saleType: RetailSaleType;
  /**
   * `RetailSale.subtotal` is deliberately absent. It is recorded ex-VAT on a sale
   * and VAT-inclusive on a refund, so it cannot be summed across the two — see the
   * header. Net revenue is derived from `totalAmount` and `taxAmount` instead.
   */
  discountAmount: MoneyLike;
  taxAmount: MoneyLike;
  totalAmount: MoneyLike;
  changeAmount: MoneyLike;
  /** Quote units per one base unit, stamped on the sale. 1 for a base-currency sale. */
  exchangeRate: MoneyLike;
  /** `baseAmount` per tender, as `RetailSalePayment` stores it. Signed. */
  payments: Array<{ tenderType: RetailTenderType; baseAmount: MoneyLike }>;
  lines: ZReportLineInput[];
};

/** One `RetailCashMovement`, with the two fields the report groups by. */
export type ZReportMovementInput = CashMovementLike & {
  type: RetailCashMovementTypeName;
  reasonCode: RetailCashMovementReasonCode;
};

/** One `RetailShift` on the register that day, with everything hanging off it. */
export type ZReportShiftInput = {
  id: string;
  shiftNo: string;
  cashierName: string;
  openedAt: Date;
  closedAt: Date | null;
  openingFloat: MoneyLike;
  /** What the cashier actually counted at close. Null on a shift never counted. */
  countedCash: MoneyLike | null;
  movements: ZReportMovementInput[];
  sales: ZReportSaleInput[];
};

export type ZReportBuildInput = {
  businessDate: string;
  registerCode: string;
  registerName: string;
  siteId: string;
  currency: string;
  shifts: ZReportShiftInput[];
};

/* ── What it produces ────────────────────────────────────────────────────── */

/**
 * One tender's day. `amount` and `share` are decimal strings — see the header on
 * why money does not travel through a `Json` column as a number.
 */
export type ZReportTenderLine = {
  tenderType: RetailTenderType;
  /** Payment rows, reversals included. A refund is a row the drawer saw. */
  count: number;
  amount: string;
  /** Percent of the day's tendered total, at two places. These sum to 100.00. */
  share: string;
};

export type ZReportItemLine = {
  rank: number;
  itemKey: string;
  itemName: string;
  sku: string | null;
  /** Net of refunds and voids, at four places, as `RetailSaleLine.quantity` is. */
  quantity: string;
  amount: string;
};

/** Movements grouped the way `RetailCashMovementReason` exists to be grouped. */
export type ZReportMovementLine = {
  type: RetailCashMovementTypeName;
  reasonCode: RetailCashMovementReasonCode;
  count: number;
  /** The signed effect on the drawer: negative for a drop or a payout. */
  amount: string;
};

export type ZReportShiftLine = {
  shiftId: string;
  shiftNo: string;
  cashierName: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: string;
  cashTakings: string;
  movementNet: string;
  expectedCash: string;
  countedCash: string | null;
  variance: string | null;
};

/** The typed columns, all `Decimal`, plus the four breakdowns as JSON-ready rows. */
export type RetailZReportFigures = {
  businessDate: string;
  reportNo: string;
  registerCode: string;
  registerName: string;
  siteId: string;
  currency: string;

  shiftCount: number;
  saleCount: number;
  refundCount: number;
  voidCount: number;
  /** Distinct products that moved. The "of 184" beside the best-sellers table. */
  itemCount: number;

  /** `netSales + discountTotal` — revenue before VAT and before discount. */
  grossSales: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  /** `grossTakings − taxTotal`. What the ledger books as revenue. */
  netSales: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  /** Derived from the two above, never applied to them. */
  taxRatePercent: Prisma.Decimal;
  /** Σ `totalAmount` — what customers actually paid. `netSales + taxTotal`. */
  grossTakings: Prisma.Decimal;
  refundTotal: Prisma.Decimal;
  voidTotal: Prisma.Decimal;

  openingFloat: Prisma.Decimal;
  cashTakings: Prisma.Decimal;
  cashDropTotal: Prisma.Decimal;
  cashTopUpTotal: Prisma.Decimal;
  cashPayoutTotal: Prisma.Decimal;
  cashMovementNet: Prisma.Decimal;
  expectedCash: Prisma.Decimal;
  countedCash: Prisma.Decimal;
  cashVariance: Prisma.Decimal;

  tenderBreakdown: ZReportTenderLine[];
  topItems: ZReportItemLine[];
  cashMovements: ZReportMovementLine[];
  shifts: ZReportShiftLine[];
};

/* ── The arithmetic ──────────────────────────────────────────────────────── */

/** −1 for the two reversing document types, +1 for a sale. */
function directionOf(saleType: RetailSaleType): 1 | -1 {
  return saleType === "SALE" ? 1 : -1;
}

/**
 * Each tender's percentage of the day, summing to exactly 100.00.
 *
 * The residue goes on the **last** row — and the caller sorts largest first, so
 * that is the smallest tender. This is the same allocation
 * `calculateRetailCheckout` uses to spread an order discount across lines, kept
 * deliberately identical rather than reaching for largest-remainder: one rounding
 * convention in the module is worth more than a hundredth of a percentage point
 * on the shortest row.
 *
 * A day whose tenders net to zero gets zeros rather than a division by it.
 */
function allocateShares(amounts: Prisma.Decimal[]): Prisma.Decimal[] {
  const total = sumMoney(amounts);
  if (total.isZero()) return amounts.map(() => ZERO);

  const hundred = percent(100);
  let allocated = ZERO;
  return amounts.map((amount, index) => {
    if (index === amounts.length - 1) return percent(hundred.minus(allocated));
    const share = percent(amount.dividedBy(total).times(100));
    allocated = allocated.plus(share);
    return share;
  });
}

/**
 * A register's trading day, worked out once.
 *
 * Pure: every figure comes from the arguments, so the hand-worked test asserts the
 * arithmetic the route persists rather than its own copy of it. The route's only
 * remaining job is to read the rows and write the answer down.
 */
export function buildRetailZReportFigures(
  input: ZReportBuildInput,
): RetailZReportFigures {
  const businessDate = parseTradingDay(input.businessDate);

  let discountTotal = ZERO;
  let taxTotal = ZERO;
  let grossTakings = ZERO;
  let refundTotal = ZERO;
  let voidTotal = ZERO;
  let saleCount = 0;
  let refundCount = 0;
  let voidCount = 0;

  let openingFloat = ZERO;
  let cashTakings = ZERO;
  let expectedCash = ZERO;
  let countedCash = ZERO;

  const tenderAmounts = new Map<RetailTenderType, Prisma.Decimal>();
  const tenderCounts = new Map<RetailTenderType, number>();
  const itemAmounts = new Map<
    string,
    { itemName: string; sku: string | null; quantity: Prisma.Decimal; amount: Prisma.Decimal }
  >();
  const movementRows = new Map<
    string,
    {
      type: RetailCashMovementTypeName;
      reasonCode: RetailCashMovementReasonCode;
      count: number;
      amount: Prisma.Decimal;
    }
  >();
  const shiftLines: ZReportShiftLine[] = [];

  for (const shift of input.shifts) {
    // Cash across this drawer's counter, net of change and with refunds already
    // carrying their own negative sign — the figure `expectedCashForShift` wants
    // and the one `getCashNetFromPayments` is the single definition of.
    let shiftCashTakings = ZERO;

    for (const sale of shift.sales) {
      const fx = rate(sale.exchangeRate);
      const direction = directionOf(sale.saleType);

      const saleDiscount = toBaseAmount(sale.discountAmount, fx);
      const saleTax = toBaseAmount(sale.taxAmount, fx);
      const saleTotal = toBaseAmount(sale.totalAmount, fx);

      discountTotal = discountTotal.plus(saleDiscount);
      taxTotal = taxTotal.plus(saleTax);
      grossTakings = grossTakings.plus(saleTotal);

      if (sale.saleType === "SALE") saleCount += 1;
      if (sale.saleType === "REFUND") {
        refundCount += 1;
        refundTotal = refundTotal.plus(saleTotal.abs());
      }
      if (sale.saleType === "VOID") {
        voidCount += 1;
        voidTotal = voidTotal.plus(saleTotal.abs());
      }

      const changeBase = toBaseAmount(sale.changeAmount, fx);

      for (const payment of sale.payments) {
        const amount = money(payment.baseAmount);
        tenderAmounts.set(
          payment.tenderType,
          (tenderAmounts.get(payment.tenderType) ?? ZERO).plus(amount),
        );
        tenderCounts.set(payment.tenderType, (tenderCounts.get(payment.tenderType) ?? 0) + 1);
      }

      // Change is handed back in notes, so it comes off the cash row and only that
      // row. Without it "how customers paid" adds up to what was *tendered* rather
      // than to what was paid: a $50 note against a $48.30 basket would report
      // $1.70 of takings the shop never had, and the table would not reconcile to
      // the day's total. It also makes the cash row equal `cashTakings` exactly,
      // which is the same figure the drawer is counted against.
      if (!changeBase.isZero()) {
        tenderAmounts.set("CASH", (tenderAmounts.get("CASH") ?? ZERO).minus(changeBase));
      }

      shiftCashTakings = shiftCashTakings.plus(
        getCashNetFromPayments(sale.payments, changeBase),
      );

      for (const line of sale.lines) {
        const existing = itemAmounts.get(line.itemKey) ?? {
          itemName: line.itemName,
          sku: line.sku,
          quantity: ZERO,
          amount: ZERO,
        };
        // `lineTotal` is stored signed; `quantity` is not, so the direction has to
        // come off the document type. Without this a refunded crate would add to
        // the day's units sold while subtracting from its value.
        itemAmounts.set(line.itemKey, {
          itemName: existing.itemName,
          sku: existing.sku ?? line.sku,
          quantity: existing.quantity.plus(rate(line.quantity).abs().times(direction)),
          amount: existing.amount.plus(toBaseAmount(line.lineTotal, fx)),
        });
      }
    }

    for (const movement of shift.movements) {
      const key = `${movement.type}:${movement.reasonCode}`;
      const existing = movementRows.get(key);
      movementRows.set(key, {
        type: movement.type,
        reasonCode: movement.reasonCode,
        count: (existing?.count ?? 0) + 1,
        amount: (existing?.amount ?? ZERO).plus(sumCashMovementDeltas([movement])),
      });
    }

    const shiftMovementNet = sumCashMovementDeltas(shift.movements);
    // The formula S-7.1 exists for, applied per drawer and summed — not a second
    // implementation of it standing beside the first.
    const shiftExpected = expectedCashForShift({
      openingFloat: shift.openingFloat,
      cashTakings: shiftCashTakings,
      movements: shift.movements,
    });
    const shiftCounted = shift.countedCash == null ? null : money(shift.countedCash);

    openingFloat = openingFloat.plus(money(shift.openingFloat));
    cashTakings = cashTakings.plus(shiftCashTakings);
    expectedCash = expectedCash.plus(shiftExpected);
    countedCash = countedCash.plus(shiftCounted ?? ZERO);

    shiftLines.push({
      shiftId: shift.id,
      shiftNo: shift.shiftNo,
      cashierName: shift.cashierName,
      openedAt: shift.openedAt.toISOString(),
      closedAt: shift.closedAt?.toISOString() ?? null,
      openingFloat: money(shift.openingFloat).toFixed(2),
      cashTakings: shiftCashTakings.toFixed(2),
      movementNet: shiftMovementNet.toFixed(2),
      expectedCash: shiftExpected.toFixed(2),
      countedCash: shiftCounted?.toFixed(2) ?? null,
      variance: shiftCounted ? shiftCounted.minus(shiftExpected).toFixed(2) : null,
    });
  }

  discountTotal = money(discountTotal);
  taxTotal = money(taxTotal);
  grossTakings = money(grossTakings);
  // Derived rather than summed off `RetailSale.subtotal`, which a refund records
  // in the other basis — see the header. `netSales + taxTotal = grossTakings` is
  // then true by construction on every mix of sales, refunds and voids.
  const netSales = money(grossTakings.minus(taxTotal));
  const grossSales = money(netSales.plus(discountTotal));

  // Derived, so the header can name the rate the day was charged at without this
  // module ever holding one. 15%-inclusive shelf prices give back 15.00.
  const taxRatePercent = netSales.isZero()
    ? percent(0)
    : percent(taxTotal.dividedBy(netSales).times(100));

  const movements = [...movementRows.values()].sort(
    (a, b) =>
      a.type.localeCompare(b.type) ||
      a.reasonCode.localeCompare(b.reasonCode),
  );
  const cashDropTotal = sumMoney(
    movements.filter((row) => row.type === "DROP_TO_SAFE").map((row) => row.amount.abs()),
  );
  const cashTopUpTotal = sumMoney(
    movements.filter((row) => row.type === "FLOAT_TOP_UP").map((row) => row.amount.abs()),
  );
  const cashPayoutTotal = sumMoney(
    movements.filter((row) => row.type === "PAYOUT").map((row) => row.amount.abs()),
  );
  const cashMovementNet = sumMoney(movements.map((row) => row.amount));

  const tenderRows = [...tenderAmounts.entries()]
    .map(([tenderType, amount]) => ({
      tenderType,
      amount: money(amount),
      count: tenderCounts.get(tenderType) ?? 0,
    }))
    // Largest first, and the tender vocabulary breaks a tie so two equal rows do
    // not swap places between a report and its own reprint.
    .sort(
      (a, b) =>
        b.amount.comparedTo(a.amount) ||
        RETAIL_Z_REPORT_TENDERS.indexOf(a.tenderType) -
          RETAIL_Z_REPORT_TENDERS.indexOf(b.tenderType),
    );
  const shares = allocateShares(tenderRows.map((row) => row.amount));

  const items = [...itemAmounts.entries()]
    .map(([itemKey, entry]) => ({ itemKey, ...entry }))
    .sort((a, b) => b.amount.comparedTo(a.amount) || a.itemName.localeCompare(b.itemName));

  return {
    businessDate,
    reportNo: buildRetailZReportNo(input.registerCode, businessDate),
    registerCode: input.registerCode,
    registerName: input.registerName,
    siteId: input.siteId,
    currency: input.currency,

    shiftCount: input.shifts.length,
    saleCount,
    refundCount,
    voidCount,
    itemCount: items.length,

    grossSales,
    discountTotal,
    netSales,
    taxTotal,
    taxRatePercent,
    grossTakings,
    refundTotal: money(refundTotal),
    voidTotal: money(voidTotal),

    openingFloat: money(openingFloat),
    cashTakings: money(cashTakings),
    cashDropTotal,
    cashTopUpTotal,
    cashPayoutTotal,
    cashMovementNet,
    expectedCash: money(expectedCash),
    countedCash: money(countedCash),
    // The same subtraction cash-up performs, from the same function, so a Z-report
    // and the closeout screen can never disagree about which way a drawer is out.
    cashVariance: cashVariance({
      countedCash: money(countedCash),
      expectedCash: money(expectedCash),
    }),

    tenderBreakdown: tenderRows.map((row, index) => ({
      tenderType: row.tenderType,
      count: row.count,
      amount: row.amount.toFixed(2),
      share: shares[index].toFixed(2),
    })),
    topItems: items.slice(0, RETAIL_Z_REPORT_TOP_ITEMS).map((item, index) => ({
      rank: index + 1,
      itemKey: item.itemKey,
      itemName: item.itemName,
      sku: item.sku,
      quantity: rate(item.quantity).toFixed(4),
      amount: money(item.amount).toFixed(2),
    })),
    cashMovements: movements.map((row) => ({
      type: row.type,
      reasonCode: row.reasonCode,
      count: row.count,
      amount: row.amount.toFixed(2),
    })),
    shifts: shiftLines,
  };
}

/* ── Reading one back ────────────────────────────────────────────────────── */

/**
 * The report as the till and the CSV read it.
 *
 * Numbers on the wire, because `successResponse` serialises `Decimal` to `Number`
 * for every other retail payload and a Z-report that arrived as strings would be
 * the one screen doing its own thing. The **storage** is what has to be exact; the
 * rendering of an already-frozen figure does not re-enter any arithmetic.
 */
export type RetailZReportPayload = {
  id: string;
  reportNo: string;
  businessDate: string;
  registerCode: string;
  registerName: string;
  siteName: string | null;
  currency: string;
  generatedAt: string;
  generatedByName: string | null;
  shiftCount: number;
  saleCount: number;
  refundCount: number;
  voidCount: number;
  itemCount: number;
  grossSales: number;
  discountTotal: number;
  netSales: number;
  taxTotal: number;
  taxRatePercent: number;
  grossTakings: number;
  refundTotal: number;
  voidTotal: number;
  openingFloat: number;
  cashTakings: number;
  cashDropTotal: number;
  cashTopUpTotal: number;
  cashPayoutTotal: number;
  cashMovementNet: number;
  expectedCash: number;
  countedCash: number;
  cashVariance: number;
  tenderBreakdown: ZReportTenderLine[];
  topItems: ZReportItemLine[];
  cashMovements: ZReportMovementLine[];
  shifts: ZReportShiftLine[];
};

/**
 * The stored row, as Prisma hands it back.
 *
 * Structural rather than `Prisma.RetailZReportGetPayload`, so this module stays
 * usable from a test that builds a row by hand and never has to keep a generated
 * type in view.
 */
export type RetailZReportRow = {
  id: string;
  reportNo: string;
  businessDate: Date;
  registerCode: string;
  registerName: string;
  currency: string;
  generatedAt: Date;
  generatedByName: string | null;
  shiftCount: number;
  saleCount: number;
  refundCount: number;
  voidCount: number;
  itemCount: number;
  grossSales: MoneyLike;
  discountTotal: MoneyLike;
  netSales: MoneyLike;
  taxTotal: MoneyLike;
  taxRatePercent: MoneyLike;
  grossTakings: MoneyLike;
  refundTotal: MoneyLike;
  voidTotal: MoneyLike;
  openingFloat: MoneyLike;
  cashTakings: MoneyLike;
  cashDropTotal: MoneyLike;
  cashTopUpTotal: MoneyLike;
  cashPayoutTotal: MoneyLike;
  cashMovementNet: MoneyLike;
  expectedCash: MoneyLike;
  countedCash: MoneyLike;
  cashVariance: MoneyLike;
  tenderBreakdown: unknown;
  topItems: unknown;
  cashMovements: unknown;
  shifts: unknown;
};

/** A `Json` column is `unknown` until something says what it is. This says it. */
function jsonRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * The stored row, shaped for the wire.
 *
 * Nothing is recalculated. `Number(...)` on a `Decimal(14,2)` is exact below 15
 * significant digits, which is what `serializeDecimals` already relies on for
 * every other retail payload, and the figures are frozen before they get here so
 * no arithmetic follows.
 */
export function serializeRetailZReport(
  row: RetailZReportRow,
  siteName: string | null,
): RetailZReportPayload {
  const num = (value: MoneyLike) => Number(money(value));
  return {
    id: row.id,
    reportNo: row.reportNo,
    businessDate: tradingDayKey(row.businessDate),
    registerCode: row.registerCode,
    registerName: row.registerName,
    siteName,
    currency: row.currency,
    generatedAt: row.generatedAt.toISOString(),
    generatedByName: row.generatedByName,
    shiftCount: row.shiftCount,
    saleCount: row.saleCount,
    refundCount: row.refundCount,
    voidCount: row.voidCount,
    itemCount: row.itemCount,
    grossSales: num(row.grossSales),
    discountTotal: num(row.discountTotal),
    netSales: num(row.netSales),
    taxTotal: num(row.taxTotal),
    taxRatePercent: Number(percent(row.taxRatePercent)),
    grossTakings: num(row.grossTakings),
    refundTotal: num(row.refundTotal),
    voidTotal: num(row.voidTotal),
    openingFloat: num(row.openingFloat),
    cashTakings: num(row.cashTakings),
    cashDropTotal: num(row.cashDropTotal),
    cashTopUpTotal: num(row.cashTopUpTotal),
    cashPayoutTotal: num(row.cashPayoutTotal),
    cashMovementNet: num(row.cashMovementNet),
    expectedCash: num(row.expectedCash),
    countedCash: num(row.countedCash),
    cashVariance: num(row.cashVariance),
    tenderBreakdown: jsonRows<ZReportTenderLine>(row.tenderBreakdown),
    topItems: jsonRows<ZReportItemLine>(row.topItems),
    cashMovements: jsonRows<ZReportMovementLine>(row.cashMovements),
    shifts: jsonRows<ZReportShiftLine>(row.shifts),
  };
}

/** One row of the day's takings, as the CSV export writes it. */
export type RetailZReportCsvRow = Record<string, string>;

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The stored report as a spreadsheet.
 *
 * One flat `section,label,detail,count,amount` grid rather than four tables glued
 * together, because a spreadsheet with four different column layouts stacked in it
 * cannot be filtered or pivoted, and pivoting is the entire reason somebody asked
 * for a spreadsheet.
 *
 * Every amount is written from the stored value as text. That is what makes an
 * export of a reprint byte-identical to an export of the original.
 */
export function retailZReportToCsv(report: RetailZReportPayload): string {
  const rows: RetailZReportCsvRow[] = [];
  const push = (
    section: string,
    label: string,
    detail: string,
    count: string,
    amount: string,
  ) => rows.push({ section, label, detail, count, amount });

  const fixed = (value: number) => value.toFixed(2);

  push("Report", "Z-report", report.reportNo, "", "");
  push("Report", "Trading day", report.businessDate, "", "");
  push("Report", "Register", `${report.registerName} (${report.registerCode})`, "", "");
  push("Report", "Branch", report.siteName ?? "", "", "");
  push("Report", "Generated", report.generatedAt, "", "");
  push("Report", "Generated by", report.generatedByName ?? "", "", "");
  push("Report", "Currency", report.currency, "", "");

  push("Sales", "Sales before discounts (excl. VAT)", "", String(report.saleCount), fixed(report.grossSales));
  push("Sales", "Discounts given", "", "", fixed(report.discountTotal));
  push("Sales", "Net sales (excl. VAT)", "", "", fixed(report.netSales));
  push("Sales", "VAT", `${report.taxRatePercent.toFixed(2)}%`, "", fixed(report.taxTotal));
  push("Sales", "Take-home (after discounts)", "", "", fixed(report.grossTakings));
  push("Sales", "Refunds", "", String(report.refundCount), fixed(report.refundTotal));
  push("Sales", "Voids", "", String(report.voidCount), fixed(report.voidTotal));

  for (const tender of report.tenderBreakdown) {
    push("Tender", tender.tenderType, `${tender.share}%`, String(tender.count), tender.amount);
  }

  for (const item of report.topItems) {
    push(
      "Top item",
      item.itemName,
      item.sku ?? "",
      item.quantity,
      item.amount,
    );
  }

  push("Cash", "Opening float", "", "", fixed(report.openingFloat));
  push("Cash", "Cash takings", "", "", fixed(report.cashTakings));
  for (const movement of report.cashMovements) {
    push("Cash", movement.type, movement.reasonCode, String(movement.count), movement.amount);
  }
  push("Cash", "Cash moved (net)", "", "", fixed(report.cashMovementNet));
  push("Cash", "Expected in drawer", "", "", fixed(report.expectedCash));
  push("Cash", "Counted", "", "", fixed(report.countedCash));
  push("Cash", "Variance", "", "", fixed(report.cashVariance));

  for (const shift of report.shifts) {
    push(
      "Shift",
      shift.shiftNo,
      `${shift.cashierName} · expected ${shift.expectedCash} · counted ${shift.countedCash ?? "-"}`,
      "",
      shift.variance ?? "",
    );
  }

  const headers = ["section", "label", "detail", "count", "amount"];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header] ?? "")).join(",")),
  ].join("\r\n");
}
