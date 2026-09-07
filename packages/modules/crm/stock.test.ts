import { describe, expect, it } from "vitest";

import {
  isStockTracked,
  quoteStockConcerns,
  shortfall,
  stockStatus,
  stockWarning,
  type StockSnapshot,
} from "./stock";

const tracked: StockSnapshot = { onHand: 10, minStock: 3, unit: "each", siteName: "Msasa" };
const untracked: StockSnapshot = { onHand: null };

describe("isStockTracked", () => {
  it("is tracked only when something was linked", () => {
    expect(isStockTracked({ inventoryItemId: "inv-1" })).toBe(true);
    expect(isStockTracked({ inventoryItemId: null })).toBe(false);
    expect(isStockTracked({})).toBe(false);
  });
});

describe("stockStatus", () => {
  it("treats a never-stocked service as a first-class answer, not a problem", () => {
    // The common case for a services business — it must never read as an error.
    expect(stockStatus(untracked, 100)).toBe("NOT_TRACKED");
  });

  it("is in stock when there is comfortably enough", () => {
    expect(stockStatus(tracked, 2)).toBe("IN_STOCK");
  });

  it("is short when the quote wants more than is there", () => {
    expect(stockStatus(tracked, 15)).toBe("SHORT");
  });

  it("is out when the shelf is empty, whatever the quantity", () => {
    expect(stockStatus({ onHand: 0 }, 1)).toBe("OUT");
    expect(stockStatus({ onHand: 0 }, 0)).toBe("OUT");
  });

  it("warns at the reorder point somebody set, not an arbitrary percentage", () => {
    expect(stockStatus(tracked, 8)).toBe("LOW");
    expect(stockStatus(tracked, 7)).toBe("IN_STOCK");
  });

  it("says nothing about low stock when no reorder point was set", () => {
    expect(stockStatus({ onHand: 10, minStock: null }, 9)).toBe("IN_STOCK");
  });
});

describe("shortfall", () => {
  it("is how many more are needed", () => {
    expect(shortfall(tracked, 15)).toBe(5);
  });

  it("is zero when there is enough, and zero for an untracked line", () => {
    expect(shortfall(tracked, 5)).toBe(0);
    expect(shortfall(untracked, 500)).toBe(0);
  });
});

describe("stockWarning", () => {
  it("stays silent for a service and for a comfortable line", () => {
    expect(stockWarning(untracked, 100)).toBeNull();
    expect(stockWarning(tracked, 2)).toBeNull();
  });

  it("says how short it is, in the item's own unit", () => {
    expect(stockWarning(tracked, 15)).toBe("Only 10 each on hand, 5 each short");
  });

  it("points at another site when one has some", () => {
    const message = stockWarning({ ...tracked, otherSitesOnHand: 40 }, 15);
    expect(message).toContain("40 each at another site");
  });

  it("tells you to order in when nowhere has any", () => {
    expect(stockWarning({ onHand: 0, otherSitesOnHand: 0 }, 3)).toBe(
      "None on hand — this will need ordering in",
    );
  });

  it("names the site when it's empty here but stocked elsewhere", () => {
    const message = stockWarning(
      { onHand: 0, siteName: "Msasa", otherSitesOnHand: 12, unit: "each" },
      3,
    );
    expect(message).toBe("None at Msasa, 12 each at another site");
  });

  it("mentions dropping below the reorder point", () => {
    expect(stockWarning(tracked, 8)).toBe("Leaves 2 each, below the reorder point");
  });
});

describe("quoteStockConcerns", () => {
  it("returns only the lines worth a second look", () => {
    const concerns = quoteStockConcerns([
      { description: "Install labour", quantity: 40, stock: null },
      { description: "Panel", quantity: 2, stock: tracked },
      { description: "Cable", quantity: 99, stock: { onHand: 5, unit: "m" } },
    ]);
    expect(concerns).toHaveLength(1);
    expect(concerns[0].description).toBe("Cable");
  });

  it("is empty for a quote of nothing but services", () => {
    expect(
      quoteStockConcerns([{ description: "Survey", quantity: 1, stock: null }]),
    ).toEqual([]);
  });
});
