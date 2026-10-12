import { describe, expect, it } from "vitest";

import { openSaleKey, readOpenSale, type OpenSale } from "./open-sale";
import type { CartItem } from "./types";

const line = {
  id: "lager",
  name: "Castle Lager 340ml",
  catalogItemId: "lager",
  quantity: 2,
  unitPrice: 1.5,
  shelfPrice: 1.5,
  priceOfOne: 1.5,
  priceBreaks: [],
  openPrice: false,
  taxPercent: 15,
  taxInclusive: true,
  lineDiscountAmount: 0,
} as unknown as CartItem;

const sale: OpenSale = {
  cart: [line],
  customerName: "Rudo",
  selectedCustomer: null,
  loyaltyRedemptionPoints: "",
  payments: [{ tenderType: "CASH", amount: "5", reference: "" }],
  orderDiscountAmount: "",
  idChecked: true,
  heldAs: null,
};

const now = Date.UTC(2026, 9, 11, 10);

describe("readOpenSale", () => {
  it("gives back the sale as it was kept", () => {
    expect(readOpenSale({ ...sale, keptAt: now - 60_000 }, now)).toEqual(sale);
  });

  it("lets go of a sale kept longer than a shift", () => {
    expect(readOpenSale({ ...sale, keptAt: now - 13 * 60 * 60 * 1000 }, now)).toBeNull();
  });

  it("lets go of anything that is not a sale with lines", () => {
    expect(readOpenSale(undefined, now)).toBeNull();
    expect(readOpenSale({ ...sale, cart: [], keptAt: now }, now)).toBeNull();
    expect(readOpenSale({ ...sale, cart: [{ name: "Ice" }], keptAt: now }, now)).toBeNull();
    expect(readOpenSale({ ...sale, payments: "cash", keptAt: now }, now)).toBeNull();
    expect(readOpenSale({ ...sale, keptAt: undefined }, now)).toBeNull();
    expect(readOpenSale({ ...sale, selectedCustomer: { name: "Rudo" }, keptAt: now }, now)).toBeNull();
  });
});

describe("openSaleKey", () => {
  it("is one per till and person", () => {
    expect(openSaleKey("till-1", "tatenda")).not.toBe(openSaleKey("till-1", "tafara"));
    expect(openSaleKey("till-1", "tatenda")).not.toBe(openSaleKey("till-2", "tatenda"));
  });
});
