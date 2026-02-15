import { prisma } from "@/lib/prisma";
import type { AccountingPeriod } from "@prisma/client";

export function toMoney(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

export async function getLatestEntryNumber(companyId: string) {
  const latest = await prisma.journalEntry.findFirst({
    where: { companyId },
    orderBy: { entryNumber: "desc" },
    select: { entryNumber: true },
  });
  return latest?.entryNumber ?? 0;
}

export async function getNextEntryNumber(companyId: string) {
  const latest = await getLatestEntryNumber(companyId);
  return latest + 1;
}

export async function findOpenPeriodForDate(companyId: string, date: Date): Promise<AccountingPeriod | null> {
  return prisma.accountingPeriod.findFirst({
    where: {
      companyId,
      status: "OPEN",
      startDate: { lte: date },
      endDate: { gte: date },
    },
    orderBy: [{ startDate: "asc" }],
  });
}

export async function ensurePeriodForDate(companyId: string, date: Date): Promise<AccountingPeriod> {
  const existing = await findOpenPeriodForDate(companyId, date);
  if (existing) return existing;

  const periodStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const periodEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  return prisma.accountingPeriod.create({
    data: {
      companyId,
      startDate: periodStart,
      endDate: periodEnd,
      status: "OPEN",
    },
  });
}

export async function getTrialBalance(input: {
  companyId: string;
  periodId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
}) {
  const where: Record<string, unknown> = {
    entry: {
      companyId: input.companyId,
      status: "POSTED",
    },
  };

  if (input.periodId) {
    (where.entry as Record<string, unknown>).periodId = input.periodId;
  } else if (input.startDate || input.endDate) {
    (where.entry as Record<string, unknown>).entryDate = {
      ...(input.startDate ? { gte: input.startDate } : null),
      ...(input.endDate ? { lte: input.endDate } : null),
    };
  }

  const grouped = await prisma.journalLine.groupBy({
    by: ["accountId"],
    where,
    _sum: {
      debit: true,
      credit: true,
    },
  });

  const accountIds = grouped.map((row) => row.accountId);
  const accounts = await prisma.chartOfAccount.findMany({
    where: { id: { in: accountIds } },
  });
  const accountMap = new Map(accounts.map((account) => [account.id, account]));

  const rows = grouped.map((row) => {
    const account = accountMap.get(row.accountId);
    const debit = toMoney(row._sum.debit);
    const credit = toMoney(row._sum.credit);
    return {
      accountId: row.accountId,
      code: account?.code ?? "",
      name: account?.name ?? "Unknown",
      type: account?.type ?? "ASSET",
      category: account?.category ?? null,
      debit,
      credit,
      balance: debit - credit,
    };
  });

  const totals = rows.reduce(
    (acc, row) => ({
      debit: acc.debit + row.debit,
      credit: acc.credit + row.credit,
    }),
    { debit: 0, credit: 0 },
  );

  return { rows, totals };
}

export async function getFinancialStatements(input: {
  companyId: string;
  periodId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
}) {
  const trialBalance = await getTrialBalance(input);

  const incomeRows = trialBalance.rows.filter((row) => row.type === "INCOME");
  const expenseRows = trialBalance.rows.filter((row) => row.type === "EXPENSE");
  const assetRows = trialBalance.rows.filter((row) => row.type === "ASSET");
  const liabilityRows = trialBalance.rows.filter((row) => row.type === "LIABILITY");
  const equityRows = trialBalance.rows.filter((row) => row.type === "EQUITY");

  const incomeTotal = incomeRows.reduce((sum, row) => sum + (row.credit - row.debit), 0);
  const expenseTotal = expenseRows.reduce((sum, row) => sum + (row.debit - row.credit), 0);
  const netIncome = incomeTotal - expenseTotal;

  const assetTotal = assetRows.reduce((sum, row) => sum + row.balance, 0);
  const liabilityTotal = liabilityRows.reduce((sum, row) => sum + (row.credit - row.debit), 0);
  const equityTotal = equityRows.reduce((sum, row) => sum + (row.credit - row.debit), 0) + netIncome;

  return {
    trialBalance,
    profitAndLoss: {
      income: incomeRows,
      expenses: expenseRows,
      totals: {
        income: incomeTotal,
        expenses: expenseTotal,
        netIncome,
      },
    },
    balanceSheet: {
      assets: assetRows,
      liabilities: liabilityRows,
      equity: equityRows,
      totals: {
        assets: assetTotal,
        liabilities: liabilityTotal,
        equity: equityTotal,
      },
    },
  };
}

export async function getCashFlowReport(input: {
  companyId: string;
  periodId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
}) {
  const trialBalance = await getTrialBalance(input);
  const cashKeywords = ["cash", "bank"];

  const isCashAccount = (name: string, category?: string | null) => {
    const haystack = `${name} ${category ?? ""}`.toLowerCase();
    return cashKeywords.some((keyword) => haystack.includes(keyword));
  };

  const operating = trialBalance.rows.filter((row) => ["INCOME", "EXPENSE"].includes(row.type));
  const investing = trialBalance.rows.filter(
    (row) => row.type === "ASSET" && !isCashAccount(row.name, row.category),
  );
  const financing = trialBalance.rows.filter((row) => ["LIABILITY", "EQUITY"].includes(row.type));

  const operatingTotal = operating.reduce((sum, row) => sum + (row.credit - row.debit), 0);
  const investingTotal = investing.reduce((sum, row) => sum + row.balance, 0);
  const financingTotal = financing.reduce((sum, row) => sum + (row.credit - row.debit), 0);

  return {
    operating,
    investing,
    financing,
    totals: {
      operating: operatingTotal,
      investing: investingTotal,
      financing: financingTotal,
      netCash: operatingTotal + investingTotal + financingTotal,
    },
  };
}
