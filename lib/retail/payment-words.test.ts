import { describe, expect, it } from "vitest";

import {
  formatZigRate,
  merchantCodeProblem,
  rateChangedLine,
  rateSetHint,
  roundingStep,
  splitChange,
  TENDER_OPTIONS,
  tenderKeyOf,
  zigRateProblem,
} from "./payment-words";

describe("payments in words", () => {
  it("lists the tenders in the board's order", () => {
    expect(TENDER_OPTIONS.map((option) => option.label)).toEqual([
      "Cash, US dollars",
      "Cash, ZiG",
      "Card",
      "EcoCash",
      "InnBucks",
      "Bank transfer",
      "On account",
      "Vouchers",
    ]);
  });

  it("tells the two cash drawers apart by currency", () => {
    expect(tenderKeyOf("CASH", "ZWG")).toBe("cashZig");
    expect(tenderKeyOf("CASH", "USD")).toBe("cashUsd");
    expect(tenderKeyOf("CASH", null)).toBe("cashUsd");
    expect(tenderKeyOf("ECOCASH", null)).toBe("ecocash");
    expect(tenderKeyOf("MOBILE_MONEY", null)).toBeNull();
  });

  it("writes a rate with two decimals at least and four at most", () => {
    expect(formatZigRate(26.8)).toBe("26.80");
    expect(formatZigRate("27.1")).toBe("27.10");
    expect(formatZigRate(26.8125)).toBe("26.8125");
    expect(formatZigRate(26.812)).toBe("26.812");
    expect(formatZigRate(27)).toBe("27.00");
  });

  it("refuses a rate that is not a number above nothing, or past four decimals", () => {
    expect(zigRateProblem("26.80")).toBeNull();
    expect(zigRateProblem("26.81255")).toBe("Write the rate as a number, up to four decimals.");
    expect(zigRateProblem("0")).toBe("The rate must be more than nothing.");
    expect(zigRateProblem("100001")).toBe("That rate is too high. Check it.");
    expect(zigRateProblem("abc")).toBe("Write the rate as a number, up to four decimals.");
  });

  it("knows the three rounding steps however they are stored", () => {
    expect(roundingStep("0.5")).toBe("0.50");
    expect(roundingStep("1.00")).toBe("1");
    expect(roundingStep(5)).toBe("5");
    expect(roundingStep("2")).toBeNull();
  });

  it("says when the rate was set, on the shop's clock", () => {
    const now = new Date("2026-10-05T16:00:00+02:00");
    expect(rateSetHint("2026-10-05T07:30:00+02:00", "Tendai Mhlanga", now)).toBe(
      "Set this morning at 07:30 by Tendai Mhlanga.",
    );
    expect(rateSetHint("2026-10-05T13:05:00+02:00", "Tafara Nyathi", now)).toBe(
      "Set this afternoon at 13:05 by Tafara Nyathi.",
    );
    expect(rateSetHint("2026-10-05T18:10:00+02:00", "Tafara Nyathi", new Date("2026-10-05T20:00:00+02:00"))).toBe(
      "Set today at 18:10 by Tafara Nyathi.",
    );
    expect(rateSetHint("2026-10-02T07:25:00+02:00", "Tendai Mhlanga", now)).toBe(
      "Set on 2 October at 07:25 by Tendai Mhlanga.",
    );
    expect(rateSetHint("2026-10-05T07:00:00+02:00", null, now)).toBe("Set this morning at 07:00 by the RBZ.");
    expect(rateSetHint(null, null, now)).toBe("No rate set yet.");
  });

  it("says who changed the rate on the save bar", () => {
    const now = new Date("2026-10-05T16:00:00+02:00");
    expect(rateChangedLine("Tafara Nyathi", "2026-10-05T07:30:00+02:00", now)).toBe(
      "Rate changed by Tafara Nyathi today at 07:30.",
    );
    expect(rateChangedLine("Tendai Mhlanga", "2026-10-02T07:25:00+02:00", now)).toBe(
      "Rate changed by Tendai Mhlanga, 2 October.",
    );
  });

  it("checks the EcoCash merchant code", () => {
    expect(merchantCodeProblem("0921 774")).toBeNull();
    expect(merchantCodeProblem("")).toBeNull();
    expect(merchantCodeProblem("09-21")).toBe("Use digits and spaces only.");
    expect(merchantCodeProblem("1".repeat(21))).toBe("Keep it to 20 characters.");
  });

  it("gives change in dollars, then ZiG for what is under US$1, rounded to the step", () => {
    expect(splitChange(3.4, { rate: 26.8, rounding: "1" })).toEqual({ usd: 3, zig: 11 });
    expect(splitChange(3.4, { rate: 26.8, rounding: "5" })).toEqual({ usd: 3, zig: 10 });
    expect(splitChange(3.4, { rate: 26.8, rounding: "0.50" })).toEqual({ usd: 3, zig: 10.5 });
    expect(splitChange(2, { rate: 26.8, rounding: "1" })).toEqual({ usd: 2, zig: 0 });
    expect(splitChange(3.4, null)).toEqual({ usd: 3.4, zig: 0 });
  });
});
