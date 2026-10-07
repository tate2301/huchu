import { describe, expect, it } from "vitest";

import {
  coverDays,
  coverFill,
  coverLabel,
  netSold,
  onHandLabel,
  productStock,
  unitWord,
  vatLabel,
} from "./figures";

/** The ProductsList board's rows: on hand, sold in 30 days, reorder at. */
const BOARD = [
  { name: "Amarula Cream 750ml", onHand: 13, sold30: 64, reorderAt: 12, days: 6, stock: "Low" },
  { name: "Bohlinger’s 330ml", onHand: 96, sold30: 70, reorderAt: 36, days: 41, stock: "In stock" },
  { name: "Castle Lager 340ml", onHand: 26, sold30: 88, reorderAt: 96, days: 9, stock: "Low" },
  { name: "Castle Lager case of 24", onHand: 22, sold30: 55, reorderAt: 8, days: 12, stock: "In stock" },
  { name: "Chibuku Scud 1L", onHand: 210, sold30: 350, reorderAt: 60, days: 18, stock: "In stock" },
  { name: "Coca-Cola 500ml", onHand: 180, sold30: 216, reorderAt: 48, days: 25, stock: "In stock" },
  { name: "Gordon’s Gin 750ml", onHand: 18, sold30: 67, reorderAt: 6, days: 8, stock: "In stock" },
  { name: "Jameson Irish Whiskey 750ml", onHand: 9, sold30: 121, reorderAt: 12, days: 2, stock: "Low" },
  { name: "Johnnie Walker Black 750ml", onHand: 6, sold30: 58, reorderAt: 12, days: 3, stock: "Low" },
] as const;

describe("Products' figures (20-products 3.2)", () => {
  it("cover is on hand over the 30-day rate, in whole days, as the board reads", () => {
    for (const row of BOARD) {
      expect(coverDays(row.onHand, row.sold30), row.name).toBe(row.days);
    }
    expect(coverLabel(6)).toBe("6 days");
    expect(coverLabel(1)).toBe("1 day");
  });

  it("nothing sold has no cover: a dash, an empty bar", () => {
    expect(coverDays(144, 0)).toBeNull();
    expect(coverLabel(null)).toBeNull();
    expect(coverFill(null)).toBe(0);
  });

  it("the bar fills 20 days to the full width and warns under 7 days (35%)", () => {
    expect(coverFill(6)).toBe(30);
    expect(coverFill(9)).toBe(45);
    expect(coverFill(41)).toBe(100);
  });

  it("low is STK-01's rule: at or under reorder, or under 7 days of cover; never when archived", () => {
    for (const row of BOARD) {
      expect(productStock({ ...row, archived: false }), row.name).toBe(row.stock);
    }
    expect(productStock({ onHand: 0, reorderAt: 6, sold30: 0, archived: false })).toBe("Out");
    expect(productStock({ onHand: 6, reorderAt: 6, sold30: 0, archived: true })).toBe("In stock");
  });

  it("on hand carries its unit word, singular for one", () => {
    expect(onHandLabel(13, "bottle")).toBe("13 bottles");
    expect(onHandLabel(22, "case")).toBe("22 cases");
    expect(onHandLabel(1, "bottle")).toBe("1 bottle");
    expect(unitWord(210, "carton")).toBe("cartons");
    expect(unitWord(40, "bag")).toBe("bags");
    expect(unitWord(5, null)).toBe("");
  });

  it("sold is net of refunds, never below nothing; VAT prints as a percentage", () => {
    expect(netSold(90, 2)).toBe(88);
    expect(netSold(1, -3)).toBe(0);
    expect(vatLabel(15)).toBe("15%");
    expect(vatLabel(0)).toBe("0%");
  });
});
