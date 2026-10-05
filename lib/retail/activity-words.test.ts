import { describe, expect, it } from "vitest";

import { activityWords, fallbackWords } from "./activity-words";

describe("Activity's sentences (00-foundations 5.6.9)", () => {
  it("an edit names the value before and after, money as money", () => {
    expect(
      activityWords("RETAIL_RECORD.EDITED", { label: "Price", from: "17.99", to: "18.25", kind: "money" }),
    ).toEqual({ what: "Changed Price from US$17.99 to US$18.25", tone: "info" });
    expect(activityWords("RETAIL_RECORD.EDITED", { label: "Barcode", from: null, to: "6001232 35259" })).toEqual({
      what: "Set Barcode to 6001232 35259",
      tone: "info",
    });
  });

  it("the bin", () => {
    expect(activityWords("RETAIL_RECORD.BINNED", { kind: "product", name: "x" })).toEqual({
      what: "Moved to the bin",
      tone: "bad",
    });
    expect(activityWords("RETAIL_RECORD.RESTORED", {})).toEqual({ what: "Restored from the bin", tone: "ok" });
  });

  it("stopping and restarting a product's sale (20-products 3.4)", () => {
    expect(activityWords("RETAIL_PRODUCT.ARCHIVED", { name: "Zambezi Lager 375ml" })).toEqual({
      what: "Stopped selling it",
      tone: "hollow",
    });
    expect(activityWords("RETAIL_PRODUCT.UNARCHIVED", { name: "Zambezi Lager 375ml" })).toEqual({
      what: "Put it on sale again",
      tone: "ok",
    });
  });

  it("categories: added, changed and deleted with the move (W-19)", () => {
    expect(activityWords("RETAIL_CATEGORY.CREATED", { name: "Mixers" })).toEqual({ what: "Added it", tone: "ok" });
    expect(
      activityWords("RETAIL_CATEGORY.CHANGED", {
        changes: [{ field: "vat", label: "VAT", from: "15% included", to: "Zero-rated" }],
        products: 6,
      }),
    ).toEqual({ what: "Changed VAT to Zero-rated for 6 products", tone: "info" });
    expect(
      activityWords("RETAIL_CATEGORY.CHANGED", {
        changes: [{ field: "targetMargin", label: "Target margin", from: "25%", to: "22%" }],
        products: 0,
      }),
    ).toEqual({ what: "Changed Target margin from 25% to 22%", tone: "info" });
    expect(activityWords("RETAIL_CATEGORY.DELETED", { moved: 61, into: "Spirits and liqueurs" })).toEqual({
      what: "Deleted it and moved 61 products to Spirits and liqueurs",
      tone: "bad",
    });
    expect(activityWords("RETAIL_CATEGORY.DELETED", { moved: 0, into: null })).toEqual({ what: "Deleted it", tone: "bad" });
  });

  it("settings name every label changed", () => {
    expect(
      activityWords("RETAIL_SETTINGS.CHANGED", { changes: [{ label: "Cases and singles" }, { label: "Weekday hours" }] }),
    ).toEqual({ what: "Changed Cases and singles, Weekday hours", tone: "info" });
  });

  it("a shift's open and close", () => {
    expect(activityWords("RETAIL_SHIFT.OPENED", { openingFloat: "200.00" }).what).toBe(
      "Opened with a float of US$200.00",
    );
    expect(activityWords("RETAIL_SHIFT.CLOSED", { countedCash: "190", variance: "-7.15" })).toEqual({
      what: "Counted and closed, short by US$7.15",
      tone: "bad",
    });
    expect(activityWords("RETAIL_SHIFT.CLOSED", { countedCash: "200", variance: "3.17" })).toEqual({
      what: "Counted and closed, over by US$3.17",
      tone: "warn",
    });
    expect(activityWords("RETAIL_SHIFT.CLOSED", { countedCash: "200", variance: "0.00" })).toEqual({
      what: "Counted and closed, balanced",
      tone: "ok",
    });
  });

  it("cash in and out", () => {
    expect(activityWords("RETAIL_CASH.MOVED", { type: "DROP_TO_SAFE", amount: "200.00", currency: "USD" })).toEqual({
      what: "Dropped US$200.00 to the safe",
      tone: "hollow",
    });
    expect(activityWords("RETAIL_CASH.MOVED", { type: "FLOAT_TOP_UP", amount: "50" }).what).toBe("Put US$50.00 in");
    expect(activityWords("RETAIL_CASH.MOVED", { type: "PAYOUT", amount: "20" }).what).toBe("Paid out US$20.00");
  });

  it("sales, refunds and voids", () => {
    expect(activityWords("RETAIL_SALE.POSTED", { saleNo: "SALE-31862", totalAmount: "13.00", currency: "USD" })).toEqual({
      what: "Sold SALE-31862 for US$13.00",
      tone: "ok",
    });
    expect(activityWords("RETAIL_SALE.REFUNDED", { saleNo: "RFD-0001", totalAmount: "-4.50" })).toEqual({
      what: "Refunded RFD-0001 for US$4.50",
      tone: "warn",
    });
    expect(activityWords("RETAIL_SALE.VOIDED", { saleNo: "VOID-0001", totalAmount: "-2.40" }).tone).toBe("bad");
  });

  it("buying and the shop profile", () => {
    expect(activityWords("RETAIL_GOODS.RECEIVED", { receiptNo: "GRN-0004", units: 300 }).what).toBe(
      "Received GRN-0004, 300 units",
    );
    expect(
      activityWords("RETAIL_PURCHASE_ORDER.CLOSED", { owed: [{ quantity: "120" }, { quantity: "60" }] }).what,
    ).toBe("Closed with what came, 180 units not delivered");
    expect(activityWords("RETAIL_PURCHASE_ORDER.REOPENED", {}).what).toBe("Reopened");
    expect(
      activityWords("RETAIL_SHOP.PROFILE_CHANGED", { businessTypeBefore: "GENERAL", businessType: "LIQUOR" }).what,
    ).toBe("Changed the business type to liquor store");
    expect(
      activityWords("RETAIL_SHOP.PROFILE_CHANGED", {
        businessTypeBefore: "LIQUOR",
        businessType: "LIQUOR",
        features: { casesAndSingles: false, ageCheck: true },
        featuresBefore: { casesAndSingles: true, ageCheck: true },
      }).what,
    ).toBe("Turned cases and singles off");
  });

  it("anything else reads as its type's last segment", () => {
    expect(fallbackWords("RETAIL_EXPORT.DOWNLOADED")).toBe("Downloaded");
    expect(activityWords("STOCK.COUNT_POSTED", null)).toEqual({ what: "Count posted", tone: "hollow" });
  });
});
