import { describe, expect, it } from "vitest";

import { isMoneyIn, moneyFinding } from "./money";

describe("moneyFinding", () => {
  it("says what came in, then what is owed and how much is late", () => {
    expect(moneyFinding(10228.4, 5724.22, 2480, "USD")).toEqual({
      fact: "$10,228.40 has come in this month.",
      rest: "$5,724.22 is owed to you, $2,480.00 of it overdue.",
    });
    expect(moneyFinding(0, 0, 0, "USD")).toEqual({ fact: "Nothing has come in this month yet.", rest: "Nothing is owed to you." });
    expect(moneyFinding(10, 50, 0, "USD").rest).toBe("$50.00 is owed to you, none of it overdue.");
  });
});

describe("isMoneyIn", () => {
  it("reads money in as CREDIT, and the till's banked takings as the deposit they are", () => {
    expect(isMoneyIn({ direction: "CREDIT", sourceType: "BANK_TRANSACTION" })).toBe(true);
    expect(isMoneyIn({ direction: "DEBIT", sourceType: "PURCHASE_PAYMENT" })).toBe(false);
    expect(isMoneyIn({ direction: "DEBIT", sourceType: "RETAIL_DAY_BANKED" })).toBe(true);
  });
});
