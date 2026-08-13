/**
 * What the drawer should hold, and by how much the count misses it.
 *
 * S-7.1. `RetailShift` has always had `openingFloat`, `expectedCash`,
 * `countedCash` and `variance`, and never had anywhere to say that the manager
 * banked $200 at four o'clock. On a Friday a bottle store takes more cash across
 * the counter than a drawer should hold and some of it goes to the safe; with no
 * row for that, `expectedCash` kept counting money that was no longer there,
 * `countedCash` correctly did not, and `variance` read as a shortfall exactly equal
 * to what had been banked. The cashier was short on paper.
 *
 * That is a wrong number rather than a missing screen, which is why the ticket
 * outranked the rest of the till backlog.
 *
 * ── The formula ────────────────────────────────────────────────────────────
 *
 *   expected = openingFloat
 *            + cash takings          net of change given, refunds already negative
 *            − drops to the safe
 *            + float top-ups
 *            − payouts
 *
 *   variance = countedCash − expected        over is positive, short is negative
 *
 * The signs of the three movement kinds live in
 * `RETAIL_CASH_MOVEMENT_DIRECTION` and are applied only by `cashMovementDelta`.
 *
 * ── Refunds are already negative ───────────────────────────────────────────
 *
 * Worth stating, because it is the trap here. `_services.ts` posts a refund and a
 * void as reversing sales whose `RetailSalePayment.amount` rows are negated, and
 * `getCashNetFromPayments` sums them as they stand — so a cash refund already pulls
 * `expectedCash` down on its own, and this module must not subtract it a second
 * time. `cashTakings` below is that net figure, sign included, and the only things
 * this file subtracts are movements.
 *
 * Everything is `Prisma.Decimal` end to end through `lib/money.ts`. No floats and
 * no epsilon comparison: the refund path was fixed for exactly that, and a variance
 * is the number a manager is asked to explain.
 */

import type {
  Prisma,
  RetailCashMovementReason,
  RetailCashMovementType,
} from "@prisma/client";

import { money, multiplyMoney, rate, sumMoney, toBaseAmount, type MoneyLike } from "@/lib/money";
import {
  RETAIL_CASH_MOVEMENT_DIRECTION,
  RETAIL_CASH_MOVEMENT_REASON_CODES,
  RETAIL_CASH_MOVEMENT_TYPES,
  type CashDenominationLine,
  type RetailCashMovementReasonCode,
  type RetailCashMovementTypeName,
} from "./cash-movements";

/**
 * The till's copy of the two vocabularies is the schema's.
 *
 * `cash-movements.ts` cannot import `@prisma/client` — it is loaded in the browser —
 * so the lists are checked against each other here instead, where the import is
 * free and erased. A label added to the schema and forgotten in the till, or the
 * reverse, fails to compile.
 */
const _typesMatchTheSchema: readonly RetailCashMovementType[] = RETAIL_CASH_MOVEMENT_TYPES;
const _schemaMatchesTheTypes: RetailCashMovementTypeName = "DROP_TO_SAFE" as RetailCashMovementType;
const _reasonsMatchTheSchema: readonly RetailCashMovementReason[] =
  RETAIL_CASH_MOVEMENT_REASON_CODES;
const _schemaMatchesTheReasons: RetailCashMovementReasonCode =
  "OTHER" as RetailCashMovementReason;
void _typesMatchTheSchema;
void _schemaMatchesTheTypes;
void _reasonsMatchTheSchema;
void _schemaMatchesTheReasons;

/**
 * Cash into the drawer for one sale, in the company's base currency.
 *
 * Moved here from `app/api/v2/retail/_helpers.ts`, and fixed on the way.
 *
 * **It summed face values.** It took `{ tenderType, amount }` and nothing else,
 * so a 5,500 ZWG note tendered against a USD-priced basket added 5,500 to a
 * drawer denominated in dollars, when what actually went into it was $200.00.
 * R-1.5 put `currency`, `exchangeRate` and `baseAmount` on `RetailSalePayment`
 * so this sum could be right, and the sum never started reading them.
 *
 * This is the same defect as the missing cash movement above and it is worse:
 * a drop only happens when a manager banks cash, while this was wrong on
 * *every* sale settled in the other currency — in a shop that prices in USD and
 * takes ZWG across the counter all day, which is every shop in Harare. The
 * cashier wore the difference at cash-up.
 *
 * `baseAmount`, not `amount`, for the same reason `cashMovementDelta` uses it:
 * `openingFloat` and `expectedCash` are base-currency columns, so everything
 * added to or taken off them has to arrive in that denomination.
 *
 * Change is passed in **already converted**. It is handed back in the currency
 * the sale was priced in, so only the caller knows which rate applied —
 * guessing here would put the bug back one layer down.
 */
export function getCashNetFromPayments(
  payments: Iterable<{ tenderType: string; baseAmount: MoneyLike }>,
  changeBaseAmount: MoneyLike = 0,
): Prisma.Decimal {
  const cashIn = sumMoney(
    [...payments]
      .filter((payment) => payment.tenderType === "CASH")
      .map((payment) => money(payment.baseAmount)),
  );
  return cashIn.minus(money(changeBaseAmount));
}

/** The shape this module needs off a `RetailCashMovement` row. */
export type CashMovementLike = {
  type: RetailCashMovementTypeName;
  /**
   * The movement in the company's base currency. `expectedCash` is denominated in
   * the base currency because `openingFloat` is, so a bundle of ZWG notes taken to
   * the safe at 27.5 has to be converted before it can come off the drawer.
   */
  baseAmount: MoneyLike;
};

/**
 * What one movement does to `expectedCash`, signed.
 *
 * `+200.00` for a float top-up of two hundred, `-200.00` for a drop of the same.
 */
export function cashMovementDelta(movement: CashMovementLike): Prisma.Decimal {
  const amount = money(movement.baseAmount).abs();
  return RETAIL_CASH_MOVEMENT_DIRECTION[movement.type] === -1 ? amount.negated() : amount;
}

/** Every movement's effect on the drawer, summed exactly. */
export function sumCashMovementDeltas(
  movements: Iterable<CashMovementLike>,
): Prisma.Decimal {
  return sumMoney([...movements].map(cashMovementDelta));
}

/**
 * What the drawer should hold, from its parts.
 *
 * This is the whole ticket in one function, and it is also the recomputation the
 * cash-up screen shows underneath the figure — a variance nobody can account for is
 * the thing S-7.1 exists to prevent.
 *
 * `cashTakings` is net cash across the counter: cash tendered less change given,
 * with refunds and voids already carrying their own negative sign. That is what
 * `getCashNetFromPayments` returns and what `_services.ts` increments the column by
 * on every sale.
 */
export function expectedCashForShift(input: {
  openingFloat: MoneyLike;
  cashTakings: MoneyLike;
  movements: Iterable<CashMovementLike>;
}): Prisma.Decimal {
  return sumMoney([
    money(input.openingFloat),
    money(input.cashTakings),
    sumCashMovementDeltas(input.movements),
  ]);
}

/**
 * Counted less expected. Over is positive, short is negative.
 *
 * The same subtraction `closeRetailShiftTransaction` performs, exported so the
 * hand-worked test asserts the arithmetic the route runs rather than its own copy
 * of it.
 */
export function cashVariance(input: {
  countedCash: MoneyLike;
  expectedCash: MoneyLike;
}): Prisma.Decimal {
  return money(input.countedCash).minus(money(input.expectedCash));
}

/**
 * A counted bundle, added up exactly.
 *
 * `3 × $100 + 2 × $20` is $340.00 and no float ever touches it: the denomination is
 * a decimal string, the count is a whole number, and the products are accumulated
 * in `Decimal`. Counting three ten-cent coins as `3 * 0.1` in a double gives
 * 0.30000000000000004, which is the class of answer this whole ticket is about.
 */
export function totalFromDenominations(
  lines: Iterable<CashDenominationLine>,
): Prisma.Decimal {
  return sumMoney(
    [...lines].map((line) => multiplyMoney(line.count, money(line.denomination))),
  );
}

/**
 * The three money fields a movement is stored with, from what the till sends.
 *
 * Mirrors what `normalizeRetailPostingPayments` does for a tender (R-1.5): the
 * amount as it was counted, the rate it was counted at, and the base-currency value
 * reconciliation actually uses. A movement in the company's own currency converts
 * to itself at a rate of 1, so a single-currency shop pays nothing for the column.
 */
export function buildCashMovementAmounts(input: {
  amount: MoneyLike;
  exchangeRate: MoneyLike;
}): { amount: Prisma.Decimal; exchangeRate: Prisma.Decimal; baseAmount: Prisma.Decimal } {
  const amount = money(input.amount).abs();
  // `rate`, not `money`: the column is `Decimal(12,4)`, and 27.5 ZWG to the dollar
  // rounded to the cent is a different rate.
  const exchangeRate = rate(input.exchangeRate);
  return { amount, exchangeRate, baseAmount: toBaseAmount(amount, exchangeRate) };
}
