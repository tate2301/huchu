/**
 * Money accounts (40-buying 3.2): a balance from Float columns without float
 * drift, the option's sub (a cash account's balance, else the number's last
 * four), what "Cash, bank or mobile" reads as, and the quick add.
 */
import { describe, expect, it } from "vitest";

import { Prisma } from "@prisma/client";

import { balanceOf, currencyWords, lastFour, moneyAccountSub, parseMoneyAccountKind } from "./money-accounts";

describe("balanceOf", () => {
  it("adds the cents, not the floats", () => {
    // 0.1 + 0.2 is 0.30000000000000004 as floats.
    const balance = balanceOf(0, [
      { amount: 0.1, direction: "DEBIT" },
      { amount: 0.2, direction: "DEBIT" },
    ]);
    expect(balance.toFixed(2)).toBe("0.30");
    expect(balance.equals(new Prisma.Decimal("0.3"))).toBe(true);
  });

  it("is the opening plus debits less credits", () => {
    const balance = balanceOf(2000.1, [
      { amount: 1000.2, direction: "DEBIT" },
      { amount: 590.3, direction: "CREDIT" },
      { amount: 0.01, direction: "CREDIT" },
    ]);
    expect(balance.toFixed(2)).toBe("2409.99");
  });

  it("reads many small floats the way a till counts them", () => {
    const thousand = Array.from({ length: 1000 }, () => ({ amount: 0.1, direction: "DEBIT" as const }));
    expect(balanceOf(0, thousand).toFixed(2)).toBe("100.00");
  });
});

describe("the option's sub", () => {
  it("shows a cash account's balance and a bank or mobile account's last four", () => {
    expect(moneyAccountSub({ kind: "CASH", currency: "USD", accountNumber: null, balance: new Prisma.Decimal("2410") })).toBe("US$2,410.00");
    expect(moneyAccountSub({ kind: "BANK", currency: "USD", accountNumber: "0112 3344 4471", balance: new Prisma.Decimal("0") })).toBe("•••• 4471");
    expect(moneyAccountSub({ kind: "MOBILE", currency: "USD", accountNumber: "0712 550 0921", balance: new Prisma.Decimal("5") })).toBe("•••• 0921");
    expect(lastFour("12")).toBeNull();
  });
});

describe("what an account is", () => {
  it("reads cash, bank or mobile, cash when empty", () => {
    expect(parseMoneyAccountKind("")).toBe("CASH");
    expect(parseMoneyAccountKind("Cash")).toBe("CASH");
    expect(parseMoneyAccountKind("bank")).toBe("BANK");
    expect(parseMoneyAccountKind("Mobile")).toBe("MOBILE");
    expect(parseMoneyAccountKind("EcoCash")).toBe("MOBILE");
    expect(parseMoneyAccountKind("crypto")).toBeNull();
  });

  it("says what currency it holds", () => {
    expect(currencyWords("USD")).toBe("US dollars");
    expect(currencyWords("ZWG")).toBe("ZiG");
  });
});
