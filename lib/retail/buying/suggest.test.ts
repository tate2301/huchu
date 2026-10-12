/**
 * What New order suggests (40-buying W-30 "Suggested lines"): low lines by
 * STK-01's own rule, the line's reorder quantity first, else 14 days and the
 * lead time at the 30-day rate less what is on hand, rounded up to a case;
 * usual lines at the median of the last orders; low first by cover, then
 * usual by name; and the supplier most of the asked-for products name.
 */
import { describe, expect, it } from "vitest";

import { lowQuantity, lowSub, planSuggestions, presetSupplier, type SuggestInput } from "./suggest";

const line = (over: Partial<SuggestInput>): SuggestInput => ({
  productId: over.name ?? "p",
  inventoryItemId: "i",
  name: "Castle Lager 340ml",
  onHand: 100,
  reorderAt: null,
  reorderQty: null,
  sold30: 0,
  archived: false,
  caseSize: null,
  lastOrders: [],
  cost: 0.86,
  vatRate: 15.5,
  ...over,
});

describe("a low line", () => {
  it("is low by the stock rule: at its reorder level, or under a week of cover", () => {
    const [atLevel] = planSuggestions([line({ onHand: 18, reorderAt: 24, sold30: 30 })], 2);
    expect(atLevel).toMatchObject({ kind: "low", warn: true, sub: "Low: 18 left, sells 1 a day" });
    const [thin] = planSuggestions([line({ onHand: 18, sold30: 930 })], 2);
    expect(thin).toMatchObject({ kind: "low", sub: "Low: 18 left, sells 31 a day" });
    expect(planSuggestions([line({ onHand: 500, sold30: 30 })], 2)).toEqual([]);
  });

  it("asks for the reorder quantity when the line has one", () => {
    expect(lowQuantity(line({ onHand: 18, reorderQty: 96, sold30: 930 }), 2)).toBe(96);
  });

  it("else enough for 14 days and the lead time at the 30-day rate, less what is on hand", () => {
    // 31 a day × 16 days = 496, less 18 on hand.
    expect(lowQuantity(line({ onHand: 18, sold30: 930 }), 2)).toBe(478);
  });

  it("rounds up to a whole case, and asks for at least one", () => {
    expect(lowQuantity(line({ onHand: 18, sold30: 930, caseSize: 24 }), 2)).toBe(480);
    expect(lowQuantity(line({ onHand: 0, sold30: 0 }), 2)).toBe(1);
  });

  it("says how many are left without a rate when it has not sold", () => {
    expect(lowSub({ onHand: 3, sold30: 0 })).toBe("Low: 3 left");
  });
});

describe("usual lines and the order", () => {
  it("suggests the median of the last orders for a line on two of the last three", () => {
    const [usual] = planSuggestions([line({ name: "Sprite 500ml", lastOrders: [120, 96, 144] })], 2);
    expect(usual).toMatchObject({ kind: "usual", sub: "Usual order", warn: false, quantity: 120 });
    expect(planSuggestions([line({ name: "Fanta 500ml", lastOrders: [48] })], 2)).toEqual([]);
  });

  it("puts low lines first, least cover first, then usual ones by name", () => {
    const planned = planSuggestions(
      [
        line({ name: "Sprite 500ml", lastOrders: [120, 120] }),
        line({ name: "Chibuku Scud 1L", onHand: 22, sold30: 1200 }),
        line({ name: "Coca-Cola 500ml", lastOrders: [180, 180] }),
        line({ name: "Castle Lager 340ml", onHand: 18, sold30: 930 }),
      ],
      2,
    );
    expect(planned.map((row) => row.name)).toEqual(["Chibuku Scud 1L", "Castle Lager 340ml", "Coca-Cola 500ml", "Sprite 500ml"]);
  });

  it("orders exactly the products asked for, with the quantity named for one", () => {
    const asked = planSuggestions([line({ name: "Jameson 750ml", onHand: 40, sold30: 30 })], 2, { quantity: 24 });
    expect(asked).toEqual([expect.objectContaining({ name: "Jameson 750ml", kind: "asked", quantity: 24 })]);
  });

  it("presets the supplier most of the asked products name", () => {
    expect(
      presetSupplier([
        { supplierId: "afdis", supplierName: "Afdis Distillers" },
        { supplierId: "delta", supplierName: "Delta Beverages" },
        { supplierId: "delta", supplierName: "Delta Beverages" },
        { supplierId: null, supplierName: null },
      ]),
    ).toBe("delta");
    expect(presetSupplier([{ supplierId: null, supplierName: null }])).toBeNull();
  });
});
