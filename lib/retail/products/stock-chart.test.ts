/**
 * When it runs out (PRD-04): a product's on hand day by day is each line's
 * own balance, carried over quiet days and summed over its sites; the dashed
 * days ahead stop at the run-out day or two weeks; the advice orders the
 * Reorder quantity (else two weeks' worth) the supplier's lead time early.
 */
import { describe, expect, it } from "vitest";

import { dayBalances, dayWords, runOut, runOutChip, stockAdvice, type ChartMovement } from "./stock-chart";

const at = (day: string, time = "10:00") => new Date(`${day}T${time}:00+02:00`);

describe("on hand day by day", () => {
  it("takes each line's last balance of the day, carries it over quiet days, and sums the sites", () => {
    const movements: ChartMovement[] = [
      { lineId: "hre", at: at("2026-10-02", "09:00"), reason: "SALE", change: -1, balanceAfter: 19 },
      { lineId: "hre", at: at("2026-10-02", "16:00"), reason: "SALE", change: -2, balanceAfter: 17 },
      { lineId: "hre", at: at("2026-10-02", "16:05"), reason: "RECEIVED", change: 24, balanceAfter: 41 },
      // A move between the shop's sites: neither sold nor received.
      { lineId: "hre", at: at("2026-10-04"), reason: "TRANSFER_OUT", change: -4, balanceAfter: 37 },
      { lineId: "brw", at: at("2026-10-04", "12:00"), reason: "TRANSFER_IN", change: 4, balanceAfter: 4 },
      { lineId: "hre", at: at("2026-10-05"), reason: "REFUND", change: 1, balanceAfter: 38 },
    ];
    const days = dayBalances({
      openings: new Map([
        ["hre", 20],
        ["brw", 0],
      ]),
      movements,
      from: "2026-10-01",
      to: "2026-10-06",
    });
    expect(days).toEqual([
      { date: "2026-10-01", onHand: 20, sold: 0, received: 0 },
      { date: "2026-10-02", onHand: 41, sold: 3, received: 24 },
      { date: "2026-10-03", onHand: 41, sold: 0, received: 0 },
      { date: "2026-10-04", onHand: 41, sold: 0, received: 0 },
      { date: "2026-10-05", onHand: 42, sold: -1, received: 0 },
      { date: "2026-10-06", onHand: 42, sold: 0, received: 0 },
    ]);
  });

  it("reads the balance each movement left, never the quantities added up", () => {
    // A count set the line to 8 although the movement says −2: the balance wins.
    const days = dayBalances({
      openings: new Map([["hre", 12]]),
      movements: [{ lineId: "hre", at: at("2026-10-02"), reason: "COUNT", change: -2, balanceAfter: 8 }],
      from: "2026-10-02",
      to: "2026-10-02",
    });
    expect(days[0]!.onHand).toBe(8);
  });
});

describe("the day it runs out", () => {
  it("is the cover the KPI reads, and the dashed line stops there", () => {
    const out = runOut(13, 64, "2026-10-03");
    expect(out.runsOutIn).toBe(6);
    expect(out.runsOutOn).toBe("2026-10-09");
    // Today and the 7 days to nothing (13 ÷ 2.13 = 6.1, so the 7th reaches 0).
    expect(out.projection).toHaveLength(8);
    expect(out.projection[0]).toEqual({ date: "2026-10-03", onHand: 13 });
    expect(out.projection.at(-1)).toEqual({ date: "2026-10-10", onHand: 0 });
  });

  it("draws two weeks at most, nothing while it does not sell, and today when it is out", () => {
    expect(runOut(200, 30, "2026-10-03").projection).toHaveLength(15);
    expect(runOut(13, 0, "2026-10-03")).toEqual({ runsOutOn: null, runsOutIn: null, projection: [] });
    expect(runOut(0, 30, "2026-10-03")).toEqual({ runsOutOn: "2026-10-03", runsOutIn: 0, projection: [] });
  });

  it("says when in the chip", () => {
    expect(runOutChip({ onHand: 13, runsOutOn: "2026-10-09", runsOutIn: 6 })).toEqual({ label: "Around 9 October, in 6 days", tone: "warn" });
    expect(runOutChip({ onHand: 0, runsOutOn: "2026-10-03", runsOutIn: 0 })).toEqual({ label: "Out now", tone: "bad" });
    expect(runOutChip({ onHand: 13, runsOutOn: null, runsOutIn: null })).toBeNull();
  });
});

describe("what to order by when", () => {
  const afdis = { name: "Afdis Distillers", leadTimeDays: 2 };

  it("orders the Reorder quantity the lead time before it runs out, naming the weekday within a week", () => {
    // Saturday 3 October; it runs out Friday 9th; Afdis takes 2 days, so by Wednesday.
    expect(dayWords("2026-10-07", "2026-10-03")).toBe("Wednesday");
    expect(stockAdvice({ perDay: 2.1, runsOutOn: "2026-10-09", today: "2026-10-03", reorderQty: 24, supplier: afdis })).toEqual({
      sentence: "Order 24 by Wednesday to cover the next two weeks; Afdis delivers in 2 days.",
      orderQuantity: 24,
    });
  });

  it("names the weekday up to six days ahead, and the date from a week on (never today's own weekday)", () => {
    // Wednesday 7 October.
    expect(dayWords("2026-10-13", "2026-10-07")).toBe("Tuesday");
    expect(dayWords("2026-10-14", "2026-10-07")).toBe("14 October");
    expect(stockAdvice({ perDay: 2, runsOutOn: "2026-10-16", today: "2026-10-07", reorderQty: 24, supplier: afdis })?.sentence).toBe(
      "Order 24 by 14 October to cover the next two weeks; Afdis delivers in 2 days.",
    );
  });

  it("without a lead time orders by the run-out day; without a Reorder quantity, two weeks at the rate", () => {
    expect(
      stockAdvice({ perDay: 2.1, runsOutOn: "2026-10-30", today: "2026-10-03", reorderQty: null, supplier: { name: "Delta Beverages", leadTimeDays: null } }),
    ).toEqual({ sentence: "Order 30 by 30 October to cover the next two weeks.", orderQuantity: 30 });
  });

  it("says today once the order-by day has come, and says nothing without a supplier or a quantity, or while it does not sell", () => {
    expect(stockAdvice({ perDay: 2, runsOutOn: "2026-10-04", today: "2026-10-03", reorderQty: 24, supplier: afdis })?.sentence).toBe(
      "Order 24 today to cover the next two weeks; Afdis delivers in 2 days.",
    );
    expect(stockAdvice({ perDay: 2, runsOutOn: "2026-10-09", today: "2026-10-03", reorderQty: null, supplier: null })).toBeNull();
    expect(stockAdvice({ perDay: 0, runsOutOn: null, today: "2026-10-03", reorderQty: 24, supplier: afdis })).toBeNull();
  });
});
