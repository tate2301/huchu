import { describe, expect, it } from "vitest";

import { productChanges } from "./product-record";

const before = {
  name: "Amarula Cream 750ml",
  sku: "AMARULA-750",
  barcode: null,
  description: null,
  unitPrice: 18.25,
  compareAtPrice: null,
  taxPercent: 15,
  costPrice: 14.1,
  reorderLevel: 6,
  category: "Spirits",
  categoryId: "c1",
  returnable: false,
  depositAmount: null,
  status: "ACTIVE",
  imageUrl: null,
};

describe("what an edit changed (W-62)", () => {
  it("names each sent field that moved, money as a fixed string", () => {
    expect(productChanges(["unitPrice"], before, { ...before, unitPrice: 18.5 })).toEqual([
      { field: "unitPrice", label: "Price", kind: "money", from: "18.25", to: "18.50" },
    ]);
  });

  it("leaves out a field sent at its old value, and fields not sent", () => {
    expect(productChanges(["unitPrice", "name"], before, { ...before, taxPercent: 0 })).toEqual([]);
  });

  it("reads a category by its name and a blank barcode as nothing", () => {
    expect(
      productChanges(["categoryId", "barcode"], before, { ...before, categoryId: "c2", category: "Liqueur", barcode: "6001232 35259" }),
    ).toEqual([
      { field: "categoryId", label: "Category", kind: "text", from: "Spirits", to: "Liqueur" },
      { field: "barcode", label: "Barcode", kind: "text", from: null, to: "6001232 35259" },
    ]);
  });

  it("writes reorder levels as counts and VAT as a percentage", () => {
    expect(productChanges(["reorderLevel", "taxPercent"], before, { ...before, reorderLevel: 12, taxPercent: 0 })).toEqual([
      { field: "reorderLevel", label: "Reorder at", kind: "count", from: "6", to: "12" },
      { field: "taxPercent", label: "VAT", kind: "percent", from: "15", to: "0" },
    ]);
  });
});
