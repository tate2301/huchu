import { describe, expect, it } from "vitest";

import { accountsFinding, accountSub } from "./bank-accounts";
import { fiscalFinding } from "./fiscal-page";
import { itf263State } from "./itf263";
import { rangeWords, reconciliationsFinding } from "./reconciliations";
import { dueFinding, dueWhat, type DueRow } from "./tax-due";
import { dueCalendar } from "./tax-labels";
import { vatLines, vatPageFinding, type VatReturnView } from "./vat-return-page";
import { itf263Words, withholdingFinding } from "./withholding-page";

/** The P3b screens' pure parts: findings, words and sums the Bank & cash and Tax pages show. */

describe("Bank & cash", () => {
  it("names an account by its last four digits and its ledger code", () => {
    expect(accountSub("0112004471", "1010", "bank")).toBe("Ending 4471 · 1010");
    expect(accountSub("0412", "1020", "mobile")).toBe("Merchant 0412 · 1020");
    expect(accountSub(null, null, "cash")).toBe("Cash");
  });

  it("says what is held today, and which account has the most lines to match", () => {
    const row = (name: string, kind: "bank" | "mobile" | "cash", currency: string, balance: number, inBase: number | null, toMatch = 0) => ({ id: name, name, sub: "", kind, currency, balance, inBase, lastReconciled: null, toMatch });
    expect(accountsFinding([row("CBZ current, USD", "bank", "USD", 18412.75, null, 4), row("CBZ current, ZWG", "bank", "ZWG", 61280.4, 2269.64), row("EcoCash merchant", "mobile", "USD", 1086.5, null), row("Showroom cash box", "cash", "USD", 833.2, null)], "USD")).toEqual({
      fact: "US$22,602.09 is in your bank, EcoCash and cash today.",
      rest: "CBZ current, USD has 4 lines to match.",
    });
    expect(accountsFinding([], "USD").fact).toBe("No money account yet.");
  });

  it("says which reconciliation is out and which is ready to close", () => {
    const rec = (account: string, state: "open" | "ready" | "closed", difference: number | null, currency = "USD") => ({ id: account, accountId: account, account, currency, period: "", statementEnd: "16 Oct", closingBalance: 0, unmatched: 0, difference, state, closed: null });
    expect(reconciliationsFinding([rec("CBZ current, USD", "open", 758.31), rec("CBZ current, ZWG", "ready", 0, "ZWG")])).toEqual({ fact: "CBZ current, USD is US$758.31 out.", rest: "CBZ current, ZWG is ready to close." });
    expect(reconciliationsFinding([rec("CBZ current, USD", "closed", 0)]).fact).toBe("Every account is reconciled.");
    expect(rangeWords("2026-10-01", "2026-10-16")).toBe("1 to 16 Oct");
    expect(rangeWords("2026-09-28", "2026-10-16")).toBe("28 Sep to 16 Oct");
  });
});

describe("Tax", () => {
  const due = (date: string, what: string, amount: number | null, state: DueRow["state"] = "Due"): DueRow => ({ date, day: "", kind: "VAT_PAYMENT", tax: "vat", what, period: "October", amount, settledBy: "", state, toConfirm: false, why: null });

  it("writes what a date asks for in the board's words", () => {
    expect(dueWhat({ kind: "VAT_RETURN", label: "" })).toBe("File the VAT 7 return");
    expect(dueWhat({ kind: "QPD_PAYMENT", label: "Fourth QPD for 2026 (35%)" })).toBe("Provisional tax, 4th instalment");
    expect(dueWhat({ kind: "WHT_PAYMENT", label: "" })).toBe("Pay the 30% withheld");
  });

  it("says what is next and what the month asks to be paid", () => {
    const rows = [
      due("2026-10-15", "Pay VAT", 1184.6, "Paid"),
      due("2026-11-05", "File the PAYE return", 1799.62),
      due("2026-11-05", "File the 30% withholding return", 557.87),
      due("2026-11-10", "Pay the 30% withheld", 557.87),
      due("2026-11-15", "Pay VAT", 1968.46),
    ];
    expect(dueFinding(rows, "2026-10-18", "USD")).toEqual({ fact: "Next: the PAYE return and 30% withholding return on 5 November.", rest: "US$2,526.33 is due in November." });
    expect(dueFinding([due("2026-10-10", "File the VAT 7 return", 10)], "2026-10-18", "USD").fact).toBe("File the VAT 7 return was due on 10 Oct.");
  });

  it("writes the dates as a calendar file", () => {
    const ics = dueCalendar([{ date: "2026-11-05", what: "File the PAYE return", period: "October" }]);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261105");
    expect(ics).toContain("DTEND;VALUE=DATE:20261106");
    expect(ics).toContain("SUMMARY:File the PAYE return\\, October");
  });

  it("adds up a return per currency or all in the base, credit notes taking away", () => {
    const sources = [
      { key: "invoices" as const, side: "output" as const, label: "", currency: "USD", count: 6, value: 4930.05, vat: 764.17, baseValue: 4930.05, baseVat: 764.17 },
      { key: "invoices" as const, side: "output" as const, label: "", currency: "ZWG", count: 1, value: 13500, vat: 1811.69, baseValue: 500, baseVat: 67.1 },
      { key: "credit-notes" as const, side: "output" as const, label: "", currency: "USD", count: 3, value: -991.34, vat: -153.66, baseValue: -991.34, baseVat: -153.66 },
      { key: "bills" as const, side: "input" as const, label: "", currency: "USD", count: 4, value: 3995.67, vat: 619.33, baseValue: 3995.67, baseVat: 619.33 },
    ];
    const all = vatLines(sources, "all", "USD");
    expect(all.totals).toMatchObject({ output: 677.61, input: 619.33, net: 58.28, documents: 14 });
    const zig = vatLines(sources, "ZWG", "USD");
    expect(zig.currency).toBe("ZWG");
    expect(zig.totals.output).toBe(1811.69);
  });

  it("asks for the explanation while a return differs from the ledger, and the filing once it is finalised", () => {
    const view = (state: VatReturnView["state"], ties: boolean) =>
      ({ state, period: { start: "2026-10-01", end: "2026-10-31", words: "October 2026" }, returnDue: "2026-11-10", paymentDue: "2026-11-15", totals: { net: 1968.46 }, tieOut: { ties }, reference: null }) as unknown as VatReturnView;
    expect(vatPageFinding(view("draft", true), "2026-10-18", "USD")).toEqual({ fact: "October’s VAT stands at US$1,968.46 so far.", rest: "Return by 10 November, payment by 15 November." });
    expect(vatPageFinding(view("reviewed", false), "2026-11-02", "USD").rest).toBe("It differs from the ledger: explain the difference before finalising.");
    expect(vatPageFinding(view("finalised", false), "2026-11-02", "USD").rest).toBe("File it in TaRMS by 10 November.");
  });

  it("names a supplier's tax clearance and what will be withheld from them", () => {
    const on = new Date("2026-10-18T00:00:00Z");
    expect(itf263State({ itf263Number: "0041-77213", itf263ExpiresAt: new Date("2026-06-30T00:00:00Z") }, on)).toEqual({ state: "Expired", label: "Expired 30 Jun 2026", expires: "30 Jun 2026" });
    expect(itf263State({ itf263Number: "0077-11820", itf263ExpiresAt: new Date("2026-12-31T00:00:00Z") }, on).label).toBe("Valid to 31 Dec 2026");
    expect(itf263State({ itf263Number: null, itf263ExpiresAt: null }, on).state).toBe("None");
    expect(itf263Words({ itf263Number: "0041-77213", itf263ExpiresAt: new Date("2026-06-30T00:00:00Z") }, on)).toBe("ITF263 expired 30 Jun");
    const waiting = [{ id: "p", number: null, date: "18 Oct", supplier: { id: "v", name: "Mutare Timber Works" }, itf263: "ITF263 expired 30 Jun", gross: 1859.55, withheld: 557.87, currency: "USD", state: "To approve" as const, certificateNo: null }];
    expect(withholdingFinding(waiting, 0, 2, "USD")).toEqual({ fact: "US$557.87 will be withheld from Mutare Timber Works.", rest: "Its ITF263 expired on 30 Jun." });
    expect(withholdingFinding([], 624, 2, "USD")).toEqual({ fact: "US$624.00 was withheld this year.", rest: "2 suppliers have no valid ITF263." });
  });

  it("says which fiscal day is open and what is not signed", () => {
    expect(fiscalFinding({ no: 124, receipts: 31 }, [{ number: "INV-0144", sentDay: "2026-10-16" }], "2026-10-18")).toEqual({ fact: "Fiscal day 124 is open with 31 receipts signed.", rest: "INV-0144 from Friday isn’t signed." });
    expect(fiscalFinding(null, [], "2026-10-18")).toEqual({ fact: "No fiscal day is open.", rest: "Every document sent is signed." });
  });
});
