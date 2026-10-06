import { describe, expect, it } from "vitest";

import { discountPinSentence, PRICE_UP_SENTENCE } from "@/lib/retail/till-rule-words";

import { discountApprovalReason, discountCeilingProblem, paymentSummary, type RuledLine } from "./sale-rules";

const line = (patch: Partial<RuledLine> = {}): RuledLine => ({
  name: "Castle Lager 340ml",
  quantity: 2,
  unitPrice: 1.5,
  shelfPrice: 1.5,
  lineDiscountAmount: 0,
  maxDiscountPercent: null,
  ...patch,
});

describe("discountApprovalReason", () => {
  it("asks nothing of a sale at the shelf price", () => {
    expect(discountApprovalReason("10.00", { lines: [line()], orderDiscount: 0 })).toBeNull();
  });

  it("always asks for a price above the shelf", () => {
    expect(discountApprovalReason("100.00", { lines: [line({ unitPrice: 1.6 })], orderDiscount: 0 })).toBe(PRICE_UP_SENTENCE);
  });

  it("allows a line discount up to the cashier's largest", () => {
    // 0.30 off 3.00 is exactly 10%.
    expect(discountApprovalReason("10.00", { lines: [line({ lineDiscountAmount: 0.3 })], orderDiscount: 0 })).toBeNull();
  });

  it("asks when one line goes over, however big the basket", () => {
    const lines = [line({ unitPrice: 1, quantity: 1 }), line({ name: "Bread", quantity: 100 })];
    expect(discountApprovalReason("10.00", { lines, orderDiscount: 0 })).toBe(discountPinSentence("10.00"));
  });

  it("adds the sale's own discount to the lines'", () => {
    const lines = [line({ lineDiscountAmount: 0.2 })];
    expect(discountApprovalReason("10.00", { lines, orderDiscount: 0.2 })).toBe(discountPinSentence("10.00"));
  });
});

describe("discountCeilingProblem", () => {
  it("says nothing without a ceiling", () => {
    expect(discountCeilingProblem(line({ lineDiscountAmount: 3 }))).toBeNull();
  });

  it("refuses more off than the product allows, in the server's words", () => {
    expect(discountCeilingProblem(line({ maxDiscountPercent: 5, lineDiscountAmount: 0.2 }))).toBe(
      "The most off Castle Lager 340ml is 5% (US$0.15).",
    );
    expect(discountCeilingProblem(line({ maxDiscountPercent: 5, unitPrice: 1.43 }))).toBeNull();
  });
});

describe("paymentSummary", () => {
  it("counts ZiG cash at today's rate and gives change from cash only", () => {
    const summary = paymentSummary(
      [
        { tenderType: "ECOCASH", amount: "5.00", reference: "ABC123" },
        { tenderType: "CASH", amount: "134", reference: "", currency: "ZWG" },
      ],
      9.6,
      26.8,
    );
    expect(summary.nonCashTotal).toBe(5);
    expect(summary.cashTotal).toBe(5);
    expect(summary.tenderedTotal).toBe(10);
    expect(summary.changeAmount).toBe(0.4);
  });

  it("gives no change when a wallet pays more than is due", () => {
    expect(paymentSummary([{ tenderType: "CARD", amount: "12", reference: "1234" }], 10, null).changeAmount).toBe(0);
  });
});
