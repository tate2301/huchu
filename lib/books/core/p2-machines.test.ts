/**
 * The P2 state machines and their pure rules (books-final §4.7–4.12, §5.3):
 * which moves a purchase order and a commission may make, how spend lines
 * group into postings, which rule a bill posts under, and what an order comes
 * to against the limit.
 */
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { billSubtype } from "./bills";
import { canMoveCommission } from "./commission";
import { canMovePurchaseOrder, purchaseOrderTotal } from "./purchase-orders";
import { groupSpend, isOrderCash, moduleOf, paidOutAmount } from "./requisitions";

describe("a purchase order's moves", () => {
  it("goes Draft → To approve or Sent → Part received → Received → Closed, and is cancelled only before goods come", () => {
    expect(canMovePurchaseOrder("DRAFT", "TO_APPROVE")).toBe(true);
    expect(canMovePurchaseOrder("DRAFT", "SENT")).toBe(true);
    expect(canMovePurchaseOrder("TO_APPROVE", "SENT")).toBe(true);
    expect(canMovePurchaseOrder("TO_APPROVE", "DRAFT")).toBe(true);
    expect(canMovePurchaseOrder("SENT", "PARTIAL")).toBe(true);
    expect(canMovePurchaseOrder("PARTIAL", "RECEIVED")).toBe(true);
    expect(canMovePurchaseOrder("RECEIVED", "CLOSED")).toBe(true);
    expect(canMovePurchaseOrder("CLOSED", "RECEIVED")).toBe(true);
    for (const from of ["DRAFT", "TO_APPROVE", "SENT"] as const) expect(canMovePurchaseOrder(from, "CANCELLED")).toBe(true);
    expect(canMovePurchaseOrder("PARTIAL", "CANCELLED")).toBe(false);
    expect(canMovePurchaseOrder("DRAFT", "RECEIVED")).toBe(false);
    expect(canMovePurchaseOrder("CANCELLED", "DRAFT")).toBe(false);
  });

  it("compares the order with VAT against the limit", () => {
    expect(purchaseOrderTotal([{ lineTotal: 400, vatRate: 15.5 }, { lineTotal: new Prisma.Decimal("100.00"), vatRate: 0 }])).toBe(562);
  });
});

describe("commission's moves", () => {
  it("goes Pending → Approved → Paid, voids before it is paid, and never reopens", () => {
    expect(canMoveCommission("PENDING", "APPROVED")).toBe(true);
    expect(canMoveCommission("APPROVED", "PAID")).toBe(true);
    expect(canMoveCommission("PENDING", "VOIDED")).toBe(true);
    expect(canMoveCommission("APPROVED", "VOIDED")).toBe(true);
    expect(canMoveCommission("PENDING", "PAID")).toBe(false);
    expect(canMoveCommission("PAID", "VOIDED")).toBe(false);
    expect(canMoveCommission("PAID", "PENDING")).toBe(false);
    expect(canMoveCommission("VOIDED", "PENDING")).toBe(false);
  });
});

describe("a requisition's money", () => {
  it("groups spend by category, or by the account a line names, on its cost centre", () => {
    const groups = groupSpend([
      { category: "FUEL", amount: 150 },
      { category: "FUEL", amount: 20, taxAmount: 2.68 },
      { category: "MATERIALS", amount: 80, costCenterId: "cc-1" },
      { category: "OTHER", amount: 35, expenseAccountId: "acct-5300" },
      { category: "OTHER", amount: 0 },
    ]);
    expect(groups.map((group) => [group.key, group.subtype, Number(group.amount), Number(group.taxAmount)])).toEqual([
      ["FUEL", "FUEL", 170, 2.68],
      ["MATERIALS@cc-1", "MATERIALS", 80, 0],
      ["acct-acct-5300", "ACCOUNT", 35, 0],
    ]);
  });

  it("pays out what was paid, else approved, else asked; a shop's order cash is the supplier's advance", () => {
    expect(Number(paidOutAmount({ amount: 400, approvedAmount: 350, paidAmount: 300 }))).toBe(300);
    expect(Number(paidOutAmount({ amount: 400, approvedAmount: 350, paidAmount: null }))).toBe(350);
    expect(Number(paidOutAmount({ amount: 400, approvedAmount: null }))).toBe(400);
    expect(moduleOf({ siteId: null })).toBe("crm");
    expect(moduleOf({ siteId: "site-1" })).toBe("retail");
    expect(isOrderCash({ siteId: "site-1", purchaseOrderId: "po-1" })).toBe(true);
    expect(isOrderCash({ siteId: null, purchaseOrderId: "po-1" })).toBe(false);
  });
});

describe("which rule a bill posts under", () => {
  it("claims input VAT only from a valid FTI, and clears goods received when it bills a delivery", () => {
    expect(billSubtype({ goodsReceiptId: null, fdmsStatus: "NOT_CHECKED" })).toBeNull();
    expect(billSubtype({ goodsReceiptId: null, fdmsStatus: "NOT_VALID" })).toBeNull();
    expect(billSubtype({ goodsReceiptId: null, fdmsStatus: "VALID" })).toBe("VALID");
    expect(billSubtype({ goodsReceiptId: "gr-1", fdmsStatus: "NOT_CHECKED" })).toBe("GOODS_RECEIVED");
    expect(billSubtype({ goodsReceiptId: "gr-1", fdmsStatus: "VALID" })).toBe("GOODS_RECEIVED_VALID");
  });
});
