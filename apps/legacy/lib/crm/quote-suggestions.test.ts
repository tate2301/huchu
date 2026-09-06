import { describe, expect, it } from "vitest";

import {
  buildSuggestions,
  catalogueSuggestions,
  visitSuggestions,
  type CatalogueProduct,
  type VisitItemOption,
} from "./quote-suggestions";

function visitItem(overrides: Partial<VisitItemOption> = {}): VisitItemOption {
  return {
    id: "v1",
    description: "Aluminium sliding window",
    quantity: 3,
    unit: "each",
    unitPrice: 240,
    visitLabel: "Roof survey",
    ...overrides,
  };
}

function product(overrides: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: "p1",
    code: "WIN-ALU-12",
    name: "Aluminium window 1200mm",
    isActive: true,
    line: {
      description: "Aluminium window 1200mm",
      unitPrice: 260,
      taxRate: 15,
      priceSource: "standard",
    },
    ...overrides,
  };
}

describe("visitSuggestions", () => {
  it("carries the measured quantity onto the line", () => {
    // The point of measuring three windows is not typing "3" again.
    const [suggestion] = visitSuggestions([visitItem()], "");
    expect(suggestion.pick).toMatchObject({
      description: "Aluminium sliding window",
      unitPrice: 240,
      quantity: 3,
    });
  });

  it("passes an unpriced measurement through as null, not as free", () => {
    // Somebody wrote down a size and left the pricing for later. 0.00 in the
    // box would look like a decision nobody made.
    const [suggestion] = visitSuggestions([visitItem({ unitPrice: null })], "");
    expect(suggestion.pick.unitPrice).toBeNull();
    expect(suggestion.trailing).toBeNull();
  });

  it("says which visit it was measured on, so two surveys stay apart", () => {
    const [suggestion] = visitSuggestions([visitItem()], "");
    expect(suggestion.detail).toBe("3 each · Roof survey");
  });

  it("matches on a substring from the first keystroke", () => {
    const items = [
      visitItem({ id: "a", description: "Aluminium sliding window" }),
      visitItem({ id: "b", description: "Timber door frame" }),
    ];
    expect(visitSuggestions(items, "door").map((s) => s.pick.description)).toEqual([
      "Timber door frame",
    ]);
  });

  it("is case-insensitive, because nobody types the way it was written down", () => {
    expect(visitSuggestions([visitItem()], "ALUMINIUM")).toHaveLength(1);
  });

  it("offers everything before anything is typed", () => {
    const items = [visitItem({ id: "a" }), visitItem({ id: "b" })];
    expect(visitSuggestions(items, "   ")).toHaveLength(2);
  });

  it("drops a measurement with no description — there is nothing to quote", () => {
    expect(visitSuggestions([visitItem({ description: "   " })], "")).toEqual([]);
  });

  it("caps the list so the catalogue is still reachable below it", () => {
    const many = Array.from({ length: 20 }, (_, i) => visitItem({ id: `v${i}` }));
    expect(visitSuggestions(many, "")).toHaveLength(6);
  });
});

describe("catalogueSuggestions", () => {
  it("carries price and tax, which is the whole reason to pick from a list", () => {
    const [suggestion] = catalogueSuggestions([product()]);
    expect(suggestion.pick).toMatchObject({
      productId: "p1",
      description: "Aluminium window 1200mm",
      unitPrice: 260,
      taxRate: 15,
    });
  });

  it("says when a price came off a named list rather than the standard rate", () => {
    const [suggestion] = catalogueSuggestions([
      product({ line: { ...product().line, priceSource: "trade" } }),
    ]);
    expect(suggestion.detail).toBe("WIN-ALU-12 · trade price");
  });

  it("shows the bare code when the price is the standard one", () => {
    expect(catalogueSuggestions([product()])[0].detail).toBe("WIN-ALU-12");
  });

  it("falls back to the product name when the line has no description", () => {
    const [suggestion] = catalogueSuggestions([
      product({ line: { ...product().line, description: "" } }),
    ]);
    expect(suggestion.pick.description).toBe("Aluminium window 1200mm");
  });

  it("never offers a retired product", () => {
    expect(catalogueSuggestions([product({ isActive: false })])).toEqual([]);
  });

  it("sets no quantity — a catalogue item has no measured amount", () => {
    expect(catalogueSuggestions([product()])[0].pick.quantity).toBeUndefined();
  });
});

describe("buildSuggestions", () => {
  it("puts what was measured above what is on the shelf", () => {
    // On a job that had a survey, the first arrow-down should land on the
    // thing somebody stood in front of.
    const suggestions = buildSuggestions({
      visitItems: [visitItem()],
      products: [product()],
      query: "alu",
    });
    expect(suggestions.map((s) => s.source)).toEqual(["visit", "catalogue"]);
  });

  it("gives every suggestion a distinct key, since they are list keys", () => {
    const suggestions = buildSuggestions({
      visitItems: [visitItem({ id: "1" })],
      products: [product({ id: "1" })],
      query: "",
    });
    expect(new Set(suggestions.map((s) => s.key)).size).toBe(suggestions.length);
  });

  it("returns nothing rather than throwing when there is nothing to offer", () => {
    expect(buildSuggestions({ visitItems: [], products: [], query: "anything" })).toEqual([]);
  });
});
