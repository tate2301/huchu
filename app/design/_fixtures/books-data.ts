import type { BankView } from "@/lib/books/bank";

/**
 * Floorcode's books on Tuesday 6 October, as the boards draw them. The figures
 * add up across the screens: $2,480.00 overdue is 1,240 + 860 + 380, and
 * $5,724.22 owed adds 1,494.22 and 1,750.00 to it.
 */

export const FIXTURE_BANK: BankView = {
  accounts: [{ id: "cbz-usd", label: "CBZ, USD", bank: "CBZ", currency: "USD", last4: "4471" }],
  account: { id: "cbz-usd", label: "CBZ, USD", bank: "CBZ", currency: "USD", last4: "4471" },
  tab: "to-match",
  counts: { toMatch: 4, matched: 57, excluded: 0, everything: 61 },
  proposed: 3,
  statementTo: "Fri 16 Oct",
  sums: { in: 1412.5, out: 330.4 },
  finding: {
    fact: "4 lines from CBZ since Friday are not matched.",
    rest: "Vane matched 3 of them overnight. Nothing is matched until you accept it.",
  },
  lines: [
    {
      id: "l1",
      day: "Fri 2 Oct",
      description: "EcoCash merchant settlement 0412",
      amount: "+$1,412.50",
      moneyIn: true,
      value: 1412.50,
      locked: false,
      state: "proposed",
      proposal: {
        kind: "ecocash",
        match: { kind: "ecocash", day: "2026-10-01", amount: 1412.5 },
        title: "Showroom, EcoCash sales on 1 Oct",
        source: "Tender",
        reason: "EcoCash pays the tills out the next day. Thursday's EcoCash sales came to the same amount.",
      },
      reason: null,
      suggestion: null,
      matchedTo: null,
    },
    {
      id: "l2",
      day: "Mon 5 Oct",
      description: "Transfer Pomona Offices inv142",
      amount: "+$500.00",
      moneyIn: true,
      value: 500.00,
      locked: false,
      state: "proposed",
      proposal: {
        kind: "invoice",
        match: { kind: "invoice", invoiceId: "inv-142", amount: 500 },
        title: "INV-0142, Pomona Offices, part payment",
        source: "Books",
        reason: "The reference names the invoice. It leaves $1,494.22 owing.",
      },
      reason: null,
      suggestion: null,
      matchedTo: null,
    },
    {
      id: "l3",
      day: "Mon 5 Oct",
      description: "Halsted Builders supplies",
      amount: "−$312.40",
      moneyIn: false,
      value: -312.40,
      locked: false,
      state: "proposed",
      proposal: {
        kind: "bill",
        match: { kind: "bill", billId: "bill-1", amount: 312.4 },
        title: "Bill from Halsted Builders, adhesive and screed",
        source: "Books",
        reason: "Same amount and supplier as the one bill you owe them.",
      },
      reason: null,
      suggestion: null,
      matchedTo: null,
    },
    {
      id: "l4",
      day: "Tue 6 Oct",
      description: "Service fee October",
      amount: "−$18.00",
      moneyIn: false,
      value: -18.00,
      locked: false,
      state: "unmatched",
      proposal: null,
      reason: "No invoice or bill matches. It looks like CBZ's monthly charge, which you filed under bank charges in September.",
      suggestion: {
        kind: "bank-charges",
        match: { kind: "bank-charges", amount: 18 },
        title: "Bank charges",
        source: "Books",
        reason: "Filed under bank charges.",
      },
      matchedTo: null,
    },
  ],
};
