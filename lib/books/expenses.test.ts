import { describe, expect, it } from "vitest";

import { billState, expensesFinding, type BillFacts } from "./expenses";
import { paymentsFinding } from "./payments";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const facts = (over: Partial<BillFacts>): BillFacts => ({
  status: "RECEIVED",
  billDate: day("2026-09-20"),
  dueDate: day("2026-10-02"),
  total: 420,
  amountPaid: 0,
  debitNoteTotal: 0,
  writeOffTotal: 0,
  ...over,
});

describe("a bill in Books → Expenses", () => {
  const today = "2026-10-06";

  it("reads overdue in days, and what is left to pay", () => {
    expect(billState(facts({}), today)).toEqual({ state: "overdue", when: "4 days overdue", balance: 420 });
  });

  it("reads part paid and to pay by its due day", () => {
    expect(billState(facts({ amountPaid: 100, dueDate: day("2026-10-18") }), today)).toEqual({ state: "part-paid", when: "Due 18 Oct", balance: 320 });
    expect(billState(facts({ dueDate: null }), today)).toMatchObject({ state: "to-pay", when: "Received 20 Sep" });
  });

  it("reads paid, draft and void", () => {
    expect(billState(facts({ amountPaid: 420 }), today)).toMatchObject({ state: "paid", balance: 0 });
    expect(billState(facts({ status: "DRAFT" }), today)).toMatchObject({ state: "draft", when: "Entered 20 Sep" });
    expect(billState(facts({ status: "VOIDED" }), today)).toMatchObject({ state: "void", balance: 0 });
  });

  it("opens with what is to pay and how much of it is late", () => {
    expect(expensesFinding({ amount: 1980, bills: 4 }, { amount: 420, bills: 1 })).toEqual({
      fact: "$1,980.00 is to pay on 4 bills.",
      rest: "1 is overdue, $420.00 in all.",
    });
    expect(expensesFinding({ amount: 0, bills: 0 }, { amount: 0, bills: 0 }).fact).toBe("Nothing is owed to suppliers.");
  });
});

describe("Books → Payments' finding", () => {
  it("says what came in this month", () => {
    expect(paymentsFinding({ amount: 1240, payments: 4 })).toEqual({ fact: "$1,240.00 came in this month.", rest: "4 payments so far." });
    expect(paymentsFinding({ amount: 0, payments: 0 }).fact).toBe("Nothing has come in this month yet.");
  });
});
