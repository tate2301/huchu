/**
 * The cash-up, worked by hand.
 *
 * S-7.1. This is the deliverable that proves the defect is fixed, so it states real
 * figures from a real Friday at a Harare bottle store rather than round numbers
 * chosen to make the arithmetic easy, and asserts the answer to the cent in
 * `Decimal`.
 *
 * The defect, restated: `RetailShift` had `openingFloat`, `expectedCash`,
 * `countedCash` and `variance` and no model for cash leaving the drawer mid-shift.
 * When the manager banked $200 to the safe, `expectedCash` went on counting it,
 * `countedCash` correctly did not, and `variance` read as a shortfall of exactly
 * $200. The first test below is that shortfall; the second is it going away.
 *
 * Everything is `Prisma.Decimal` and every assertion is `.toFixed(2)` or `.equals`.
 * There is no `toBeCloseTo` in this file on purpose: an epsilon comparison is what
 * the refund path was fixed for, and a variance a manager has to explain is not a
 * number to be approximately right about.
 */

import { describe, expect, it } from "vitest";

import { money, sumMoney } from "@/lib/money";
import {
  cashMovementDelta,
  cashVariance,
  expectedCashForShift,
  getCashNetFromPayments,
  sumCashMovementDeltas,
  totalFromDenominations,
} from "./cash-up";
import {
  RETAIL_CASH_MOVEMENT_DIRECTION,
  RETAIL_CASH_MOVEMENT_TYPES,
  getCashDenominations,
} from "./cash-movements";

/* ─── The Friday ──────────────────────────────────────────────────────────
 *
 * Till 02 at a bottle store in Harare. Faith opens at 07:30 with a $150 float.
 * Over the day the drawer takes $1,406.75 in cash across the counter — that is
 * cash tendered less change given, which is what `getCashNetFromPayments`
 * returns and what `_services.ts` increments `expectedCash` by on each sale.
 *
 * Two things then happen that the old model had nowhere to put:
 *
 *  - 16:10  the manager banks $200.00 to the safe (3×$50, 2×$20, 1×$10)
 *  - 17:45  a customer returns two crates and is refunded $47.60 in cash
 *
 * The refund is *not* a cash movement. `_services.ts` posts it as a reversing
 * sale whose payment rows are already negative, so it is inside the takings
 * figure below and must not be subtracted twice. That is the trap this test
 * exists to pin.
 *
 * At close Faith counts $1,356.75 in the drawer, and the drawer is right.
 */

const OPENING_FLOAT = "150.00";
/** Cash tendered less change, with the −47.60 refund already in it. */
const CASH_TAKINGS = "1406.75";
const DROP_TO_SAFE = "200.00";
const CASH_REFUND = "47.60";
/** What Faith physically counted at 19:00. The drawer is not missing anything. */
const COUNTED_CASH = "1356.75";

describe("the Friday drop — the defect S-7.1 fixes", () => {
  /**
   * What the shop saw before this ticket. `expectedCash` was float plus takings and
   * nothing else, so it still counted the $200 sitting in the safe.
   */
  it("used to read as a $200.00 shortfall, which is exactly what was banked", () => {
    const expectedWithoutTheDrop = sumMoney([OPENING_FLOAT, CASH_TAKINGS]);
    expect(expectedWithoutTheDrop.toFixed(2)).toBe("1556.75");

    const variance = cashVariance({
      countedCash: COUNTED_CASH,
      expectedCash: expectedWithoutTheDrop,
    });

    // Faith is short on paper by the exact amount her manager banked, and there is
    // nothing on the screen she can point at to say so.
    expect(variance.toFixed(2)).toBe("-200.00");
    expect(variance.abs().equals(money(DROP_TO_SAFE))).toBe(true);
  });

  /**
   * The fix, and the assertion that matters. With the drop recorded and nothing
   * genuinely missing, the variance is exactly zero — not 0.004, not −1e-13.
   */
  it("comes out at exactly zero once the drop is recorded", () => {
    const expected = expectedCashForShift({
      openingFloat: OPENING_FLOAT,
      cashTakings: CASH_TAKINGS,
      movements: [{ type: "DROP_TO_SAFE", baseAmount: DROP_TO_SAFE }],
    });

    //   150.00 float
    // + 1,406.75 cash takings (already net of the 47.60 refund)
    // −   200.00 to the safe
    // = 1,356.75
    expect(expected.toFixed(2)).toBe("1356.75");

    const variance = cashVariance({ countedCash: COUNTED_CASH, expectedCash: expected });
    expect(variance.isZero()).toBe(true);
    expect(variance.toFixed(2)).toBe("0.00");
  });

  /**
   * The trap. `_services.ts` posts a refund as a reversing sale whose payment rows
   * are already negative, so the $47.60 handed back across the counter is inside
   * `cashTakings` and subtracting it again as though it were a movement pushes the
   * cashier $47.60 *over* — the same defect with the sign reversed.
   */
  it("does not subtract the cash refund a second time", () => {
    const doubleCounted = expectedCashForShift({
      openingFloat: OPENING_FLOAT,
      cashTakings: CASH_TAKINGS,
      movements: [
        { type: "DROP_TO_SAFE", baseAmount: DROP_TO_SAFE },
        // A refund is not a `RetailCashMovement`, and this is what it costs if
        // somebody ever records one as a PAYOUT out of habit.
        { type: "PAYOUT", baseAmount: CASH_REFUND },
      ],
    });
    expect(doubleCounted.toFixed(2)).toBe("1309.15");
    expect(
      cashVariance({ countedCash: COUNTED_CASH, expectedCash: doubleCounted }).toFixed(2),
    ).toBe("47.60");
  });

  /**
   * The drop was 3×$50, 2×$20 and 1×$10, and the breakdown has to come to the
   * amount or the safe log and the drawer disagree with nobody able to say which is
   * right. The service refuses a mismatch; this is the sum it refuses on.
   */
  it("adds the banked bundle up to the amount it says it is", () => {
    const bundle = [
      { denomination: "50", count: 3 },
      { denomination: "20", count: 2 },
      { denomination: "10", count: 1 },
    ];
    expect(totalFromDenominations(bundle).toFixed(2)).toBe("200.00");
    expect(totalFromDenominations(bundle).equals(money(DROP_TO_SAFE))).toBe(true);
  });
});

describe("a fuller day — a top-up and a payout as well", () => {
  /**
   * The same Friday with two more movements, because a real shift has them: the
   * till runs out of small notes at midday and $80 comes in from the safe, and a
   * supplier drops a crate order off at 15:00 and is paid $62.40 out of the drawer.
   *
   *   150.00 float
   * + 1,406.75 takings
   * +    80.00 float top-up          in
   * −   200.00 drop to the safe      out
   * −    62.40 payout                out
   * = 1,374.35
   */
  const movements = [
    { type: "FLOAT_TOP_UP", baseAmount: "80.00" },
    { type: "DROP_TO_SAFE", baseAmount: DROP_TO_SAFE },
    { type: "PAYOUT", baseAmount: "62.40" },
  ] as const;

  it("nets the three movements to −182.40", () => {
    expect(sumCashMovementDeltas(movements).toFixed(2)).toBe("-182.40");
  });

  it("expects 1,374.35 in the drawer", () => {
    const expected = expectedCashForShift({
      openingFloat: OPENING_FLOAT,
      cashTakings: CASH_TAKINGS,
      movements,
    });
    expect(expected.toFixed(2)).toBe("1374.35");
  });

  it("reads a two-dollar over as +2.00, not as a rounding artefact", () => {
    const expected = expectedCashForShift({
      openingFloat: OPENING_FLOAT,
      cashTakings: CASH_TAKINGS,
      movements,
    });
    expect(cashVariance({ countedCash: "1376.35", expectedCash: expected }).toFixed(2)).toBe(
      "2.00",
    );
  });
});

describe("the signs", () => {
  it("takes a drop and a payout out, and puts a top-up in", () => {
    expect(cashMovementDelta({ type: "DROP_TO_SAFE", baseAmount: "200" }).toFixed(2)).toBe(
      "-200.00",
    );
    expect(cashMovementDelta({ type: "PAYOUT", baseAmount: "62.40" }).toFixed(2)).toBe(
      "-62.40",
    );
    expect(cashMovementDelta({ type: "FLOAT_TOP_UP", baseAmount: "80" }).toFixed(2)).toBe(
      "80.00",
    );
  });

  /**
   * `amount` on the row is always positive and the direction is the type's job. A
   * negative amount slipping through must not flip a drop into a credit — which is
   * the one way this column could put money into a drawer that left it.
   */
  it("ignores a negative amount rather than letting it reverse the direction", () => {
    expect(cashMovementDelta({ type: "DROP_TO_SAFE", baseAmount: "-200" }).toFixed(2)).toBe(
      "-200.00",
    );
    expect(cashMovementDelta({ type: "FLOAT_TOP_UP", baseAmount: "-80" }).toFixed(2)).toBe(
      "80.00",
    );
  });

  it("has decided a direction for every value in the enum", () => {
    // A value added to the schema without a direction would silently contribute
    // nothing to `expectedCash`, which is this whole defect again.
    for (const type of RETAIL_CASH_MOVEMENT_TYPES) {
      expect([1, -1]).toContain(RETAIL_CASH_MOVEMENT_DIRECTION[type]);
    }
    expect(Object.keys(RETAIL_CASH_MOVEMENT_DIRECTION).sort()).toEqual(
      [...RETAIL_CASH_MOVEMENT_TYPES].sort(),
    );
  });
});

describe("a ZWG drop out of a USD-priced drawer", () => {
  /**
   * R-1.5's case, and the reason the row carries the currency trio. A bottle store
   * prices in USD and takes ZWG all day; a bundle of ZWG notes banked to the safe
   * is not its face value off a USD expected figure.
   *
   * 5,500 ZWG at 27.5 to the dollar is $200.00. `expectedCash` moves by the base
   * amount, never by `amount`.
   */
  it("takes the converted value off, not the face value", () => {
    const expected = expectedCashForShift({
      openingFloat: OPENING_FLOAT,
      cashTakings: CASH_TAKINGS,
      // 5500 ZWG ÷ 27.5 = 200.00 USD, as `buildCashMovementAmounts` computes it.
      movements: [{ type: "DROP_TO_SAFE", baseAmount: "200.00" }],
    });
    expect(expected.toFixed(2)).toBe("1356.75");

    // The face value would have wiped the drawer out several times over.
    const wrong = expectedCashForShift({
      openingFloat: OPENING_FLOAT,
      cashTakings: CASH_TAKINGS,
      movements: [{ type: "DROP_TO_SAFE", baseAmount: "5500.00" }],
    });
    expect(wrong.toFixed(2)).toBe("-3943.25");
  });
});

describe("cash taken across the counter, when it is not all one currency", () => {
  /**
   * The second defect of the same family, and the worse one. S-7.1 fixed cash
   * *leaving* the drawer; this is cash going into it.
   *
   * `getCashNetFromPayments` summed `payment.amount` and read no currency at
   * all, so a 5,500 ZWG note tendered against a USD-priced basket added 5,500 to
   * a drawer denominated in dollars. A drop only happens when a manager banks
   * cash; this was wrong on *every* sale settled in the other currency, which in
   * a Harare bottle store is roughly one in twelve — and the cashier wore the
   * difference.
   */
  it("counts a ZWG tender at what it is worth, not at its face value", () => {
    // One basket, priced $200.00, settled with 5,500 ZWG at 27.5.
    const net = getCashNetFromPayments([
      { tenderType: "CASH", baseAmount: "200.00" },
    ]);
    expect(net.toFixed(2)).toBe("200.00");

    // What the old sum did: the face value of the notes, straight onto a
    // dollar-denominated drawer.
    const faceValue = getCashNetFromPayments([
      { tenderType: "CASH", baseAmount: "5500.00" },
    ]);
    expect(faceValue.toFixed(2)).toBe("5500.00");
    expect(faceValue.minus(net).toFixed(2)).toBe("5300.00");
  });

  it("adds a split basket up in one denomination", () => {
    // $12.40 of Castle and Chibuku: a $10 note and 66 ZWG, at 27.5 → $2.40.
    const net = getCashNetFromPayments([
      { tenderType: "CASH", baseAmount: "10.00" },
      { tenderType: "CASH", baseAmount: "2.40" },
    ]);
    expect(net.toFixed(2)).toBe("12.40");
  });

  it("ignores the tenders that never reach the drawer", () => {
    // EcoCash and card do not put notes in the till, so they must not move the
    // figure the cashier is counted against — however they were denominated.
    const net = getCashNetFromPayments([
      { tenderType: "CASH", baseAmount: "40.00" },
      { tenderType: "MOBILE_MONEY", baseAmount: "35.00" },
      { tenderType: "CARD", baseAmount: "18.50" },
      { tenderType: "TRANSFER", baseAmount: "60.00" },
    ]);
    expect(net.toFixed(2)).toBe("40.00");
  });

  it("takes the change back out, in the same denomination", () => {
    // $48.30 basket, $50 tendered, $1.70 change. Both already in base currency —
    // the caller converts, because only it knows the rate the sale used.
    const net = getCashNetFromPayments(
      [{ tenderType: "CASH", baseAmount: "50.00" }],
      "1.70",
    );
    expect(net.toFixed(2)).toBe("48.30");
  });

  it("goes negative on a cash refund, which is what keeps the drawer honest", () => {
    // A refund posts as a reversing sale with negated payment rows, so it pulls
    // the expected figure down on its own. Subtracting it a second time as a
    // payout is the bug the Friday test above pins from the other direction.
    const net = getCashNetFromPayments([
      { tenderType: "CASH", baseAmount: "-47.60" },
    ]);
    expect(net.toFixed(2)).toBe("-47.60");
  });
});

describe("the denominations a drawer is counted in", () => {
  it("offers the prototype's USD set, largest first", () => {
    // `docs/design-system/portals/pos.html`, `const DENOMS`, verbatim.
    expect(getCashDenominations("USD")).toEqual([
      "100",
      "50",
      "20",
      "10",
      "5",
      "2",
      "1",
      "0.50",
      "0.10",
    ]);
  });

  it("does not hand ZWG the USD set", () => {
    expect(getCashDenominations("ZWG")).not.toEqual(getCashDenominations("USD"));
  });

  it("says nothing rather than guessing for a currency nobody configured", () => {
    // The till falls back to the keypad. Inventing a note that does not exist would
    // put a fiction into a safe log.
    expect(getCashDenominations("GBP")).toBeNull();
    expect(getCashDenominations("")).toBeNull();
    expect(getCashDenominations(null)).toBeNull();
  });

  it("counts three ten-cent coins as 0.30, where a double gives 0.30000000000000004", () => {
    expect(0.1 * 3).not.toBe(0.3);
    expect(totalFromDenominations([{ denomination: "0.10", count: 3 }]).toFixed(2)).toBe(
      "0.30",
    );
  });

  it("counts a full drawer without drift", () => {
    // Every USD denomination, one of each: 100+50+20+10+5+2+1+0.50+0.10 = 188.60.
    const oneOfEach = (getCashDenominations("USD") ?? []).map((denomination) => ({
      denomination,
      count: 1,
    }));
    expect(totalFromDenominations(oneOfEach).toFixed(2)).toBe("188.60");
  });
});
