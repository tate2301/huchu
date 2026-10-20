import { describe, expect, it } from "vitest";

import { lastWholeMonth, monthEnd, openingMonth, sourceHref, yearStart } from "../ledger-pages";
import { yearToDate } from "./accountant-export";
import { balanceSheet, cashFlowKind, isCostOfSales, profitAndLoss, trialBalanceOf, type LedgerAccount, type Movement } from "./ledger";
import { checkLines, needsSecondPerson } from "./manual-journals";

const account = (id: string, code: string, type: string, category: string | null = null, name = id): LedgerAccount => ({ id, code, name, type, category, nodeType: "LEDGER", parentId: null, isActive: true });
const accounts = [
  account("bank", "1010", "ASSET", "Cash", "CBZ current"),
  account("owed", "1100", "ASSET", "Receivables", "Owed to you"),
  account("van", "1500", "ASSET", "Fixed assets", "Vans and equipment"),
  account("vat", "2200", "LIABILITY", "Tax", "Output VAT"),
  account("loan", "2300", "LIABILITY", "Loans", "Vehicle loan"),
  account("capital", "3000", "EQUITY", "Equity", "Owner's capital"),
  account("sales", "4000", "INCOME", "Revenue", "Flooring jobs"),
  account("cogs", "5000", "EXPENSE", "COGS", "Materials used"),
  account("rent", "6200", "EXPENSE", "Operations", "Rent"),
];
const moved = (rows: Record<string, [number, number]>) => new Map<string, Movement>(Object.entries(rows).map(([id, [debit, credit]]) => [id, { debit, credit }]));
// Capital 10,000 in; a 1,150 sale (150 VAT) half paid; 400 materials; 300 rent; a 5,000 van on a loan.
const month = moved({ bank: [10_575, 700], owed: [1_150, 575], van: [5_000, 0], vat: [0, 150], loan: [0, 5_000], capital: [0, 10_000], sales: [0, 1_000], cogs: [400, 0], rent: [300, 0] });

describe("the ledger's reports, from one read (books-final §3.3 Ledger)", () => {
  it("puts each balance on its side and balances", () => {
    const tb = trialBalanceOf(accounts, month);
    expect(tb.rows.find((row) => row.code === "1010")).toMatchObject({ debit: 9_875, credit: 0 });
    expect(tb.rows.find((row) => row.code === "4000")).toMatchObject({ debit: 0, credit: 1_000 });
    expect(tb.debit).toBe(tb.credit);
    expect(tb.difference).toBe(0);
    expect(trialBalanceOf(accounts, moved({ bank: [5, 5] })).rows).toEqual([]);
  });

  it("works out gross profit and profit, cost of sales apart", () => {
    expect(isCostOfSales(accounts[7])).toBe(true);
    expect(isCostOfSales(accounts[8])).toBe(false);
    const pl = profitAndLoss(accounts, [month]);
    expect(pl.income).toEqual([1_000]);
    expect(pl.gross).toEqual([600]);
    expect(pl.profit).toEqual([300]);
  });

  it("keeps the balance sheet's two sides equal with the unclosed profit under equity", () => {
    const bs = balanceSheet(accounts, [month]);
    expect(bs.assets[0]).toBe(9_875 + 575 + 5_000);
    expect(bs.liabilitiesAndEquity[0]).toBe(bs.assets[0]);
    expect(bs.sections[2].lines.at(-1)).toMatchObject({ label: "Profit not yet closed", amounts: [300] });
  });

  it("files cash by the account it came from", () => {
    expect(cashFlowKind(accounts[6])).toBe("operating");
    expect(cashFlowKind(accounts[2])).toBe("investing");
    expect(cashFlowKind(accounts[4])).toBe("financing");
    expect(cashFlowKind(accounts[5])).toBe("financing");
  });
});

describe("periods", () => {
  it("opens on the last whole month, or this one when the books started after it", () => {
    expect(lastWholeMonth("2026-10-18")).toBe("2026-09");
    expect(lastWholeMonth("2026-01-05")).toBe("2025-12");
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(openingMonth("2026-10-18", "2026-03-01")).toBe("2026-09");
    expect(openingMonth("2026-10-18", "2026-10-05")).toBe("2026-10");
    expect(yearStart("2026-09", 1, "2026-03-01")).toBe("2026-03-01");
    expect(yearStart("2026-09", 7, null)).toBe("2026-07-01");
    expect(yearStart("2026-03", 7, null)).toBe("2025-07-01");
    expect(yearToDate("2026-10-20", 1)).toEqual({ from: "2026-01-01", to: "2026-10-20" });
  });

  it("opens a line's document, or its journal", () => {
    expect(sourceHref({ entryId: "e", sourceType: "SALES_INVOICE", sourceId: "inv:revision-1" })).toBe("/books/invoices/inv");
    expect(sourceHref({ entryId: "e", sourceType: "MANUAL", sourceId: null })).toBe("/books/journals?journal=e");
  });
});

describe("manual journals (books-final §4.14)", () => {
  it("takes lines that balance, each one side", () => {
    const line = (debit: number, credit: number) => ({ accountId: "a", debit, credit });
    expect(checkLines([line(240, 0), line(0, 240)])).toBeNull();
    expect(checkLines([line(240, 0)])).toMatch(/two lines/);
    expect(checkLines([line(240, 0), line(0, 200)])).toMatch(/must be equal/);
    expect(checkLines([line(240, 240), line(0, 0), line(0, 0)])).toMatch(/two lines/);
  });

  it("asks a second person over the limit, never for the owner", () => {
    expect(needsSecondPerson({ role: "FINANCE_OFFICER" }, 1_450, 1_000)).toBe(true);
    expect(needsSecondPerson({ role: "FINANCE_OFFICER" }, 980, 1_000)).toBe(false);
    expect(needsSecondPerson({ role: "SUPERADMIN" }, 50_000, 1_000)).toBe(false);
    expect(needsSecondPerson({ role: "MANAGER" }, 50_000, 0)).toBe(false);
  });
});
