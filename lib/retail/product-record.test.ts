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
  reorderQty: 12,
  category: "Spirits",
  categoryId: "c1",
  returnable: false,
  depositAmount: null,
  ownAgeRestricted: null as boolean | null,
  maxDiscountPercent: null as number | null,
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

  it("writes the ID check as the product's own answer, and the discount ceiling as a percentage", () => {
    expect(
      productChanges(["ageRestricted", "maxDiscountPercent"], before, { ...before, ownAgeRestricted: false, maxDiscountPercent: 5 }),
    ).toEqual([
      { field: "ageRestricted", label: "ID check", kind: "text", from: "As category", to: "No" },
      { field: "maxDiscountPercent", label: "Most off", kind: "percent", from: null, to: "5" },
    ]);
  });

  it("writes reorder levels and quantities as counts and VAT as a percentage", () => {
    expect(
      productChanges(["reorderLevel", "reorderQty", "taxPercent"], before, { ...before, reorderLevel: 12, reorderQty: 24, taxPercent: 0 }),
    ).toEqual([
      { field: "reorderLevel", label: "Reorder at", kind: "count", from: "6", to: "12" },
      { field: "reorderQty", label: "Reorder", kind: "count", from: "12", to: "24" },
      { field: "taxPercent", label: "VAT", kind: "percent", from: "15", to: "0" },
    ]);
  });
});
