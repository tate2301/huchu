import ExcelJS from "exceljs";
import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { balanceSheet, cashFlow, ledgerAccounts, movements, profitAndLoss, trialBalanceOf, type CashFlow, type StatementSection, type TrialBalance } from "./ledger";

/**
 * The accountant export (books-final §3.2 "In Management", §5.11, §8 P5):
 * the trial balance at the period's end, the general ledger for the period,
 * and the profit and loss, balance sheet and cash flow, as one workbook. It
 * is core: a workspace without Books' screens downloads it from Management,
 * and its trial balance is the same read the Trial balance page shows
 * (`lib/books/core/ledger.ts`), so the two agree to the cent.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type AccountantExportPeriod = { from: string; to: string };

export type GeneralLedgerRow = { code: string; account: string; date: string; entry: string; memo: string; source: string; debit: number; credit: number; balance: number };

export type AccountantExport = {
  company: string;
  baseCurrency: string;
  period: AccountantExportPeriod;
  trialBalance: TrialBalance;
  generalLedger: GeneralLedgerRow[];
  profitAndLoss: { sections: StatementSection[]; gross: number; profit: number };
  balanceSheet: { sections: StatementSection[]; assets: number; liabilitiesAndEquity: number };
  cashFlow: CashFlow;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const dayAfter = (iso: string) => {
  const date = day(iso);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};
const dayBefore = (iso: string) => {
  const date = day(iso);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

/** The financial year so far, as of a day: the year's first day to that day. Pure. */
export function yearToDate(today: string, fyStartMonth = 1): AccountantExportPeriod {
  const [y, m] = today.split("-").map(Number);
  const year = m >= fyStartMonth ? y : y - 1;
  return { from: `${year}-${String(fyStartMonth).padStart(2, "0")}-01`, to: today };
}

export async function accountantExport(companyId: string, period: AccountantExportPeriod, db: Db = prisma): Promise<AccountantExport> {
  const [company, settings, accounts, atEnd, inPeriod, before] = await Promise.all([
    db.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    db.accountingSettings.findUnique({ where: { companyId }, select: { baseCurrency: true, legalName: true } }),
    ledgerAccounts(db, companyId),
    movements(db, companyId, { to: period.to }),
    movements(db, companyId, { from: period.from, to: period.to }),
    movements(db, companyId, { to: dayBefore(period.from) }),
  ]);
  const lines = await db.journalLine.findMany({
    where: { entry: { companyId, status: "POSTED", entryDate: { gte: day(period.from), lt: day(dayAfter(period.to)) } } },
    select: { accountId: true, debit: true, credit: true, entry: { select: { entryNumber: true, entryDate: true, description: true, sourceType: true } } },
    orderBy: [{ entry: { entryDate: "asc" } }, { entry: { entryNumber: "asc" } }, { createdAt: "asc" }],
  });
  const byAccount = new Map<string, typeof lines>();
  for (const line of lines) byAccount.set(line.accountId, [...(byAccount.get(line.accountId) ?? []), line]);
  const generalLedger: GeneralLedgerRow[] = [];
  for (const account of accounts) {
    const own = byAccount.get(account.id) ?? [];
    const opening = round2((before.get(account.id)?.debit ?? 0) - (before.get(account.id)?.credit ?? 0));
    if (own.length === 0 && Math.abs(opening) < 0.005) continue;
    let balance = opening;
    generalLedger.push({ code: account.code, account: account.name, date: period.from, entry: "", memo: "Opening balance", source: "", debit: 0, credit: 0, balance });
    for (const line of own) {
      balance = round2(balance + line.debit - line.credit);
      generalLedger.push({
        code: account.code,
        account: account.name,
        date: line.entry.entryDate.toISOString().slice(0, 10),
        entry: line.entry.entryNumber > 0 ? `JE-${String(line.entry.entryNumber).padStart(4, "0")}` : "",
        memo: line.entry.description,
        source: line.entry.sourceType,
        debit: round2(line.debit),
        credit: round2(line.credit),
        balance,
      });
    }
  }
  const pl = profitAndLoss(accounts, [inPeriod]);
  const bs = balanceSheet(accounts, [atEnd]);
  return {
    company: settings?.legalName || company?.name || "",
    baseCurrency: settings?.baseCurrency ?? "USD",
    period,
    trialBalance: trialBalanceOf(accounts, atEnd),
    generalLedger,
    profitAndLoss: { sections: pl.sections, gross: pl.gross[0], profit: pl.profit[0] },
    balanceSheet: { sections: bs.sections, assets: bs.assets[0], liabilitiesAndEquity: bs.liabilitiesAndEquity[0] },
    cashFlow: await cashFlow(companyId, { from: period.from, to: period.to }, db),
  };
}

/** The export as an Excel workbook: one sheet each, amounts as numbers with two decimals. */
export async function accountantWorkbook(data: AccountantExport): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "Corelith Books";
  const title = `${data.company}, ${data.period.from} to ${data.period.to}, ${data.baseCurrency}`;
  const sheet = (name: string, head: string[], widths: number[]) => {
    const ws = book.addWorksheet(name);
    ws.addRow([title]).font = { bold: true };
    ws.addRow([]);
    ws.addRow(head).font = { bold: true };
    widths.forEach((width, index) => (ws.getColumn(index + 1).width = width));
    return ws;
  };
  const money = (ws: ExcelJS.Worksheet, columns: number[]) => columns.forEach((column) => (ws.getColumn(column).numFmt = "#,##0.00;[Red]-#,##0.00"));
  const blank = (n: number) => (Math.abs(n) < 0.005 ? null : n);

  const tb = sheet("Trial balance", ["Code", "Account", "Type", "Debit", "Credit"], [10, 40, 14, 16, 16]);
  for (const row of data.trialBalance.rows) tb.addRow([row.code, row.name, row.type, blank(row.debit), blank(row.credit)]);
  tb.addRow(["", "Total", "", data.trialBalance.debit, data.trialBalance.credit]).font = { bold: true };
  money(tb, [4, 5]);

  const gl = sheet("General ledger", ["Code", "Account", "Date", "Entry", "Memo", "Source", "Debit", "Credit", "Balance"], [10, 30, 12, 10, 44, 22, 14, 14, 16]);
  for (const row of data.generalLedger) gl.addRow([row.code, row.account, row.date, row.entry, row.memo, row.source, blank(row.debit), blank(row.credit), row.balance]);
  money(gl, [7, 8, 9]);

  const statement = (name: string, sections: StatementSection[], totals: Array<[string, number]>) => {
    const ws = sheet(name, ["", "Amount"], [44, 18]);
    for (const section of sections) {
      if (section.lines.length === 0) continue;
      ws.addRow([section.title]).font = { bold: true };
      for (const line of section.lines) ws.addRow([`  ${line.label}`, line.amounts[0]]);
      ws.addRow([`Total ${section.title.toLowerCase()}`, section.total[0]]).font = { bold: true };
    }
    for (const [label, amount] of totals) ws.addRow([label, amount]).font = { bold: true };
    money(ws, [2]);
  };
  statement("Profit and loss", data.profitAndLoss.sections, [["Gross profit", data.profitAndLoss.gross], [data.profitAndLoss.profit < 0 ? "Loss" : "Profit", data.profitAndLoss.profit]]);
  statement("Balance sheet", data.balanceSheet.sections, [["Liabilities and equity", data.balanceSheet.liabilitiesAndEquity]]);
  statement(
    "Cash flow",
    data.cashFlow.sections.map((section) => ({ key: section.key, title: section.title, lines: section.lines, total: [section.total] })),
    [["Cash at the start", data.cashFlow.opening], ["Net", data.cashFlow.net], ["Cash at the end", data.cashFlow.closing]],
  );
  return Buffer.from(await book.xlsx.writeBuffer());
}
