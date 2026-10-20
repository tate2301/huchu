import type { BankView } from "@/lib/books/bank";
import type { InvoicesView } from "@/lib/books/invoices";
import type { MoneyView } from "@/lib/books/money";

/**
 * Floorcode's books on Tuesday 6 October, as the boards draw them. The figures
 * add up across the screens: $2,480.00 overdue is 1,240 + 860 + 380, and
 * $5,724.22 owed adds 1,494.22 and 1,750.00 to it.
 */

export const FIXTURE_MONEY: MoneyView = {
  currency: "USD",
  finding: {
    fact: "$10,228.40 has come in this month.",
    rest: "$5,724.22 is owed to you, $2,480.00 of it overdue.",
  },
  period: "1 to 6 October",
  sources: [
    { key: "tills", label: "Showroom sales", detail: "273 sales on the tills", amount: 6318.4, count: 273, share: 62, bar: 100 },
    { key: "invoices", label: "Invoices", detail: "3 payments on quoted jobs", amount: 3910, count: 3, share: 38, bar: 61.882755127880486 },
  ],
  needs: [
    {
      key: "cash-up",
      lead: "Monday's cash-up is $12.00 short",
      detail: "Till 1 counted $420.60 against $432.60 in cash sales.",
      action: { label: "Review", href: "#review" },
    },
    {
      key: "won-deal",
      lead: "A won deal has no invoice",
      detail: "Borrowdale Brooke Clinic, vinyl in 3 consulting rooms, $6,400.00.",
      action: { label: "Write it", href: "#write" },
    },
    {
      key: "overdue",
      lead: "3 invoices are overdue",
      detail: "$2,480.00 in all. Chisipite Dental is 12 days late.",
      action: { label: "Remind", href: "#remind" },
    },
    { key: "bank", lead: "4 bank lines to match", detail: "CBZ, since Friday.", action: { label: "Match", href: "#match" } },
  ],
  bank: {
    total: 8412.75,
    accounts: [
      { id: "cbz-usd", name: "CBZ, USD", currency: "USD", amount: 7950.3 },
      { id: "cbz-zwg", name: "CBZ, ZWG", currency: "ZWG", amount: 12393.66 },
    ],
    asOf: "Today 06:00",
  },
  owe: {
    rows: [
      { label: "Halsted Builders", amount: 312.4, currency: "USD" },
      { label: "VAT, September", amount: 1184.6, currency: "USD" },
    ],
    vatDue: "25 October",
  },
};

const invoice = (
  id: string,
  customer: string,
  state: InvoicesView["rows"][number]["state"],
  stateLabel: string,
  when: string,
  total: number,
  balance: number,
  daysOverdue = 0,
): InvoicesView["rows"][number] => ({
  id,
  number: id,
  customer: { id: `c-${id}`, name: customer },
  state,
  stateLabel,
  when,
  total,
  balance,
  currency: "USD",
  daysOverdue,
  fiscalFailed: false,
});

export const FIXTURE_INVOICES: InvoicesView = {
  finding: { fact: "$5,724.22 is owed to you on 5 invoices.", rest: "3 are overdue, $2,480.00 in all." },
  rows: [
    invoice("INV-0131", "Chisipite Dental", "overdue", "Overdue", "12 days overdue", 1240, 1240, 12),
    invoice("INV-0135", "Highlands Guest Lodge", "overdue", "Overdue", "5 days overdue", 860, 860, 5),
    invoice("INV-0137", "Msasa Motors", "overdue", "Overdue", "2 days overdue", 380, 380, 2),
    invoice("INV-0142", "Pomona Offices", "part-paid", "Part paid", "Due 20 Oct", 1994.22, 1494.22),
    invoice("INV-0140", "Borrowdale Brooke Clinic", "sent", "Sent", "Due 14 Oct", 1750, 1750),
    invoice("INV-0141", "Mrs T. Gumbo", "paid", "Paid", "Paid 5 Oct, cash", 430, 0),
    invoice("INV-0139", "Greystone Park Primary", "paid", "Paid", "Paid 2 Oct, transfer", 2980, 0),
    invoice("INV-0138", "Avondale Fresh Mart", "paid", "Paid", "Paid 30 Sep, EcoCash", 1865, 0),
    invoice("INV-0136", "Dr N. Sibanda", "paid", "Paid", "Paid 29 Sep, card", 1130, 0),
  ],
  range: { from: 1, to: 9, of: 142 },
  owed: 5724.22,
  overdue: 2480,
  currency: "USD",
  customers: [],
  currencies: ["USD"],
  counts: { all: 142, owed: 5, overdue: 3, paid: 137, drafts: 0, void: 0 },
  query: { view: "all", q: "", customer: null, currency: null, period: "any", sort: "newest", page: 1 },
};

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
