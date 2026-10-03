import { describe, expect, it } from "vitest";

import {
  cashMovementLabel,
  enumLabel,
  formatQuantity,
  formatRetailDate,
  formatRetailDateTime,
  formatSignedMoney,
  productStatusLabel,
  tenderLabel,
} from "./words";

describe("retail words", () => {
  it("names a tender one way", () => {
    expect(tenderLabel("MOBILE_MONEY")).toBe("Mobile money");
    expect(tenderLabel("TRANSFER")).toBe("Bank transfer");
  });

  it("says which way cash moved", () => {
    expect(cashMovementLabel("DROP_TO_SAFE")).toBe("To the safe");
    expect(cashMovementLabel("FLOAT_TOP_UP")).toBe("In from the safe");
  });

  it("never shows a stored constant", () => {
    expect(enumLabel("CONSUMABLES")).toBe("Consumables");
    expect(tenderLabel("GIFT_CARD")).toBe("Gift card");
    expect(tenderLabel(null)).toBe("");
  });

  it("draws nothing for a product on sale", () => {
    expect(productStatusLabel("ACTIVE")).toBeNull();
    expect(productStatusLabel("INACTIVE")).toBe("Off sale");
  });

  it("writes dates day first, in the shop's time", () => {
    expect(formatRetailDate("2026-09-29T21:30:00.000Z")).toBe("29 Sept 2026");
    // 23:30 in Harare is still the 29th; UTC would have said the 29th at 21:30.
    expect(formatRetailDateTime("2026-09-29T21:30:00.000Z")).toBe("29 Sept 2026, 23:30");
    expect(formatRetailDate("not a date")).toBe("");
  });

  it("signs money with a true minus", () => {
    expect(formatSignedMoney(-82.81)).toBe("−$82.81");
    expect(formatSignedMoney(1234.5)).toBe("$1,234.50");
  });

  it("writes a quantity with its unit", () => {
    expect(formatQuantity(36, "bottle")).toBe("36 bottles");
    expect(formatQuantity(1, "case")).toBe("1 case");
    expect(formatQuantity(0, "each")).toBe("0 each");
    expect(formatQuantity(3, "box")).toBe("3 boxes");
    expect(formatQuantity(2.5, "kg")).toBe("2.5 kg");
    expect(formatQuantity(14.0, "pcs")).toBe("14 pcs");
  });
});
