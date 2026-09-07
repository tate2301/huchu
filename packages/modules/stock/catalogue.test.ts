import { describe, expect, it } from "vitest";

import {
  applyLineOverrides,
  choosePriceList,
  isStockable,
  resolvePrice,
  toCatalogueLine,
  unitLabel,
  validatePriceList,
  type CatalogueProduct,
} from "./catalogue";
import {
  catalogueDestinations,
  crmAdapter,
  getCatalogueAdapter,
  registerCatalogueAdapter,
  retailAdapter,
  workOrderAdapter,
} from "./catalogue-adapters";

const panel: CatalogueProduct = {
  id: "p-1",
  code: "SOL-450",
  name: "450W solar panel",
  kind: "GOODS",
  unit: "EACH",
  standardPrice: 100,
  costPrice: 60,
  defaultTaxRate: 15,
  maxDiscountPercent: 10,
};

const labour: CatalogueProduct = {
  id: "p-2",
  code: "LAB-INST",
  name: "Installation labour",
  kind: "LABOUR",
  unit: "HOUR",
  standardPrice: 25,
  defaultTaxRate: 15,
};

describe("isStockable", () => {
  it("is true only for things that can sit on a shelf", () => {
    expect(isStockable("GOODS")).toBe(true);
    expect(isStockable("MATERIAL")).toBe(true);
    // "How many hours are in stock" is a category error.
    expect(isStockable("SERVICE")).toBe(false);
    expect(isStockable("LABOUR")).toBe(false);
  });
});

describe("unitLabel", () => {
  it("uses the standard label", () => {
    expect(unitLabel({ unit: "SQUARE_METRE" })).toBe("m²");
    expect(unitLabel({ unit: "HOUR" })).toBe("hour");
  });

  it("uses the custom label only for OTHER", () => {
    expect(unitLabel({ unit: "OTHER", unitLabel: "per pallet" })).toBe("per pallet");
    expect(unitLabel({ unit: "EACH", unitLabel: "per pallet" })).toBe("each");
  });

  it("falls back when OTHER carries no label", () => {
    expect(unitLabel({ unit: "OTHER", unitLabel: "  " })).toBe("unit");
  });
});

describe("resolvePrice", () => {
  it("falls back to the standard price when no list applies", () => {
    const result = resolvePrice({ standardPrice: 100 });
    expect(result).toEqual({ unitPrice: 100, source: "STANDARD" });
  });

  it("uses the list price over the standard price", () => {
    const result = resolvePrice({
      standardPrice: 100,
      entries: [{ minQuantity: 1, unitPrice: 90 }],
      priceListId: "pl-1",
    });
    expect(result.unitPrice).toBe(90);
    expect(result.source).toBe("PRICE_LIST");
  });

  it("takes the best volume break the quantity qualifies for", () => {
    const entries = [
      { minQuantity: 1, unitPrice: 90 },
      { minQuantity: 10, unitPrice: 80 },
      { minQuantity: 50, unitPrice: 70 },
    ];
    expect(resolvePrice({ standardPrice: 100, quantity: 5, entries }).unitPrice).toBe(90);
    expect(resolvePrice({ standardPrice: 100, quantity: 10, entries }).unitPrice).toBe(80);
    expect(resolvePrice({ standardPrice: 100, quantity: 999, entries }).unitPrice).toBe(70);
  });

  it("distinguishes a volume break, so a price that moved can be explained", () => {
    const entries = [
      { minQuantity: 1, unitPrice: 90 },
      { minQuantity: 10, unitPrice: 80 },
    ];
    expect(resolvePrice({ standardPrice: 100, quantity: 20, entries }).source).toBe("VOLUME_BREAK");
    expect(resolvePrice({ standardPrice: 100, quantity: 2, entries }).source).toBe("PRICE_LIST");
  });

  it("ignores breaks above the quantity ordered", () => {
    const result = resolvePrice({
      standardPrice: 100,
      quantity: 2,
      entries: [{ minQuantity: 10, unitPrice: 80 }],
    });
    expect(result.unitPrice).toBe(100);
    expect(result.source).toBe("STANDARD");
  });
});

describe("choosePriceList", () => {
  const lists = [
    { id: "std", isDefault: true, isActive: true },
    { id: "trade", isDefault: false, isActive: true },
    { id: "old", isDefault: false, isActive: false },
  ];

  it("honours an explicit choice first", () => {
    expect(choosePriceList(lists, { priceListId: "trade" })?.id).toBe("trade");
  });

  it("falls back to the customer's own list, then the company default", () => {
    expect(choosePriceList(lists, { customerPriceListId: "trade" })?.id).toBe("trade");
    expect(choosePriceList(lists)?.id).toBe("std");
  });

  it("never picks an inactive list, even when named", () => {
    // A retired list must not quietly come back because an old record points at it.
    expect(choosePriceList(lists, { priceListId: "old" })?.id).toBe("std");
  });

  it("returns nothing when there is no list at all", () => {
    expect(choosePriceList([])).toBeNull();
  });
});

describe("toCatalogueLine", () => {
  it("carries the facts a document needs", () => {
    const line = toCatalogueLine(panel, { quantity: 3 });
    expect(line).toMatchObject({
      productId: "p-1",
      code: "SOL-450",
      description: "450W solar panel",
      quantity: 3,
      unitPrice: 100,
      taxRate: 15,
      unit: "each",
      costPrice: 60,
      maxDiscountPercent: 10,
    });
  });

  it("prices a service with no cost and no discount ceiling", () => {
    const line = toCatalogueLine(labour, { quantity: 8 });
    expect(line.costPrice).toBeNull();
    expect(line.maxDiscountPercent).toBeNull();
    expect(line.unit).toBe("hour");
  });
});

describe("applyLineOverrides", () => {
  const line = toCatalogueLine(panel, { quantity: 2 });

  it("lets a document say something different without touching the catalogue", () => {
    // A quote sent in March must still say what it said in March.
    const edited = applyLineOverrides(line, {
      description: "450W panel — customer's own mounts",
      unitPrice: 85,
      quantity: 4,
    });
    expect(edited.description).toBe("450W panel — customer's own mounts");
    expect(edited.unitPrice).toBe(85);
    expect(edited.quantity).toBe(4);
    // The catalogue line it came from is untouched.
    expect(line.unitPrice).toBe(100);
  });

  it("ignores a blank description rather than wiping the line", () => {
    expect(applyLineOverrides(line, { description: "   " }).description).toBe(panel.name);
  });

  it("keeps a zero price, which is a real thing to quote", () => {
    expect(applyLineOverrides(line, { unitPrice: 0 }).unitPrice).toBe(0);
  });
});

describe("validatePriceList", () => {
  it("insists a regional list names its region", () => {
    expect(validatePriceList({ kind: "REGIONAL" })).toContain("which region");
    expect(validatePriceList({ kind: "REGIONAL", region: "Matabeleland" })).toBeNull();
  });

  it("asks nothing of the other kinds", () => {
    expect(validatePriceList({ kind: "WHOLESALE" })).toBeNull();
  });
});

describe("module adapters", () => {
  const line = toCatalogueLine(panel, { quantity: 3 });

  it("gives the CRM a document line the accounting bridge accepts", () => {
    expect(crmAdapter.toLine(line)).toEqual({
      description: "450W solar panel",
      quantity: 3,
      unitPrice: 100,
      taxRate: 15,
    });
  });

  it("gives retail a till line keyed by SKU", () => {
    expect(retailAdapter.toLine(line)).toMatchObject({
      sku: "SOL-450",
      qty: 3,
      unitPrice: 100,
      taxPercent: 15,
    });
  });

  it("leaves money off a crew's job sheet", () => {
    const task = workOrderAdapter.toLine(line);
    expect(task).toEqual({
      productId: "p-1",
      description: "450W solar panel",
      quantity: 3,
      unit: "each",
    });
    expect(task).not.toHaveProperty("unitPrice");
  });

  it("resolves a registered adapter by module key", () => {
    expect(getCatalogueAdapter("crm")).toBe(crmAdapter);
    expect(getCatalogueAdapter("nope")).toBeNull();
  });

  it("lets a new module join without the catalogue knowing about it", () => {
    // The extensibility claim, exercised: register and it shows up.
    registerCatalogueAdapter({
      module: "workshop",
      label: "Job card",
      toLine: (input) => ({ task: input.description }),
    });
    expect(catalogueDestinations(line).map((entry) => entry.module)).toContain("workshop");
    expect(getCatalogueAdapter<{ task: string }>("workshop")?.toLine(line)).toEqual({
      task: "450W solar panel",
    });
  });
});
