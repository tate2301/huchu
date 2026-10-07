import { describe, expect, it } from "vitest";

import { countDrawer, DENOMINATIONS, moreThan, needsExplaining, rowTotal, type CountRow } from "./count";

/**
 * Counting a drawer by note (FLR-04): the board's count, the ZiG rounding
 * tolerance, what needs explaining, the float left and what goes to the safe.
 */

const rows = (counts: Record<string, number>): CountRow[] => Object.entries(counts).map(([denomination, count]) => ({ denomination, count }));

// ShiftClose.png: 0×100, 1×50, 2×20, 4×10, 3×5, 5×2, 12×1 = US$167.00; 2×200, 3×100, 4×50, 1×20, 0×10, 1×5 = ZiG 925.00.
const BOARD_USD = rows({ "100": 0, "50": 1, "20": 2, "10": 4, "5": 3, "2": 5, "1": 12 });
const BOARD_ZIG = rows({ "200": 2, "100": 3, "50": 4, "20": 1, "10": 0, "5": 1 });

describe("the board's count", () => {
  it("comes to US$167.00 and ZiG 925.00, US$201.51 at 26.80, and None against US$201.50", () => {
    const count = countDrawer({ usd: BOARD_USD, zig: BOARD_ZIG, rate: "26.80", expected: "201.50", floatLeft: "100.00" });
    expect(count).toEqual({
      countedUsd: "167.00",
      countedZig: "925.00",
      zigBase: "34.51",
      counted: "201.51",
      difference: "0.00",
      state: "BALANCED",
      toSafe: "101.51",
    });
    expect(needsExplaining(count.difference)).toBe(false);
  });

  it("reads each row the way the table does", () => {
    expect(rowTotal({ denomination: "50", count: 1 })).toBe("50.00");
    expect(rowTotal({ denomination: "200", count: 2 })).toBe("400.00");
    expect(rowTotal({ denomination: "100", count: 0 })).toBe("0.00");
  });

  it("counts in notes only, US$ to 1 and ZiG to 5", () => {
    expect(DENOMINATIONS.USD).toEqual(["100", "50", "20", "10", "5", "2", "1"]);
    expect(DENOMINATIONS.ZWG).toEqual(["200", "100", "50", "20", "10", "5"]);
  });
});

describe("the difference", () => {
  it("is short US$4.50 and needs a note", () => {
    const count = countDrawer({ usd: rows({ "50": 1, "20": 2, "10": 4, "5": 3, "2": 5, "1": 3 }), zig: [], rate: null, expected: "162.50", floatLeft: "100.00" });
    expect(count.counted).toBe("158.00");
    expect(count.difference).toBe("-4.50");
    expect(count.state).toBe("SHORT");
    expect(needsExplaining(count.difference)).toBe(true);
  });

  it("needs no note at exactly US$1.00 either way, and one just over", () => {
    expect(needsExplaining("1.00")).toBe(false);
    expect(needsExplaining("-1.00")).toBe(false);
    expect(needsExplaining("1.01")).toBe(true);
    expect(needsExplaining("-1.01")).toBe(true);
  });

  it("calls US$0.04 out the ZiG rounding, and US$0.05 a difference", () => {
    const at = (expected: string) => countDrawer({ usd: rows({ "100": 1 }), zig: [], rate: null, expected, floatLeft: "0" });
    expect(at("99.96")).toMatchObject({ difference: "0.00", state: "BALANCED" });
    expect(at("100.04")).toMatchObject({ difference: "0.00", state: "BALANCED" });
    expect(at("99.95")).toMatchObject({ difference: "0.05", state: "OVER" });
    expect(at("100.05")).toMatchObject({ difference: "-0.05", state: "SHORT" });
  });
});

describe("after closing", () => {
  it("sends what was counted less the float left to the safe", () => {
    const count = countDrawer({ usd: rows({ "100": 2, "20": 1 }), zig: rows({ "200": 1 }), rate: "26.80", expected: "227.46", floatLeft: "120.00" });
    // ZiG 200 at 26.80 = 7.462… → 7.46; 220.00 + 7.46 = 227.46.
    expect(count).toMatchObject({ zigBase: "7.46", counted: "227.46", difference: "0.00", toSafe: "107.46" });
  });

  it("refuses a float left above the US$ notes counted", () => {
    const count = countDrawer({ usd: BOARD_USD, zig: BOARD_ZIG, rate: "26.80", expected: "201.50", floatLeft: "170.00" });
    expect(moreThan("170.00", count.countedUsd)).toBe(true);
    expect(moreThan("167.00", count.countedUsd)).toBe(false);
  });

  it("needs a rate for ZiG notes", () => {
    expect(() => countDrawer({ usd: [], zig: rows({ "50": 1 }), rate: null, expected: "0", floatLeft: "0" })).toThrow(/rate/);
  });
});
