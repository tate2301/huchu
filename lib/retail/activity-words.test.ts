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
    expect(activityWords("RETAIL_RECORD.PURGED", { how: "kept", automatic: false })).toEqual({
      what: "Deleted for good",
      tone: "bad",
    });
    expect(activityWords("RETAIL_RECORD.PURGED", { how: "deleted", automatic: true })).toEqual({
      what: "Deleted for good after 30 days in the bin",
      tone: "bad",
    });
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

  it("an import says what it added and updated, from which file (W-08)", () => {
    expect(
      activityWords("RETAIL_PRODUCTS.IMPORTED", { created: 196, updated: 12, skipped: 6, file: "price-list-oct.xlsx" }),
    ).toEqual({ what: "Imported 196 products and updated 12 from price-list-oct.xlsx", tone: "ok" });
    expect(activityWords("RETAIL_PRODUCTS.IMPORTED", { created: 1, updated: 0, skipped: 0, file: "a.csv" })).toEqual({
      what: "Imported 1 product from a.csv",
      tone: "ok",
    });
    expect(activityWords("RETAIL_PRODUCTS.IMPORTED", { created: 0, updated: 3, skipped: 0, file: "a.csv" })).toEqual({
      what: "Updated 3 products from a.csv",
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

  it("sites say what changed, the places and the stock that moved with them", () => {
    expect(activityWords("RETAIL_SITE.CREATED", { name: "Avondale" })).toEqual({ what: "Added it", tone: "ok" });
    expect(
      activityWords("RETAIL_SITE.CHANGED", { changes: {}, placesAdded: ["Cold room"], placesRemoved: ["Back store"], stockMoved: 3 }),
    ).toEqual({ what: "Added Cold room, removed Back store and moved 3 stock lines with it", tone: "info" });
    expect(activityWords("RETAIL_SITE.CHANGED", { changes: {}, madeDefault: true, placesAdded: [], placesRemoved: [] })).toEqual({
      what: "Made it the default site",
      tone: "info",
    });
    expect(activityWords("RETAIL_SITE.CHANGED", { changes: { phone: { from: null, to: "+263 24 233 4410" } } })).toEqual({
      what: "Changed Phone",
      tone: "info",
    });
    expect(activityWords("RETAIL_SITE.CLOSED", { name: "Borrowdale" })).toEqual({ what: "Closed it", tone: "bad" });
    expect(activityWords("RETAIL_PRICE_LIST.CREATED", { name: "Avondale", from: "Shelf prices" })).toEqual({
      what: "Added it, a copy of Shelf prices",
      tone: "ok",
    });
  });

  it("settings name every label changed", () => {
    expect(
      activityWords("RETAIL_SETTINGS.CHANGED", { changes: [{ label: "Cases and singles" }, { label: "Weekday hours" }] }),
    ).toEqual({ what: "Changed Cases and singles, Weekday hours", tone: "info" });
  });

  it("a new ZiG rate says what it replaced", () => {
    expect(activityWords("RETAIL_ZIG_RATE.SET", { rate: "27.10", previous: "26.80" })).toEqual({
      what: "Set the ZiG rate to 27.10, from 26.80",
      tone: "info",
    });
    expect(activityWords("RETAIL_ZIG_RATE.SET", { rate: "26.80", previous: null }).what).toBe("Set the ZiG rate to 26.80");
  });

  it("how the ZiG rate is updated", () => {
    expect(activityWords("RETAIL_ZIG_RATE.SET", { source: "RBZ_DAILY", previousSource: "MANUAL" }).what).toBe(
      "Takes the RBZ’s rate daily",
    );
    expect(activityWords("RETAIL_ZIG_RATE.SET", { source: "MANUAL", previousSource: "RBZ_DAILY" }).what).toBe(
      "Updates the ZiG rate by hand",
    );
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

  it("reversed movements name their references (W-28)", () => {
    expect(activityWords("RETAIL_STOCK.MOVEMENTS_REVERSED", { references: ["ADJ-0031"] })).toEqual({
      what: "Reversed ADJ-0031",
      tone: "hollow",
    });
    expect(activityWords("RETAIL_STOCK.MOVEMENTS_REVERSED", { references: ["ADJ-0030", "BRK-0012"] }).what).toBe(
      "Reversed ADJ-0030 and BRK-0012",
    );
  });

  it("adjustments and case breaks (W-23, W-26), money only for those who see cost", () => {
    expect(activityWords("RETAIL_STOCK.ADJUSTED", { why: "BROKEN", delta: -2, value: "26.06" })).toEqual({
      what: "Took 2 off: broken or spoilt, US$26.06",
      tone: "warn",
    });
    expect(activityWords("RETAIL_STOCK.ADJUSTED", { why: "OWN_USE", delta: -1, value: "13.03" }).what).toBe(
      "Took 1 off: own use or gift, US$13.03",
    );
    expect(activityWords("RETAIL_STOCK.ADJUSTED", { why: "BROKEN", delta: -2, value: "26.06" }, { seeCost: false }).what).toBe(
      "Took 2 off: broken or spoilt",
    );
    expect(activityWords("RETAIL_STOCK.ADJUSTED", { why: "FOUND", delta: 2, value: "26.06" }, { seeCost: false }).what).toBe("Added 2: found more");
    expect(activityWords("RETAIL_STOCK.ADJUSTED", { why: "CORRECTION", delta: -2, from: 13, to: 11 })).toEqual({
      what: "Set on hand from 13 to 11",
      tone: "warn",
    });
    expect(activityWords("RETAIL_STOCK.CASE_BROKEN", { reference: "BRK-0012", cases: 1, singles: 24 })).toEqual({
      what: "Broke 1 case into 24 singles (BRK-0012)",
      tone: "hollow",
    });
  });

  it("counts started and sent for review (30-stock 3.3)", () => {
    expect(activityWords("RETAIL_STOCK_COUNT.STARTED", { countNo: "CNT-0020", lines: 38, counter: "Rudo Moyo" })).toEqual({
      what: "Started the count: 38 products, sent to Rudo Moyo",
      tone: "info",
    });
    expect(activityWords("RETAIL_STOCK_COUNT.SUBMITTED", { lines: 38, differ: 3 })).toEqual({
      what: "Counted 38 lines and sent them for review",
      tone: "info",
    });
  });

  it("transfers sent, changed, received and cancelled (30-stock 3.3)", () => {
    expect(activityWords("RETAIL_STOCK_TRANSFER.SENT", { units: 540, to: "Borrowdale" })).toEqual({ what: "Sent 540 units to Borrowdale", tone: "info" });
    expect(activityWords("RETAIL_STOCK_TRANSFER.CHANGED", { units: 560 })).toEqual({ what: "Changed the lines: 560 units on the way", tone: "info" });
    expect(activityWords("RETAIL_STOCK_TRANSFER.RECEIVED", { to: "Borrowdale", received: 538, lost: 2, stillComing: 0 })).toEqual({
      what: "Received at Borrowdale: 538 units, 2 lost on the way",
      tone: "warn",
    });
    expect(activityWords("RETAIL_STOCK_TRANSFER.RECEIVED", { to: "Borrowdale", received: 4, lost: 0, stillComing: 2 })).toEqual({
      what: "Received at Borrowdale: 4 units, 2 still to come",
      tone: "ok",
    });
    expect(activityWords("RETAIL_STOCK_TRANSFER.CANCELLED", { returned: 540, from: "Harare Main Branch" })).toEqual({
      what: "Cancelled: 540 units back at Harare Main Branch",
      tone: "bad",
    });
  });

  it("suppliers added, their people, stopped and messaged (40-buying 3.4)", () => {
    expect(activityWords("RETAIL_SUPPLIER.CREATED", { code: "SUP-0008", name: "Natbrew" })).toEqual({ what: "Added Natbrew", tone: "ok" });
    expect(activityWords("RETAIL_SUPPLIER.CONTACT_ADDED", { name: "Rumbi Chari", role: "Accounts", sends: "STATEMENTS" })).toEqual({
      what: "Added Rumbi Chari, Accounts, who gets statements",
      tone: "info",
    });
    expect(activityWords("RETAIL_SUPPLIER.CONTACT_ADDED", { name: "Simon", role: null, sends: "NOTHING" })).toEqual({
      what: "Added Simon, who gets nothing",
      tone: "info",
    });
    expect(activityWords("RETAIL_SUPPLIER.CONTACT_REMOVED", { name: "Rumbi Chari" })).toEqual({ what: "Removed Rumbi Chari", tone: "hollow" });
    expect(activityWords("RETAIL_SUPPLIER.STOPPED", {})).toEqual({ what: "Stopped buying from them", tone: "bad" });
    expect(activityWords("RETAIL_SUPPLIER.RESUMED", {})).toEqual({ what: "Started buying from them again", tone: "ok" });
    expect(activityWords("RETAIL_SUPPLIER.MESSAGED", { to: "+263 77 214 9080" })).toEqual({ what: "Sent a message on WhatsApp", tone: "hollow" });
  });

  it("anything else reads as its type's last segment", () => {
    expect(fallbackWords("RETAIL_EXPORT.DOWNLOADED")).toBe("Downloaded");
    expect(activityWords("STOCK.COUNT_POSTED", null)).toEqual({ what: "Count posted", tone: "hollow" });
  });
});
