import { describe, expect, it } from "vitest";

import { priceVerticals, verticalCharge, verticalRate } from "./verticals";

describe("what verticals cost", () => {
  it("is $39 a vertical up to five members", () => {
    expect(verticalRate(1)).toBe(39);
    expect(verticalRate(5)).toBe(39);
    expect(verticalCharge(1, 5).total).toBe(39);
  });

  it("steps up to $99 a vertical from the sixth member", () => {
    expect(verticalRate(6)).toBe(99);
    expect(verticalCharge(1, 6)).toMatchObject({ each: 99, over: true, total: 99 });
  });

  it("charges every vertical at the same rate", () => {
    expect(verticalCharge(2, 4).total).toBe(78);
    expect(verticalCharge(2, 12).total).toBe(198);
    expect(verticalCharge(3, 6).total).toBe(297);
  });

  it("charges nothing without a vertical", () => {
    expect(verticalCharge(0, 20).total).toBe(0);
  });
});

describe("a workspace's price, line by line", () => {
  it("has one line per vertical at the rate the member count sets", () => {
    const price = priceVerticals(["RETAIL", "GOLD"], 6);
    expect(price.total).toBe(198);
    expect(price.lines).toEqual([
      { vertical: "GOLD", label: "Gold operations", detail: "Gold operations, 6 members", amount: 99 },
      { vertical: "RETAIL", label: "Retail", detail: "Retail, 6 members", amount: 99 },
    ]);
  });

  it("says what one more vertical would come to", () => {
    expect(priceVerticals(["RETAIL"], 4).withOneMore).toBe(78);
    expect(priceVerticals(["RETAIL"], 6).withOneMore).toBe(198);
    expect(priceVerticals([], 1).withOneMore).toBe(39);
  });

  it("explains the step-up", () => {
    expect(priceVerticals(["RETAIL"], 6).why).toBe("6 members, over the 5 included, so each vertical is $99.");
    expect(priceVerticals(["RETAIL"], 1).why).toBe("1 member, within the 5 included, so each vertical is $39.");
  });

  it("counts a vertical once however it is listed", () => {
    expect(priceVerticals(["CRM", "CRM"], 2).total).toBe(39);
  });
});
