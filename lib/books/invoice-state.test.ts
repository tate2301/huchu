import { describe, expect, it } from "vitest";

import { invoiceState, invoicesFinding, type InvoiceFacts } from "./invoice-state";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const facts = (over: Partial<InvoiceFacts>): InvoiceFacts => ({
  status: "ISSUED",
  invoiceDate: day("2026-09-20"),
  dueDate: day("2026-09-24"),
  total: 1240,
  amountPaid: 0,
  creditTotal: 0,
  writeOffTotal: 0,
  lastReceipt: null,
  ...over,
});

describe("invoiceState", () => {
  const today = "2026-10-06";

  it("reads overdue in days", () => {
    expect(invoiceState(facts({}), today)).toEqual({ state: "overdue", when: "12 days overdue", balance: 1240, daysOverdue: 12 });
  });

  it("reads part paid and sent by their due day", () => {
    expect(invoiceState(facts({ total: 1994.22, amountPaid: 500, dueDate: day("2026-10-20") }), today)).toMatchObject({
      state: "part-paid",
      when: "Due 20 Oct",
      balance: 1494.22,
    });
    expect(invoiceState(facts({ dueDate: day("2026-10-14") }), today)).toMatchObject({ state: "sent", when: "Due 14 Oct" });
  });

  it("reads paid with the day and how", () => {
    expect(
      invoiceState(facts({ status: "PAID", amountPaid: 430, total: 430, lastReceipt: { receivedAt: day("2026-10-05"), method: "Cash" } }), today),
    ).toMatchObject({ state: "paid", when: "Paid 5 Oct, cash", balance: 0 });
    expect(
      invoiceState(facts({ status: "PAID", amountPaid: 1865, total: 1865, lastReceipt: { receivedAt: day("2026-09-30"), method: "ECOCASH" } }), today).when,
    ).toBe("Paid 30 Sep, EcoCash");
  });

  it("counts credit notes and write-offs as settling it", () => {
    expect(invoiceState(facts({ amountPaid: 1000, creditTotal: 240 }), today).state).toBe("paid");
  });
});

describe("invoicesFinding", () => {
  it("says what is owed and how much is late", () => {
    expect(invoicesFinding({ amount: 5724.22, invoices: 5 }, { amount: 2480, invoices: 3 })).toEqual({
      fact: "US$5,724.22 is owed to you on 5 invoices.",
      rest: "3 are overdue, US$2,480.00 in all.",
    });
    expect(invoicesFinding({ amount: 0, invoices: 0 }, { amount: 0, invoices: 0 }).fact).toBe("Nothing is owed to you.");
    expect(invoicesFinding({ amount: 860, invoices: 1 }, { amount: 860, invoices: 1 }).rest).toBe("It is overdue.");
  });
});
