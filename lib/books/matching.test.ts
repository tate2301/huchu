import { describe, expect, it } from "vitest";

import { invoiceReferences, proposeMatch, type MatchCandidates, type StatementLineInput } from "./matching";

/** The board's four CBZ lines (design/core-modules/html/books-bank.html) and what they meet. */
const candidates: MatchCandidates = {
  invoices: [
    { id: "inv-142", number: "INV-0142", customer: "Pomona Offices", balance: 1994.22, currency: "USD" },
    { id: "inv-131", number: "INV-0131", customer: "Chisipite Dental", balance: 1240, currency: "USD" },
  ],
  bills: [{ id: "bill-1", number: "BILL-0031", vendor: "Halsted Builders", balance: 312.4, currency: "USD", what: "adhesive and screed" }],
  ecocash: [{ day: "2026-10-01", site: "Showroom", amount: 1412.5 }],
  transactions: [],
  bankName: "CBZ",
  chargesFiledBefore: () => "2026-09-06",
};

const line = (over: Partial<StatementLineInput>): StatementLineInput => ({
  id: "l",
  date: "2026-10-05",
  description: "",
  reference: null,
  amount: 0,
  direction: "CREDIT",
  ...over,
});

describe("proposeMatch", () => {
  it("matches an EcoCash settlement to the day before's EcoCash takings", () => {
    const result = proposeMatch(line({ date: "2026-10-02", description: "EcoCash merchant settlement 0412", amount: 1412.5 }), candidates);
    expect(result).toMatchObject({
      match: { kind: "ecocash", day: "2026-10-01" },
      title: "Showroom, EcoCash sales on 1 Oct",
      source: "Tender",
      reason: "EcoCash pays the tills out the next day. Thursday's EcoCash sales came to the same amount.",
    });
  });

  it("matches a transfer whose reference names the invoice, and says what is left", () => {
    const result = proposeMatch(line({ description: "Transfer Pomona Offices inv142", amount: 500 }), candidates);
    expect(result).toMatchObject({
      match: { kind: "invoice", invoiceId: "inv-142", amount: 500 },
      title: "INV-0142, Pomona Offices, part payment",
      reason: "The reference names the invoice. It leaves US$1,494.22 owing.",
    });
  });

  it("matches money out to a supplier's one bill for that amount", () => {
    const result = proposeMatch(line({ description: "Halsted Builders supplies", amount: 312.4, direction: "DEBIT" }), candidates);
    expect(result).toMatchObject({
      match: { kind: "bill", billId: "bill-1" },
      title: "Bill from Halsted Builders, adhesive and screed",
      reason: "Same amount and supplier as the one bill you owe them.",
    });
  });

  it("proposes nothing for the bank's fee, and suggests bank charges as filed before", () => {
    const result = proposeMatch(line({ date: "2026-10-06", description: "Service fee October", amount: 18, direction: "DEBIT" }), candidates);
    expect(result.match).toBeNull();
    expect(result).toMatchObject({
      reason: "No invoice or bill matches. It looks like CBZ's monthly charge, which you filed under bank charges in September.",
      suggestion: { match: { kind: "bank-charges", amount: 18 }, title: "Bank charges" },
    });
  });

  it("will not take more than is owed on the invoice the reference names", () => {
    const result = proposeMatch(line({ description: "inv131 payment", amount: 2000 }), candidates);
    expect(result.match).toBeNull();
  });

  it("matches a transaction already recorded within three days, and only one", () => {
    const one = { ...candidates, transactions: [{ id: "t1", date: "2026-10-03", description: "Cash banked", amount: 640, direction: "CREDIT" as const }] };
    expect(proposeMatch(line({ description: "Deposit", amount: 640 }), one)).toMatchObject({ match: { kind: "transaction", transactionId: "t1" } });
    const two = { ...one, transactions: [...one.transactions, { ...one.transactions[0], id: "t2" }] };
    expect(proposeMatch(line({ description: "Deposit", amount: 640 }), two).match).toBeNull();
    const far = { ...candidates, transactions: [{ ...one.transactions[0], date: "2026-09-28" }] };
    expect(proposeMatch(line({ description: "Deposit", amount: 640 }), far).match).toBeNull();
  });
});

describe("invoiceReferences", () => {
  it("reads the ways a customer writes an invoice number", () => {
    expect(invoiceReferences("Transfer Pomona Offices inv142")).toEqual([142]);
    expect(invoiceReferences("PAYMENT INV-0142")).toEqual([142]);
    expect(invoiceReferences("Invoice no. 0131 and inv 137")).toEqual([131, 137]);
    expect(invoiceReferences("Investment 2026")).toEqual([]);
  });
});
