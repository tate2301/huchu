import { describe, expect, it } from "vitest";

import { draftToLine, lineTotals, type DocumentLineDraft } from "./document-math";

function line(overrides: Partial<DocumentLineDraft> = {}): DocumentLineDraft {
  return {
    description: "Item",
    quantity: "1",
    unitPrice: "100",
    discountPercent: "",
    taxRate: "",
    ...overrides,
  };
}

describe("draftToLine", () => {
  it("passes an undiscounted line through untouched", () => {
    expect(draftToLine(line({ quantity: "3", unitPrice: "250" }))).toEqual({
      description: "Item",
      quantity: 3,
      unitPrice: 250,
    });
  });

  it("folds a line discount into the unit price and names it", () => {
    expect(draftToLine(line({ unitPrice: "200", discountPercent: "10" }))).toEqual({
      description: "Item (10% discount applied)",
      quantity: 1,
      unitPrice: 180,
    });
  });

  it("compounds line and document discounts", () => {
    // 200 → 10% off → 180 → 50% off → 90
    expect(draftToLine(line({ unitPrice: "200", discountPercent: "10" }), 50)).toEqual({
      description: "Item (10% discount, 50% document discount applied)",
      quantity: 1,
      unitPrice: 90,
    });
  });

  it("never produces a negative unit price, which the API would reject", () => {
    const result = draftToLine(line({ unitPrice: "100", discountPercent: "500" }));
    expect(result?.unitPrice).toBe(0);
  });

  it("ignores a negative discount rather than inflating the price", () => {
    expect(draftToLine(line({ unitPrice: "100", discountPercent: "-20" }))?.unitPrice).toBe(100);
  });

  it("carries a tax rate through and omits it when blank", () => {
    expect(draftToLine(line({ taxRate: "15" }))?.taxRate).toBe(15);
    expect(draftToLine(line({ taxRate: "" }))).not.toHaveProperty("taxRate");
  });

  it("drops rows with no description or a non-positive quantity", () => {
    expect(draftToLine(line({ description: "  " }))).toBeNull();
    expect(draftToLine(line({ quantity: "0" }))).toBeNull();
    expect(draftToLine(line({ quantity: "-2" }))).toBeNull();
  });

  it("treats unparseable numbers as sensible defaults", () => {
    const result = draftToLine(line({ quantity: "abc", unitPrice: "xyz" }));
    expect(result).toEqual({ description: "Item", quantity: 1, unitPrice: 0 });
  });
});

describe("lineTotals", () => {
  it("sums a simple document", () => {
    const totals = lineTotals([line({ quantity: "2", unitPrice: "150" })], 0);
    expect(totals.subTotal).toBe(300);
    expect(totals.taxTotal).toBe(0);
    expect(totals.total).toBe(300);
  });

  it("reports line discounts separately from the list total", () => {
    const totals = lineTotals([line({ unitPrice: "200", discountPercent: "25" })], 0);
    expect(totals.listTotal).toBe(200);
    expect(totals.lineDiscount).toBe(50);
    expect(totals.subTotal).toBe(150);
  });

  it("applies a document discount on top of line discounts", () => {
    const totals = lineTotals([line({ unitPrice: "200", discountPercent: "10" })], 50);
    expect(totals.docDiscountAmount).toBe(90);
    expect(totals.subTotal).toBe(90);
  });

  it("taxes the discounted base, not the list price", () => {
    const totals = lineTotals([line({ unitPrice: "100", taxRate: "10" })], 50);
    expect(totals.subTotal).toBe(50);
    // 10% of 50, not 10% of 100 — taxing the pre-discount price would overcharge.
    expect(totals.taxTotal).toBe(5);
    expect(totals.total).toBe(55);
  });

  it("agrees with the lines actually submitted", () => {
    const drafts = [
      line({ description: "A", quantity: "2", unitPrice: "150", discountPercent: "10" }),
      line({ description: "B", quantity: "1", unitPrice: "80" }),
    ];
    const totals = lineTotals(drafts, 20);
    const submitted = drafts
      .map((draft) => draftToLine(draft, 20))
      .filter(Boolean)
      .reduce((sum, entry) => sum + entry!.quantity * entry!.unitPrice, 0);

    expect(Math.abs(totals.subTotal - submitted)).toBeLessThan(0.02);
  });

  it("ignores incomplete rows so a blank line doesn't skew the preview", () => {
    const totals = lineTotals([line({ unitPrice: "100" }), line({ description: "" })], 0);
    expect(totals.subTotal).toBe(100);
  });

  it("handles an empty document without dividing by zero", () => {
    const totals = lineTotals([], 25);
    expect(totals).toEqual({
      listTotal: 0,
      lineDiscount: 0,
      docDiscountAmount: 0,
      subTotal: 0,
      taxTotal: 0,
      total: 0,
    });
  });
});
