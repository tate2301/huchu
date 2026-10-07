import { describe, expect, it } from "vitest";

import { missedSales, outSince, stockChange, type MovementForStock } from "./stockouts";

const at = (day: number) => new Date(Date.UTC(2026, 8, day, 12));
const move = (movementType: MovementForStock["movementType"], quantity: number, day: number): MovementForStock => ({
  movementType,
  quantity,
  at: at(day),
});

describe("when the shelf ran empty", () => {
  it("reads each movement's effect on the count", () => {
    expect(stockChange(move("RECEIPT", 24, 1))).toBe(24);
    expect(stockChange(move("ISSUE", 6, 1))).toBe(-6);
    expect(stockChange(move("ADJUSTMENT", -2, 1))).toBe(-2);
    expect(stockChange(move("TRANSFER", 10, 1))).toBe(0);
  });

  it("finds the movement that took the last bottles", () => {
    // 24 in on the 1st, sold down to nothing by the 10th.
    const movements = [move("RECEIPT", 24, 1), move("ISSUE", 12, 4), move("ISSUE", 12, 10)];
    expect(outSince(0, movements)).toEqual(at(10));
  });

  it("finds the latest run-out when it has run out before", () => {
    const movements = [
      move("RECEIPT", 12, 1),
      move("ISSUE", 12, 3),
      move("RECEIPT", 12, 6),
      move("ISSUE", 10, 8),
      move("ADJUSTMENT", -2, 9),
    ];
    expect(outSince(0, movements)).toEqual(at(9));
  });

  it("says nothing while there is stock, or when the movements never show it running out", () => {
    expect(outSince(4, [move("RECEIPT", 4, 1)])).toBeNull();
    expect(outSince(0, [])).toBeNull();
  });
});

describe("sales missed while out", () => {
  // Sold 2 a day at $1.50 for the 28 days before it ran out on the 20th.
  const sales = Array.from({ length: 28 }, (_, index) => ({ quantity: 2, takings: 3, at: at(20 - 28 + index) }));

  it("costs the days empty at the takings a day it made on the shelf", () => {
    const result = missedSales({ outAt: at(20), from: at(1), to: at(30), firstStockedAt: null, sales });
    expect(result.daysOut).toBe(10);
    expect(result.perDay).toBe(2);
    expect(result.missed).toBe(30);
  });

  it("counts only the days empty inside the period", () => {
    const result = missedSales({ outAt: at(20), from: at(25), to: at(30), firstStockedAt: null, sales });
    expect(result.daysOut).toBe(5);
    expect(result.missed).toBe(15);
  });

  it("reads the rate from when it was first stocked, if that is later", () => {
    // On the shelf only 4 days, selling 2 a day, before it ran out.
    const recent = sales.slice(-4);
    const result = missedSales({ outAt: at(20), from: at(1), to: at(30), firstStockedAt: at(16), sales: recent });
    expect(result.perDay).toBe(2);
    expect(result.missed).toBe(30);
  });

  it("ignores sales after the shelf ran empty", () => {
    const result = missedSales({
      outAt: at(20),
      from: at(1),
      to: at(30),
      firstStockedAt: at(19),
      sales: [{ quantity: 1, takings: 1.5, at: at(25) }],
    });
    expect(result.missed).toBe(0);
  });
});
